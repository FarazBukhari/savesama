import { AccessibilityInfo } from 'react-native';

import { ApiError, type CreateJobsBody, type Job } from '@/lib/api';
import { IDLE_TRANSFER, stageOf, transferReducer, type Transfer, type TransferEvent } from '@/lib/jobState';

import { discardLocal, discardPartial, downloadJobFile, TransferError } from './download';
import { galleryAccess, saveToGallery } from './gallery';
import { addSave, isJobSaved, recordLink } from './history';
import { checkServer, clientFor, markOnline, markUnauthorized } from './servers';
import { activeServer, jobsStore, serversStore, settingsStore } from './stores';
import { haptic, snack } from './ui';

// ---------- transfers ----------

function dispatch(id: string, event: TransferEvent) {
  jobsStore.set((s) => ({
    transfers: { ...s.transfers, [id]: transferReducer(s.transfers[id] ?? IDLE_TRANSFER, event) },
  }));
}

const running = new Map<string, AbortController>();
const queue: string[] = [];
const MAX_PARALLEL = 2;
/** Jobs that failed on the phone side wait for a manual retry instead of looping. */
const blocked = new Set<string>();

function pump() {
  while (running.size < MAX_PARALLEL && queue.length) {
    const id = queue.shift()!;
    const job = jobsStore.get().jobs.find((j) => j.id === id);
    if (!job) continue;
    void runTransfer(job);
  }
}

function enqueue(job: Job) {
  if (running.has(job.id) || queue.includes(job.id) || blocked.has(job.id) || isJobSaved(job.id)) return;
  queue.push(job.id);
  pump();
}

async function runTransfer(job: Job) {
  const server = activeServer();
  const client = clientFor(server);
  if (!client) return;
  const controller = new AbortController();
  running.set(job.id, controller);
  const total = job.file?.size ?? 0;
  dispatch(job.id, { type: 'start', received: 0, total });
  try {
    const access = await galleryAccess();
    if (access === 'denied' || access === 'blocked' || access === 'undetermined') {
      throw new TransferError('transfer', 'permission');
    }
    let lastTick = 0;
    const { uri, size } = await downloadJobFile(
      job,
      client.fileUrl(job.id),
      client.authHeader(),
      (received, t) => {
        const now = Date.now();
        if (now - lastTick < 250 && received < t) return;
        lastTick = now;
        dispatch(job.id, { type: 'progress', received, total: t });
      },
      controller.signal,
    );
    dispatch(job.id, { type: 'downloaded' });
    const assetId = await saveToGallery(uri);
    if (assetId !== uri) discardLocal(uri);
    addSave({
      jobId: job.id,
      assetId: assetId !== uri ? assetId : null,
      uri: assetId === uri ? uri : null,
      url: job.url,
      platform: job.platform,
      title: job.title,
      author: job.author,
      thumbnail: job.thumbnail,
      type: job.file?.type ?? 'video',
      mime: job.file?.mime ?? '',
      name: job.file?.name ?? '',
      size,
      mode: job.mode,
      quality: job.quality,
      savedAt: Date.now(),
    });
    recordLink(job.url, job.platform, job.title);
    dispatch(job.id, { type: 'saved' });
    haptic.success();
    AccessibilityInfo.announceForAccessibility(`Saved ${job.title ?? 'file'} to the SaveSama album`);
    if (!settingsStore.get().keepOnServer) {
      client.remove(job.id).catch(() => undefined);
    }
  } catch (e) {
    blocked.add(job.id);
    const failure =
      e instanceof TransferError && e.message === 'permission'
        ? 'permission'
        : e instanceof TransferError
          ? e.kind
          : /space|ENOSPC/i.test(String(e))
            ? 'storage'
            : 'transfer';
    dispatch(job.id, { type: 'fail', failure, message: e instanceof Error ? e.message : String(e) });
    if (failure !== 'permission') haptic.error();
  } finally {
    running.delete(job.id);
    pump();
  }
}

/** Retry a phone-side failure (resumes from the partial file). */
export function retryTransfer(id: string) {
  blocked.delete(id);
  dispatch(id, { type: 'reset' });
  const job = jobsStore.get().jobs.find((j) => j.id === id);
  if (job) enqueue(job);
}

/** After the user grants gallery access: retry every transfer blocked on it. */
export function retryPermissionBlocked() {
  const t = jobsStore.get().transfers;
  Object.keys(t)
    .filter((id) => t[id].phase === 'failed' && t[id].failure === 'permission')
    .forEach(retryTransfer);
}

// ---------- server jobs ----------

let syncing: Promise<void> | null = null;

