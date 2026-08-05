import { requireNativeModule } from 'expo-modules-core';

type FoxyDownloadServiceModule = {
  /** Whether this platform can keep downloads running in the background. */
  isSupported(): boolean;
  /** Starts the foreground service with an indeterminate progress notification. */
  start(title: string): void;
  /** Updates the notification's title and percentage (0-100). */
  update(title: string, progress: number): void;
  /** Stops the service and removes the notification. */
  stop(): void;
};

/**
 * Resolved lazily rather than at import time. `requireNativeModule` throws when the
 * native side isn't present — under jest, and in any build made before this module
 * existed — and an import-time throw would take down every consumer of the queue.
 */
let cached: FoxyDownloadServiceModule | null | undefined;

function nativeModule(): FoxyDownloadServiceModule | null {
  if (cached === undefined) {
    try {
      cached = requireNativeModule<FoxyDownloadServiceModule>('FoxyDownloadService');
    } catch {
      cached = null;
    }
  }
  return cached;
}

/**
 * Keeps the app's process alive while downloads run, with a progress notification.
 *
 * The service does not download anything. On Android the React Native JS thread
 * keeps running while backgrounded — the thing that interrupts a long transfer is
 * the system reclaiming the process, which a foreground service prevents. The
 * required notification doubles as download progress UI.
 *
 * Every call is best-effort and swallows failures: not being able to show a
 * notification must never fail a download. The worst case is the pre-service
 * behaviour, where a backgrounded transfer may be killed.
 */
export function isDownloadServiceSupported(): boolean {
  try {
    return nativeModule()?.isSupported() ?? false;
  } catch {
    return false;
  }
}

export function startDownloadService(title: string): void {
  try {
    nativeModule()?.start(title);
  } catch {
    // Best-effort: see above.
  }
}

export function updateDownloadService(title: string, progress: number): void {
  try {
    nativeModule()?.update(title, Math.round(Math.max(0, Math.min(1, progress)) * 100));
  } catch {
    // Best-effort: see above.
  }
}

export function stopDownloadService(): void {
  try {
    nativeModule()?.stop();
  } catch {
    // Best-effort: see above.
  }
}
