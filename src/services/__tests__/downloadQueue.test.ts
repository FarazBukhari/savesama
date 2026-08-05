import { MediaItem } from '../../extraction/types';
import { CancelToken, CancelledError } from '../cancellation';

// `mock`-prefixed names are the only ones jest.mock's factory may close over.
const mockDownloadToGallery = jest.fn();
const mockDownloadAudioToGallery = jest.fn();

jest.mock('../download', () => ({
  downloadToGallery: (...args: unknown[]) => mockDownloadToGallery(...args),
  downloadAudioToGallery: (...args: unknown[]) => mockDownloadAudioToGallery(...args),
  DownloadError: class DownloadError extends Error {},
}));

const downloadToGallery = mockDownloadToGallery;
const downloadAudioToGallery = mockDownloadAudioToGallery;

import {
  cancelDownload,
  clearFinishedDownloads,
  enqueueDownload,
  getDownloadJob,
  getDownloadJobs,
  jobId,
  pendingCount,
  resetDownloadQueueForTests,
  subscribeDownloads,
} from '../downloadQueue';

function videoItem(id: string): MediaItem {
  return {
    id,
    type: 'video',
    url: `https://cdn/${id}.mp4`,
    thumbnailUrl: null,
    width: 1080,
    height: 1920,
    platform: 'instagram',
  };
}

/** Resolves once every queued job has settled. */
async function drain(): Promise<void> {
  for (let i = 0; i < 50 && pendingCount() > 0; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  resetDownloadQueueForTests();
  downloadToGallery.mockReset();
  downloadAudioToGallery.mockReset();
  downloadToGallery.mockResolvedValue(undefined);
  downloadAudioToGallery.mockResolvedValue(undefined);
});

