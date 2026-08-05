import { useSyncExternalStore } from 'react';

import { DownloadJob, getDownloadJobs, subscribeDownloads } from '../services/downloadQueue';

/**
 * Subscribes a component to the download queue. The queue owns download state, so
 * progress keeps advancing across tab switches and screen re-renders.
 */
export function useDownloadJobs(): DownloadJob[] {
  return useSyncExternalStore(subscribeDownloads, getDownloadJobs, getDownloadJobs);
}
