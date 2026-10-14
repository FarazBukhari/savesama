import type { Job } from './api';
import { formatEta, formatPercent, formatSize, formatSpeed } from './format';
import { PLATFORM_NAMES } from './links';
import { qualityLabel } from './quality';

export type TransferFailure = 'transfer' | 'storage' | 'permission' | 'server';

export interface Transfer {
  phase: 'waiting' | 'transferring' | 'writing' | 'saved' | 'failed';
  received: number;
  total: number;
  failure?: TransferFailure;
  /** Server-side reason when the server failed during transfer (e.g. 409 conflict). */
  message?: string;
}

export type TransferEvent =
  | { type: 'start'; received: number; total: number }
  | { type: 'progress'; received: number; total: number }
  | { type: 'downloaded' }
  | { type: 'saved' }
  | { type: 'fail'; failure: TransferFailure; message?: string }
  | { type: 'reset' };

export const IDLE_TRANSFER: Transfer = { phase: 'waiting', received: 0, total: 0 };

/** Phone-side pipeline: waiting → transferring → writing → saved, failed from any active phase. */
export function transferReducer(state: Transfer, event: TransferEvent): Transfer {
  switch (event.type) {
    case 'start':
      if (state.phase === 'saved') return state;
      return { phase: 'transferring', received: event.received, total: event.total };
    case 'progress':
      if (state.phase !== 'transferring') return state;
      return { ...state, received: Math.max(state.received, event.received), total: event.total || state.total };
    case 'downloaded':
      if (state.phase !== 'transferring') return state;
      return { ...state, phase: 'writing', received: state.total || state.received };
    case 'saved':
      if (state.phase !== 'writing') return state;
      return { ...state, phase: 'saved' };
    case 'fail':
      if (state.phase === 'saved') return state;
      return { ...state, phase: 'failed', failure: event.failure, message: event.message };
    case 'reset':
      return state.phase === 'saved' ? state : IDLE_TRANSFER;
  }
}

export type Stage =
  | 'queued'
  | 'running'
  | 'processing'
  | 'ready'
  | 'transferring'
  | 'writing'
  | 'saved'
  | 'error'
  | 'transferFailed'
  | 'cancelled';

export function stageOf(job: Pick<Job, 'status'>, transfer?: Transfer | null): Stage {
  switch (job.status) {
    case 'queued':
    case 'running':
    case 'processing':
    case 'cancelled':
      return job.status;
    case 'error':
      return 'error';
    case 'done':
      if (!transfer) return 'ready';
      switch (transfer.phase) {
        case 'waiting':
          return 'ready';
        case 'transferring':
          return 'transferring';
        case 'writing':
          return 'writing';
        case 'saved':
          return 'saved';
        case 'failed':
          return 'transferFailed';
      }
  }
  return 'queued';
}

export type Section = 'progress' | 'failed' | 'done';

export function sectionOf(stage: Stage): Section {
  if (stage === 'saved') return 'done';
  if (stage === 'error' || stage === 'transferFailed' || stage === 'cancelled') return 'failed';
  return 'progress';
}

export const isActive = (stage: Stage) => sectionOf(stage) === 'progress';
/** Running or transferring: the REC lamp is lit. */
export const isLive = (stage: Stage) => stage === 'running' || stage === 'processing' || stage === 'transferring' || stage === 'writing';

