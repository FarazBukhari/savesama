// A module-level download queue.
//
// Downloads used to be awaited inside DownloadScreen's handler, which tied them to
// that component: a long 1080p download had no state outside the screen, and the
// "Save all" loop ran strictly one item at a time with no visibility into what was
// waiting. The queue owns that work instead, so downloads survive tab switches and
// re-renders, and every job's state is inspectable.
//
// Jobs run ONE at a time on purpose. Downloads are already split across parallel
// range requests (see rangedDownload.ts), so running several jobs at once would
// have them competing for the same bandwidth and make every one of them slower —
// and progress harder to read.

import { MediaItem } from '../extraction/types';
import { downloadAudioToGallery, downloadToGallery } from './download';

export type DownloadFormat = 'video' | 'audio';

export type JobStatus = 'queued' | 'active' | 'done' | 'error' | 'cancelled';

export interface DownloadJob {
  /** Stable id: one job per item+format, so re-queuing the same save is a no-op. */
  id: string;
  item: MediaItem;
  format: DownloadFormat;
  status: JobStatus;
  /** 0→1 for the active job; 1 once done. */
  progress: number;
  /** User-facing failure text, set when status is 'error'. */
  error?: string;
}

/** One job per item+format — matches the key DownloadScreen renders against. */
export function jobId(item: MediaItem, format: DownloadFormat = 'video'): string {
  return item.type === 'video' ? `${item.id}:${format}` : item.id;
}

type Listener = (jobs: DownloadJob[]) => void;

const jobs = new Map<string, DownloadJob>();
const listeners = new Set<Listener>();
let running = false;

/** Cached array so useSyncExternalStore's getSnapshot stays referentially stable. */
let snapshot: DownloadJob[] = [];

function publish(): void {
  snapshot = [...jobs.values()];
  for (const listener of listeners) listener(snapshot);
}

function update(id: string, patch: Partial<DownloadJob>): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...patch });
  publish();
}

export function subscribeDownloads(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDownloadJobs(): DownloadJob[] {
  return snapshot;
}

export function getDownloadJob(id: string): DownloadJob | undefined {
  return jobs.get(id);
}

/** Jobs still to run, plus the one in flight. */
export function pendingCount(): number {
  return snapshot.filter((job) => job.status === 'queued' || job.status === 'active').length;
}

export interface EnqueueOptions {
  /** Called after each successful save, so the Saved tab can refresh. */
  onSaved?: () => void;
}

/**
 * Adds a job and starts the runner if idle. Re-queuing an item that is already
 * queued, running or finished is ignored; a previously failed or cancelled job is
 * retried.
 */
export function enqueueDownload(
  item: MediaItem,
  format: DownloadFormat = 'video',
  options: EnqueueOptions = {}
): string {
  const id = jobId(item, format);
  const existing = jobs.get(id);
  if (existing && (existing.status === 'queued' || existing.status === 'active' || existing.status === 'done')) {
    return id;
  }

  jobs.set(id, { id, item, format, status: 'queued', progress: 0 });
  publish();
  void run(options);
  return id;
}

/**
 * Removes a job that has not started yet.
 *
 * The in-flight job is deliberately NOT cancellable: expo-file-system's download
 * handle is not currently threaded out to here, and the native mux/transcode steps
 * cannot be interrupted mid-call. Cancelling the active job would leave partial
 * files whose cleanup we could not guarantee, so it is refused rather than faked.
 */
export function cancelDownload(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'queued') return false;
  update(id, { status: 'cancelled' });
  return true;
}

/** Drops finished/failed jobs so the list doesn't grow without bound. */
export function clearFinishedDownloads(): void {
  for (const [id, job] of jobs) {
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
      jobs.delete(id);
    }
  }
  publish();
}

function nextQueued(): DownloadJob | undefined {
  for (const job of jobs.values()) {
    if (job.status === 'queued') return job;
  }
  return undefined;
}

/**
 * Drains the queue one job at a time. Re-entrant calls return immediately; the
 * loop picks up anything enqueued while it was already running.
 */
async function run(options: EnqueueOptions): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let job = nextQueued(); job; job = nextQueued()) {
      update(job.id, { status: 'active', progress: 0 });
      const download = job.format === 'audio' ? downloadAudioToGallery : downloadToGallery;
      try {
        await download(job.item, (fraction) => update(job.id, { progress: fraction }));
        update(job.id, { status: 'done', progress: 1 });
        options.onSaved?.();
      } catch (error) {
        update(job.id, {
          status: 'error',
          progress: 0,
          error: describeError(error),
        });
      }
    }
  } finally {
    // Cleared before returning so a job enqueued during the last await still
    // starts a fresh runner.
    running = false;
    if (nextQueued()) void run(options);
  }
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'userMessage' in error) {
    const message = (error as { userMessage: unknown }).userMessage;
    if (typeof message === 'string') return message;
  }
  return 'Something went wrong. Check your connection and try again.';
}

/** Test-only: drops all jobs and listeners. */
export function resetDownloadQueueForTests(): void {
  jobs.clear();
  listeners.clear();
  snapshot = [];
  running = false;
}
