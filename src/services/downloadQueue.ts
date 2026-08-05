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

import {
  isDownloadServiceSupported,
  startDownloadService,
  stopDownloadService,
  updateDownloadService,
} from '../../modules/foxy-download-service';
import { MediaItem } from '../extraction/types';
import { CancelToken, createCancelToken, isCancelledError } from './cancellation';
import { downloadAudioToGallery, downloadToGallery } from './download';
import { ResolutionPref } from './preferences';

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
  /** One-off quality choice for this download; absent means use the saved default. */
  resolution?: ResolutionPref;
}

/** One job per item+format — matches the key DownloadScreen renders against. */
export function jobId(item: MediaItem, format: DownloadFormat = 'video'): string {
  return item.type === 'video' ? `${item.id}:${format}` : item.id;
}

type Listener = (jobs: DownloadJob[]) => void;

const jobs = new Map<string, DownloadJob>();
const listeners = new Set<Listener>();
/** Cancel token of the job currently in flight, so it can be aborted. */
let activeToken: { id: string; token: CancelToken } | null = null;
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
  /** Overrides the platform's saved resolution for this download only. */
  resolution?: ResolutionPref;
  /**
   * Re-runs a job that already finished. Set when the user explicitly asks to save
   * again — otherwise a completed job is left alone so "Save all" doesn't
   * re-download everything.
   */
  force?: boolean;
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
  if (existing) {
    // In-flight work is never restarted.
    if (existing.status === 'queued' || existing.status === 'active') return id;
    // A finished job re-runs when asked explicitly, or when the quality changed —
    // saving the same video at a different resolution is a different download.
    const qualityChanged = existing.status === 'done' && existing.resolution !== options.resolution;
    if (existing.status === 'done' && !options.force && !qualityChanged) return id;
  }

  jobs.set(id, {
    id,
    item,
    format,
    status: 'queued',
    progress: 0,
    ...(options.resolution ? { resolution: options.resolution } : {}),
  });
  publish();
  void run(options);
  return id;
}

/**
 * Cancels a job, queued or in flight.
 *
 * A queued job is simply marked. The active job's cancel token aborts its HTTP
 * transfer immediately; a native mux/transcode already in progress can't be
 * interrupted, so cancellation takes effect when that call returns — either way the
 * file is never saved and the download's own cleanup removes the cache files.
 */
export function cancelDownload(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;

  if (job.status === 'queued') {
    update(id, { status: 'cancelled' });
    return true;
  }

  if (job.status === 'active' && activeToken?.id === id) {
    activeToken.token.cancel();
    return true;
  }

  return false;
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
  // Foreground service for the whole drain, not per job: starting and stopping it
  // between queued items would flicker the notification and briefly leave the
  // process unprotected.
  const serviceActive = isDownloadServiceSupported();
  if (serviceActive) startDownloadService(serviceTitle());
  try {
    for (let job = nextQueued(); job; job = nextQueued()) {
      update(job.id, { status: 'active', progress: 0 });
      const onProgress = (fraction: number) => {
        update(job.id, { progress: fraction });
        if (serviceActive) updateDownloadService(serviceTitle(), fraction);
      };
      const token = createCancelToken();
      activeToken = { id: job.id, token };
      try {
        // Audio has no resolution to pick — the stream is whatever the source serves.
        await (job.format === 'audio'
          ? downloadAudioToGallery(job.item, onProgress, token)
          : downloadToGallery(job.item, onProgress, job.resolution, token));
        update(job.id, { status: 'done', progress: 1 });
        options.onSaved?.();
      } catch (error) {
        // A cancellation is the user's own doing, not a failure to report.
        update(
          job.id,
          isCancelledError(error)
            ? { status: 'cancelled', progress: 0 }
            : { status: 'error', progress: 0, error: describeError(error) }
        );
      } finally {
        activeToken = null;
      }
    }
  } finally {
    // Cleared before returning so a job enqueued during the last await still
    // starts a fresh runner.
    running = false;
    const more = nextQueued();
    // Only drop the service when the queue is actually empty, so a hand-off to the
    // next runner doesn't leave the process unprotected mid-download.
    if (serviceActive && !more) stopDownloadService();
    if (more) void run(options);
  }
}

/** Notification title reflecting how much work is left. */
function serviceTitle(): string {
  const remaining = pendingCount();
  if (remaining > 1) return `Downloading ${remaining} items`;
  return 'Downloading';
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
  activeToken = null;
}