describe('enqueueDownload', () => {
  it('runs jobs one at a time, never concurrently', async () => {
    // Concurrent jobs would compete for the same bandwidth as the parallel range
    // requests inside each download.
    let active = 0;
    let maxActive = 0;
    downloadToGallery.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    });

    enqueueDownload(videoItem('a'));
    enqueueDownload(videoItem('b'));
    enqueueDownload(videoItem('c'));
    await drain();

    expect(maxActive).toBe(1);
    expect(downloadToGallery).toHaveBeenCalledTimes(3);
  });

  it('routes audio jobs to the audio downloader', async () => {
    enqueueDownload(videoItem('a'), 'audio');
    await drain();
    expect(downloadAudioToGallery).toHaveBeenCalledTimes(1);
    expect(downloadToGallery).not.toHaveBeenCalled();
  });

  it('keeps video and audio of the same item as separate jobs', async () => {
    enqueueDownload(videoItem('a'), 'video');
    enqueueDownload(videoItem('a'), 'audio');
    await drain();
    expect(getDownloadJob('a:video')?.status).toBe('done');
    expect(getDownloadJob('a:audio')?.status).toBe('done');
  });

  it('ignores a duplicate enqueue of an already-finished job', async () => {
    enqueueDownload(videoItem('a'));
    await drain();
    enqueueDownload(videoItem('a'));
    await drain();
    expect(downloadToGallery).toHaveBeenCalledTimes(1);
  });

  it('retries a failed job when enqueued again', async () => {
    downloadToGallery.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { userMessage: 'Download failed.' })
    );
    enqueueDownload(videoItem('a'));
    await drain();
    expect(getDownloadJob('a:video')?.status).toBe('error');
    expect(getDownloadJob('a:video')?.error).toBe('Download failed.');

    downloadToGallery.mockResolvedValue(undefined);
    enqueueDownload(videoItem('a'));
    await drain();
    expect(getDownloadJob('a:video')?.status).toBe('done');
  });

  it('keeps draining after a job fails', async () => {
    downloadToGallery
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValue(undefined);
    enqueueDownload(videoItem('a'));
    enqueueDownload(videoItem('b'));
    await drain();
    expect(getDownloadJob('a:video')?.status).toBe('error');
    expect(getDownloadJob('b:video')?.status).toBe('done');
  });

  it('starts a job enqueued while the runner is finishing', async () => {
    // The runner clears its flag before returning, so a late arrival must not be
    // left sitting in the queue forever.
    downloadToGallery.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    enqueueDownload(videoItem('a'));
    await new Promise((resolve) => setTimeout(resolve, 2));
    enqueueDownload(videoItem('b'));
    await drain();
    expect(downloadToGallery).toHaveBeenCalledTimes(2);
    expect(getDownloadJob('b:video')?.status).toBe('done');
  });

  it('reports progress through subscribers', async () => {
    const seen: number[] = [];
    downloadToGallery.mockImplementation(
      async (_item: MediaItem, onProgress: (f: number) => void) => {
        onProgress(0.5);
        onProgress(0.9);
      }
    );
    subscribeDownloads((jobs) => {
      const job = jobs.find((j) => j.id === 'a:video');
      if (job) seen.push(job.progress);
    });
    enqueueDownload(videoItem('a'));
    await drain();
    expect(seen).toContain(0.5);
    expect(seen).toContain(0.9);
    expect(getDownloadJob('a:video')?.progress).toBe(1);
  });

  it('calls onSaved once per successful save', async () => {
    const onSaved = jest.fn();
    enqueueDownload(videoItem('a'), 'video', { onSaved });
    enqueueDownload(videoItem('b'), 'video', { onSaved });
    await drain();
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it('does not call onSaved for a failed job', async () => {
    const onSaved = jest.fn();
    downloadToGallery.mockRejectedValue(new Error('boom'));
    enqueueDownload(videoItem('a'), 'video', { onSaved });
    await drain();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('cancelDownload', () => {
  it('removes a queued job so it never runs', async () => {
    downloadToGallery.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    enqueueDownload(videoItem('a'));
    enqueueDownload(videoItem('b'));

    expect(cancelDownload('b:video')).toBe(true);
    await drain();

    expect(getDownloadJob('b:video')?.status).toBe('cancelled');
    expect(downloadToGallery).toHaveBeenCalledTimes(1);
  });

  it('cancels the in-flight job through its cancel token', async () => {
    // The downloader observes the token and rejects with CancelledError, exactly as
    // the real download paths do at their checkpoints.
    let capturedToken: CancelToken | undefined;
    downloadToGallery.mockImplementation(
      (_item: MediaItem, _onProgress: unknown, _res: unknown, token: CancelToken) =>
        new Promise<void>((_resolve, reject) => {
          capturedToken = token;
          token.onCancel(() => reject(new CancelledError()));
        })
    );

    enqueueDownload(videoItem('a'));
    await Promise.resolve();
    await Promise.resolve();
    expect(getDownloadJob('a:video')?.status).toBe('active');

    expect(cancelDownload('a:video')).toBe(true);
    expect(capturedToken?.cancelled).toBe(true);
    await drain();

    // A cancellation is the user's own doing — not surfaced as an error.
    expect(getDownloadJob('a:video')?.status).toBe('cancelled');
    expect(getDownloadJob('a:video')?.error).toBeUndefined();
  });

  it('keeps draining after a cancellation', async () => {
    let first = true;
    downloadToGallery.mockImplementation(
      (_item: MediaItem, _onProgress: unknown, _res: unknown, token: CancelToken) => {
        if (!first) return Promise.resolve();
        first = false;
        return new Promise<void>((_resolve, reject) => {
          token.onCancel(() => reject(new CancelledError()));
          setTimeout(() => cancelDownload('a:video'), 0);
        });
      }
    );

    enqueueDownload(videoItem('a'));
    enqueueDownload(videoItem('b'));
    await drain();

    expect(getDownloadJob('a:video')?.status).toBe('cancelled');
    expect(getDownloadJob('b:video')?.status).toBe('done');
  });

  it('returns false for an unknown job', () => {
    expect(cancelDownload('nope')).toBe(false);
  });
});

describe('bookkeeping', () => {
  it('jobId separates formats for video but not images', () => {
    const image: MediaItem = { ...videoItem('p'), type: 'image' };
    expect(jobId(videoItem('a'), 'video')).toBe('a:video');
    expect(jobId(videoItem('a'), 'audio')).toBe('a:audio');
    expect(jobId(image)).toBe('p');
  });

  it('clearFinishedDownloads keeps only unfinished work', async () => {
    downloadToGallery.mockResolvedValue(undefined);
    enqueueDownload(videoItem('a'));
    await drain();
    expect(getDownloadJobs()).toHaveLength(1);
    clearFinishedDownloads();
    expect(getDownloadJobs()).toHaveLength(0);
  });
});

describe('per-download resolution override', () => {
  it('passes the override through to the video downloader', async () => {
    enqueueDownload(videoItem('a'), 'video', { resolution: '720' });
    await drain();
    expect(downloadToGallery).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      expect.any(Function),
      '720',
      expect.anything()
    );
  });

  it('passes undefined when no override is given, so the saved default applies', async () => {
    enqueueDownload(videoItem('a'), 'video');
    await drain();
    expect(downloadToGallery).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      expect.any(Function),
      undefined,
      expect.anything()
    );
  });

  it('does not pass a resolution to audio downloads', async () => {
    // Audio has no rendition ladder to choose from.
    enqueueDownload(videoItem('a'), 'audio', { resolution: '360' });
    await drain();
    expect(downloadAudioToGallery).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      expect.any(Function),
      expect.anything()
    );
  });
});

describe('re-downloading a finished job', () => {
  it('re-runs when the quality changed', async () => {
    // Saving the same video at a different resolution is a different download; the
    // Saved badge must not be a dead end.
    enqueueDownload(videoItem('a'), 'video', { resolution: 'max' });
    await drain();
    expect(downloadToGallery).toHaveBeenCalledTimes(1);

    enqueueDownload(videoItem('a'), 'video', { resolution: '480' });
    await drain();
    expect(downloadToGallery).toHaveBeenCalledTimes(2);
    expect(getDownloadJob('a:video')?.resolution).toBe('480');
  });

  it('re-runs on an explicit force even at the same quality', async () => {
    enqueueDownload(videoItem('a'), 'video', { resolution: '480' });
    await drain();
    enqueueDownload(videoItem('a'), 'video', { resolution: '480', force: true });
    await drain();
    expect(downloadToGallery).toHaveBeenCalledTimes(2);
  });

  it('still ignores an unforced re-queue at the same quality', async () => {
    // "Save all" relies on this so it doesn't re-download what's already saved.
    enqueueDownload(videoItem('a'), 'video', { resolution: '480' });
    await drain();
    enqueueDownload(videoItem('a'), 'video', { resolution: '480' });
    await drain();
    expect(downloadToGallery).toHaveBeenCalledTimes(1);
  });

  it('re-runs a cancelled job without needing force', async () => {
    downloadToGallery.mockImplementationOnce(
      (_item: MediaItem, _onProgress: unknown, _res: unknown, token: CancelToken) =>
        new Promise<void>((_resolve, reject) => {
          token.onCancel(() => reject(new CancelledError()));
          setTimeout(() => cancelDownload('a:video'), 0);
        })
    );
    enqueueDownload(videoItem('a'));
    await drain();
    expect(getDownloadJob('a:video')?.status).toBe('cancelled');

    enqueueDownload(videoItem('a'));
    await drain();
    expect(getDownloadJob('a:video')?.status).toBe('done');
  });
});
