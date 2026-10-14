import { useMemo } from 'react';

import type { Job } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { isLive, sectionOf, stageOf, statusLine, tapeOf, type Section, type Stage, type Tape, type Transfer } from '@/lib/jobState';
import type { Platform } from '@/lib/links';

import { historyStore, jobsStore, type SavedFile } from './stores';

export interface JobRowModel {
  key: string;
  jobId: string;
  title: string;
  thumbnail: string | null;
  platform: Platform;
  stage: Stage;
  section: Section;
  line: string;
  tape: Tape;
  live: boolean;
  errorCode: string | null;
  /** The phone-side error text, shown under a failed transfer so it can be reported. */
  detail: string | null;
  save: SavedFile | null;
  sortAt: number;
}

const SAVED: Transfer = { phase: 'saved', received: 0, total: 0 };

export function buildRows(
  jobs: Job[],
  transfers: Record<string, Transfer>,
  saves: SavedFile[],
  clearedBefore: number,
  now: number = Date.now(),
): JobRowModel[] {
  const savedById = new Map(saves.map((s) => [s.jobId, s]));
  const rows: JobRowModel[] = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    const save = savedById.get(job.id) ?? null;
    const transfer = save ? SAVED : transfers[job.id];
    const stage = stageOf(job, transfer);
    if (stage === 'saved' && save && save.savedAt < clearedBefore) continue;
    seen.add(job.id);
    rows.push({
      key: job.id,
      jobId: job.id,
      title: job.title || save?.title || job.url.replace(/^https?:\/\/(www\.)?/, ''),
      thumbnail: job.thumbnail,
      platform: job.platform,
      stage,
      section: sectionOf(stage),
      line: statusLine(stage, job, transfer, save ? relativeTime(save.savedAt, now) : undefined),
      tape: tapeOf(stage, job, transfer),
      live: isLive(stage),
      errorCode: stage === 'error' ? (job.error?.code ?? 'internal') : stage === 'transferFailed' ? `transfer:${transfer?.failure}` : null,
      detail:
        stage === 'transferFailed' && transfer?.message && !['cancelled', 'permission'].includes(transfer.message) ? transfer.message : null,
      save,
      sortAt: save?.savedAt ?? job.created_at * 1000,
    });
  }
  // Saved files whose server job is gone (deleted after the transfer): today's plus the last 50.
  const startToday = new Date(now).setHours(0, 0, 0, 0);
  const recent = saves.filter((s) => !seen.has(s.jobId) && s.savedAt >= clearedBefore);
  const done = recent.filter((s, i) => s.savedAt >= startToday || i < 50);
  for (const save of done) {
    const pseudo = {
      status: 'done' as const,
      progress: 1,
      bytes_done: save.size,
      bytes_total: save.size,
      speed: null,
      eta: null,
      mode: save.mode,
      quality: save.quality,
      platform: save.platform,
      error: null,
      file: { name: save.name, size: save.size, mime: save.mime, type: save.type },
    };
    rows.push({
      key: `saved:${save.jobId}`,
      jobId: save.jobId,
      title: save.title || save.name,
      thumbnail: save.thumbnail,
      platform: save.platform,
      stage: 'saved',
      section: 'done',
      line: statusLine('saved', pseudo, SAVED, relativeTime(save.savedAt, now)),
      tape: tapeOf('saved', pseudo, SAVED),
      live: false,
      errorCode: null,
      detail: null,
      save,
      sortAt: save.savedAt,
    });
  }
  return rows;
}

export function useJobRows(): JobRowModel[] {
  const jobs = jobsStore.use((s) => s.jobs);
  const transfers = jobsStore.use((s) => s.transfers);
  const clearedBefore = jobsStore.use((s) => s.clearedBefore);
  const saves = historyStore.use((s) => s.saves);
  return useMemo(() => buildRows(jobs, transfers, saves, clearedBefore), [jobs, transfers, saves, clearedBefore]);
}
