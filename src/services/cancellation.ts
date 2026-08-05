// Cooperative cancellation for downloads.
//
// A download is a sequence of steps — probe, one or more HTTP transfers, sometimes a
// native mux or transcode, then the gallery save. Nothing here can be killed
// mid-instruction, so cancellation works two ways:
//
//  1. In-flight `expo-file-system` transfers are aborted directly: each one registers
//     its `cancelAsync` with the token.
//  2. Native mux/transcode calls cannot be interrupted, so the token is checked at
//     each step boundary instead. A cancel during a transcode takes effect as soon as
//     the transcode returns — the file is simply never saved.
//
// Either way the download's own `finally` blocks delete the cache files, so a
// cancelled download leaves nothing behind.

/** Thrown at a cancellation checkpoint. Callers treat it as "not an error". */
export class CancelledError extends Error {
  constructor() {
    super('download cancelled');
    this.name = 'CancelledError';
  }
}

export function isCancelledError(error: unknown): boolean {
  return error instanceof CancelledError || (error as { name?: string })?.name === 'CancelledError';
}

export interface CancelToken {
  readonly cancelled: boolean;
  /** Throws CancelledError if cancellation has been requested. */
  throwIfCancelled(): void;
  /**
   * Registers an abort action (e.g. a resumable download's `cancelAsync`). Returns an
   * unregister function so completed transfers don't get aborted retroactively.
   */
  onCancel(abort: () => void): () => void;
  cancel(): void;
}

export function createCancelToken(): CancelToken {
  let cancelled = false;
  const aborts = new Set<() => void>();

  return {
    get cancelled() {
      return cancelled;
    },
    throwIfCancelled() {
      if (cancelled) throw new CancelledError();
    },
    onCancel(abort) {
      // Already cancelled: abort immediately rather than waiting for a cancel that
      // has been and gone.
      if (cancelled) {
        abort();
        return () => undefined;
      }
      aborts.add(abort);
      return () => {
        aborts.delete(abort);
      };
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const abort of aborts) {
        try {
          abort();
        } catch {
          // A failed abort must not stop the others.
        }
      }
      aborts.clear();
    },
  };
}
