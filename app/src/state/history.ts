import { linkKey, type Platform } from '@/lib/links';

import { historyStore, type SavedFile } from './stores';

export function recordLink(url: string, platform: Platform, title: string | null): void {
  const key = linkKey(url);
  historyStore.set((s) => ({
    links: [{ key, url, platform, title, savedAt: Date.now() }, ...s.links.filter((l) => l.key !== key)],
  }));
}

export function findSavedLink(url: string) {
  const key = linkKey(url);
  return historyStore.get().links.find((l) => l.key === key) ?? null;
}

export function addSave(file: SavedFile): void {
  historyStore.set((s) => ({ saves: [file, ...s.saves.filter((f) => f.jobId !== file.jobId)] }));
}

export function isJobSaved(jobId: string): boolean {
  return historyStore.get().saves.some((f) => f.jobId === jobId);
}

export function clearLinks(): void {
  historyStore.set({ links: [] });
}

export function forgetSaves(match: (f: SavedFile) => boolean): void {
  historyStore.set((s) => ({ saves: s.saves.filter((f) => !match(f)) }));
}