export interface Tape {
  spans: [number, number, number];
  /** Index of the span whose label is "current" (ink); -1 when none. */
  current: number;
  /** Index of a span that is full but working with no percentage. */
  breathing: number;
  failed: boolean;
  cancelled: boolean;
  /** 0..100 for the progressbar role: span1×60 + span2×30 + span3×10. */
  value: number;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export function tapeOf(stage: Stage, job: Pick<Job, 'progress'>, transfer?: Transfer | null, failedAt?: Tape): Tape {
  let spans: [number, number, number] = [0, 0, 0];
  let current = -1;
  let breathing = -1;
  const recv = transfer && transfer.total > 0 ? clamp(transfer.received / transfer.total) : 0;
  switch (stage) {
    case 'queued':
      current = 0;
      break;
    case 'running':
      spans = [clamp(job.progress), 0, 0];
      current = 0;
      if (!job.progress) breathing = 0;
      break;
    case 'processing':
      spans = [1, 0, 0];
      current = 0;
      breathing = 0;
      break;
    case 'ready':
      spans = [1, 0, 0];
      current = 1;
      break;
    case 'transferring':
      spans = [1, recv, 0];
      current = 1;
      break;
    case 'writing':
      spans = [1, 1, 1];
      current = 2;
      breathing = 2;
      break;
    case 'saved':
      spans = [1, 1, 1];
      current = 2;
      break;
    case 'error':
      spans = [clamp(job.progress), 0, 0];
      current = 0;
      break;
    case 'transferFailed':
      spans = failedAt?.spans ?? [1, recv, 0];
      current = 1;
      break;
    case 'cancelled':
      spans = [0, 0, 0];
      break;
  }
  const value = Math.round(spans[0] * 60 + spans[1] * 30 + spans[2] * 10);
  return {
    spans,
    current,
    breathing,
    failed: stage === 'error' || stage === 'transferFailed',
    cancelled: stage === 'cancelled',
    value,
  };
}

type LineJob = Pick<Job, 'status' | 'progress' | 'bytes_done' | 'bytes_total' | 'speed' | 'eta' | 'mode' | 'quality' | 'platform' | 'error' | 'file'>;

/** One status line per DESIGN.md §13.2 / §13.3. */
export function statusLine(stage: Stage, job: LineJob, transfer?: Transfer | null, savedAgo?: string): string {
  const platform = PLATFORM_NAMES[job.platform] ?? 'The platform';
  switch (stage) {
    case 'queued':
      return 'Waiting on server';
    case 'running': {
      if (job.bytes_total) {
        return ['On server', formatPercent(job.progress), formatSpeed(job.speed), job.eta != null ? `${formatEta(job.eta)} left` : '']
          .filter(Boolean)
          .join(' · ');
      }
      return job.bytes_done ? `On server · ${formatSize(job.bytes_done)} so far` : 'On server';
    }
    case 'processing':
      return job.mode === 'audio' ? 'On server · Converting to audio' : 'On server · Merging video and audio';
    case 'ready':
      return 'Ready to transfer';
    case 'transferring': {
      const t = transfer!;
      const pct = t.total > 0 ? formatPercent(t.received / t.total) : '';
      return ['To phone', pct, t.total > 0 ? `${formatSize(t.received)} of ${formatSize(t.total)}` : formatSize(t.received)]
        .filter(Boolean)
        .join(' · ');
    }
    case 'writing':
      return 'Saving to gallery';
    case 'saved': {
      const suffix = job.mode === 'audio' ? 'Audio' : job.file?.type === 'image' || job.quality === 'max' ? '' : qualityLabel(job.quality);
      return ['Saved', formatSize(job.file?.size ?? transfer?.total), savedAgo, suffix].filter(Boolean).join(' · ');
    }
    case 'cancelled':
      return 'Cancelled';
    case 'transferFailed':
      if (transfer?.failure === 'storage') return 'Phone storage is full';
      if (transfer?.failure === 'permission') return 'Allow gallery access to finish saving';
      if (transfer?.failure === 'server') return 'The server changed state. Retry';
      return 'Transfer stopped. Retry to resume';
    case 'error':
      return jobErrorLine(job.error?.code, job.error?.message, platform);
  }
}

export function jobErrorLine(code: string | undefined, message: string | undefined, platform: string): string {
  switch (code) {
    case 'login_required':
      return "Needs an account. SaveSama can't save it";
    case 'not_found':
      return 'The post was deleted or the link is wrong';
    case 'rate_limited':
      return `${platform} is throttling. Retry in a few minutes`;
    case 'unavailable':
      return message ? `Can't be downloaded: ${message.replace(/\.$/, '')}` : "Can't be downloaded";
    case 'network':
      return `Server couldn't reach ${platform}`;
    case 'conflict':
      return 'The server changed state. Retry';
    default:
      return 'Server error. Retry, or update the extractor';
  }
}