export function syncJobs(): Promise<void> {
  if (!syncing) {
    syncing = doSync().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

async function doSync() {
  const server = activeServer();
  const client = clientFor(server);
  if (!server || !client) return;
  try {
    const jobs = await client.listJobs();
    markOnline(server.id);
    const hidden = new Set(jobsStore.get().hidden);
    const visible = jobs.filter((j) => !hidden.has(j.id));
    const prev = new Map(jobsStore.get().jobs.map((j) => [j.id, j]));
    jobsStore.set({ jobs: visible, lastSync: Date.now(), syncError: null });
    for (const j of visible) {
      const before = prev.get(j.id);
      if (j.status === 'error' && before && before.status !== 'error') haptic.error();
      if (j.status === 'done' && j.file) {
        // Saved earlier but the DELETE never landed (app closed, server restarted): finish it now.
        if (isJobSaved(j.id) && !settingsStore.get().keepOnServer && !running.has(j.id)) client.remove(j.id).catch(() => undefined);
        else enqueue(j);
      }
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'unauthorized') markUnauthorized(server.id);
    else if (e instanceof ApiError && (e.code === 'offline' || e.code === 'timeout')) void checkServer(server, true);
    jobsStore.set({ syncError: e instanceof Error ? e.message : String(e) });
  }
}

/** Unfinished work exists (server- or phone-side): poll fast. */
export function hasUnfinished(): boolean {
  const { jobs, transfers } = jobsStore.get();
  return jobs.some((j) => {
    const st = stageOf(j, transfers[j.id]);
    return st === 'queued' || st === 'running' || st === 'processing' || st === 'ready' || st === 'transferring' || st === 'writing';
  });
}

// ---------- user actions ----------

export async function startJobs(body: CreateJobsBody): Promise<Job[]> {
  const client = clientFor();
  if (!client) throw new ApiError('offline', 'not paired');
  const jobs = await client.createJobs(body);
  jobsStore.set((s) => ({ jobs: [...jobs, ...s.jobs.filter((j) => !jobs.some((n) => n.id === j.id))] }));
  if (jobs[0]) recordLink(body.url, jobs[0].platform, jobs[0].title);
  void syncJobs();
  return jobs;
}

export async function cancelJob(id: string, onUndo: () => void): Promise<void> {
  const ctrl = running.get(id);
  const job = jobsStore.get().jobs.find((j) => j.id === id);
  if (ctrl) {
    ctrl.abort();
    blocked.add(id);
    dispatch(id, { type: 'fail', failure: 'transfer', message: 'cancelled' });
  }
  if (job && job.status !== 'done') {
    const client = clientFor();
    try {
      const updated = await client?.cancel(id);
      if (updated) jobsStore.set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? updated : j)) }));
    } catch {
      void syncJobs();
    }
  }
  snack('Download cancelled', { label: 'Undo', onPress: onUndo });
}

export async function retryJob(id: string): Promise<void> {
  const job = jobsStore.get().jobs.find((j) => j.id === id);
  if (!job) return;
  if (job.status === 'done') return retryTransfer(id);
  const client = clientFor();
  if (!client) return;
  try {
    const updated = await client.retry(id);
    jobsStore.set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? updated : j)),
      transfers: Object.fromEntries(Object.entries(s.transfers).filter(([k]) => k !== id)),
    }));
    blocked.delete(id);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'conflict') void syncJobs();
  }
}

/** Removes finished/failed/cancelled rows; DELETEs server copies that are still there. */
export function clearFinished(): void {
  const { jobs, transfers } = jobsStore.get();
  const client = clientFor();
  const gone: string[] = [];
  for (const j of jobs) {
    const st = stageOf(j, transfers[j.id]);
    if (st === 'saved' || st === 'error' || st === 'cancelled' || st === 'transferFailed') {
      gone.push(j.id);
      if (!(st === 'saved' && settingsStore.get().keepOnServer)) client?.remove(j.id).catch(() => undefined);
      discardPartial(j.id);
      blocked.delete(j.id);
    }
  }
  jobsStore.set((s) => ({
    jobs: s.jobs.filter((j) => !gone.includes(j.id)),
    hidden: [...s.hidden, ...gone],
    transfers: Object.fromEntries(Object.entries(s.transfers).filter(([k]) => !gone.includes(k))),
    clearedBefore: Date.now(),
  }));
}

export function resetForServerSwitch(): void {
  running.forEach((c) => c.abort());
  running.clear();
  queue.length = 0;
  jobsStore.set({ jobs: [], transfers: {} });
}

let lastActive: string | null = null;
serversStore.subscribe(() => {
  const id = serversStore.get().activeId;
  if (id !== lastActive) {
    const hadOne = lastActive !== null;
    lastActive = id;
    if (hadOne) resetForServerSwitch();
    void syncJobs();
  }
});
