import type { Job } from '../api';
import { IDLE_TRANSFER, sectionOf, stageOf, statusLine, tapeOf, transferReducer, type Transfer } from '../jobState';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j',
  url: 'https://instagram.com/p/x',
  platform: 'instagram',
  item_index: 0,
  mode: 'media',
  quality: 'max',
  status: 'queued',
  progress: 0,
  bytes_done: null,
  bytes_total: null,
  speed: null,
  eta: null,
  title: 't',
  author: null,
  thumbnail: null,
  file: null,
  error: null,
  created_at: 0,
  finished_at: null,
  ...over,
});

describe('transferReducer', () => {
  it('walks waiting → transferring → writing → saved', () => {
    let t: Transfer = IDLE_TRANSFER;
    t = transferReducer(t, { type: 'start', received: 0, total: 100 });
    expect(t.phase).toBe('transferring');
    t = transferReducer(t, { type: 'progress', received: 40, total: 100 });
    t = transferReducer(t, { type: 'progress', received: 30, total: 100 });
    expect(t.received).toBe(40);
    t = transferReducer(t, { type: 'downloaded' });
    expect(t).toMatchObject({ phase: 'writing', received: 100 });
    t = transferReducer(t, { type: 'saved' });
    expect(t.phase).toBe('saved');
    expect(transferReducer(t, { type: 'fail', failure: 'transfer' }).phase).toBe('saved');
    expect(transferReducer(t, { type: 'reset' }).phase).toBe('saved');
  });
  it('ignores out-of-order events and can fail and reset', () => {
    expect(transferReducer(IDLE_TRANSFER, { type: 'saved' })).toBe(IDLE_TRANSFER);
    expect(transferReducer(IDLE_TRANSFER, { type: 'progress', received: 5, total: 9 })).toBe(IDLE_TRANSFER);
    const failed = transferReducer({ phase: 'transferring', received: 10, total: 100 }, { type: 'fail', failure: 'storage' });
    expect(failed).toMatchObject({ phase: 'failed', failure: 'storage', received: 10 });
    expect(transferReducer(failed, { type: 'reset' })).toEqual(IDLE_TRANSFER);
  });
});

describe('stage, section and tape', () => {
  it('maps server status and transfer to stages', () => {
    expect(stageOf(job({ status: 'running' }))).toBe('running');
    expect(stageOf(job({ status: 'done' }))).toBe('ready');
    expect(stageOf(job({ status: 'done' }), { phase: 'transferring', received: 1, total: 2 })).toBe('transferring');
    expect(stageOf(job({ status: 'done' }), { phase: 'failed', received: 1, total: 2, failure: 'transfer' })).toBe('transferFailed');
    expect(stageOf(job({ status: 'error' }))).toBe('error');
  });
  it('sections', () => {
    expect(sectionOf('writing')).toBe('progress');
    expect(sectionOf('cancelled')).toBe('failed');
    expect(sectionOf('transferFailed')).toBe('failed');
    expect(sectionOf('saved')).toBe('done');
  });
  it('fills the tape left to right (DESIGN.md §10.6)', () => {
    expect(tapeOf('queued', job()).spans).toEqual([0, 0, 0]);
    expect(tapeOf('running', job({ progress: 0.5 }))).toMatchObject({ spans: [0.5, 0, 0], current: 0, breathing: -1, value: 30 });
    expect(tapeOf('running', job({ progress: 0 })).breathing).toBe(0);
    expect(tapeOf('processing', job())).toMatchObject({ spans: [1, 0, 0], breathing: 0 });
    expect(tapeOf('ready', job()).current).toBe(1);
    expect(tapeOf('transferring', job(), { phase: 'transferring', received: 25, total: 100 }).spans).toEqual([1, 0.25, 0]);
    expect(tapeOf('writing', job())).toMatchObject({ spans: [1, 1, 1], breathing: 2, value: 100 });
    expect(tapeOf('error', job({ progress: 0.3 }))).toMatchObject({ failed: true, spans: [0.3, 0, 0] });
    expect(tapeOf('cancelled', job({ progress: 0.3 }))).toMatchObject({ cancelled: true, spans: [0, 0, 0] });
  });
});

describe('status lines (DESIGN.md §13.2/13.3)', () => {
  it('running with size', () => {
    const j = job({ status: 'running', progress: 0.64, bytes_total: 10e6, bytes_done: 6.4e6, speed: 3.1e6, eta: 6 });
    expect(statusLine('running', j)).toBe('On server · 64% · 3.1 MB/s · 6 s left');
  });
  it('running without size', () => {
    expect(statusLine('running', job({ status: 'running', bytes_done: 4.4e6 }))).toBe('On server · 4.4 MB so far');
  });
  it('processing and transfer', () => {
    expect(statusLine('processing', job({ mode: 'audio' }))).toBe('On server · Converting to audio');
    expect(statusLine('processing', job())).toBe('On server · Merging video and audio');
    expect(statusLine('transferring', job(), { phase: 'transferring', received: 48.2e6, total: 156e6 })).toBe(
      'To phone · 30% · 48.2 MB of 156 MB',
    );
  });
  it('saved and errors', () => {
    const done = job({ status: 'done', quality: 1080, file: { name: 'a.mp4', size: 13.8e6, mime: 'video/mp4', type: 'video' } });
    expect(statusLine('saved', done, null, '2 min ago')).toBe('Saved · 13.8 MB · 2 min ago · 1080p');
    expect(statusLine('error', job({ error: { code: 'rate_limited', message: '' } }))).toBe(
      'Instagram is throttling. Retry in a few minutes',
    );
    expect(statusLine('error', job({ error: { code: 'unavailable', message: 'Live streams are not supported.' } }))).toBe(
      "Can't be downloaded: Live streams are not supported",
    );
    expect(statusLine('transferFailed', job(), { phase: 'failed', received: 0, total: 1, failure: 'storage' })).toBe(
      'Phone storage is full',
    );
  });
});
