import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Splits a download across several parallel HTTP range requests and joins the
 * parts back into one file.
 *
 * Why: a single connection to `googlevideo.com` / `fbcdn.net` is often slower than
 * the link allows, so a 1080p video takes far longer than its size suggests.
 * Several concurrent ranges usually recover a large part of that. Both CDNs answer
 * `206 Partial Content` (verified August 2026), which is what makes this possible.
 *
 * ⚠️ This helps only when the bottleneck is *per-connection* throughput. If the
 * user's own bandwidth is the limit, more connections move the same bytes in the
 * same time — no faster, just more sockets.
 *
 * Callers get a single monotonic 0→1 progress figure summed across the parts, and
 * on any failure every part file is deleted before the error propagates.
 */

/** Parallel connections per download. Past ~4, CDNs stop rewarding it. */
const DEFAULT_CONNECTIONS = 4;

/**
 * Below this, splitting costs more in request overhead than it recovers, so the
 * caller should use a single plain download instead.
 */
const MIN_SPLIT_BYTES = 4 * 1024 * 1024;

export interface RangedDownloadProbe {
  /** Total size in bytes, or null when the server won't say. */
  totalBytes: number | null;
  /** True when the server advertised byte-range support. */
  supportsRanges: boolean;
}

/**
 * Asks the server for the size and whether it honours ranges, using a 1-byte
 * range request. A `206` answer proves range support and reports the full size in
 * `content-range`; anything else means fall back to a single download.
 */
export async function probeRangedDownload(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<RangedDownloadProbe> {
  try {
    const response = await fetchImpl(url, { headers: { Range: 'bytes=0-0' } });
    if (response.status !== 206) {
      const length = Number(response.headers.get('content-length'));
      return { totalBytes: Number.isFinite(length) && length > 0 ? length : null, supportsRanges: false };
    }
    // content-range: bytes 0-0/12345
    const total = Number((response.headers.get('content-range') ?? '').split('/')[1]);
    return {
      totalBytes: Number.isFinite(total) && total > 0 ? total : null,
      supportsRanges: true,
    };
  } catch {
    return { totalBytes: null, supportsRanges: false };
  }
}

/** Whether a ranged split is worth it for this probe result. */
export function shouldSplit(probe: RangedDownloadProbe): boolean {
  return probe.supportsRanges && probe.totalBytes !== null && probe.totalBytes >= MIN_SPLIT_BYTES;
}

/** Byte ranges (inclusive) covering `totalBytes` in `connections` even slices. */
export function planRanges(
  totalBytes: number,
  connections: number = DEFAULT_CONNECTIONS
): { start: number; end: number }[] {
  const count = Math.max(1, Math.min(connections, totalBytes));
  const chunk = Math.floor(totalBytes / count);
  const ranges: { start: number; end: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * chunk;
    // The last range absorbs the remainder so the parts always cover the file.
    const end = index === count - 1 ? totalBytes - 1 : start + chunk - 1;
    ranges.push({ start, end });
  }
  return ranges;
}

export interface RangedDownloadDeps {
  /** Downloads one range to a file, resolving with the bytes written. */
  downloadRange: (
    url: string,
    fileUri: string,
    range: { start: number; end: number },
    onBytes: (bytesWritten: number) => void
  ) => Promise<void>;
  /** Concatenates `parts` into `destUri`, in order. */
  concatenate: (parts: string[], destUri: string) => Promise<void>;
  /** Best-effort delete used for cleanup. */
  remove: (fileUri: string) => Promise<void>;
}

/**
 * Runs the ranged download. Progress sums bytes across all parts against the
 * known total, so it only ever grows.
 *
 * Injected dependencies keep the orchestration testable without a filesystem or
 * network; `downloadRangedFile` wires the real ones.
 */
export async function runRangedDownload(
  url: string,
  destUri: string,
  totalBytes: number,
  onProgress: (fraction: number) => void,
  deps: RangedDownloadDeps,
  connections: number = DEFAULT_CONNECTIONS
): Promise<void> {
  const ranges = planRanges(totalBytes, connections);
  const partUris = ranges.map((_, index) => `${destUri}.part${index}`);
  const written = new Array<number>(ranges.length).fill(0);

  const report = () => {
    const sum = written.reduce((total, bytes) => total + bytes, 0);
    // Clamp: a server that sends slightly more than advertised must not push the
    // fraction past 1.
    onProgress(Math.min(1, sum / totalBytes));
  };

  try {
    await Promise.all(
      ranges.map((range, index) =>
        deps.downloadRange(url, partUris[index], range, (bytes) => {
          written[index] = bytes;
          report();
        })
      )
    );
    await deps.concatenate(partUris, destUri);
    onProgress(1);
  } catch (error) {
    // Never leave part files (or a half-written output) behind.
    await Promise.all([...partUris, destUri].map((uri) => deps.remove(uri)));
    throw error;
  } finally {
    await Promise.all(partUris.map((uri) => deps.remove(uri)));
  }
}

/** Real filesystem/network implementations of {@link RangedDownloadDeps}. */
export const fileSystemDeps: RangedDownloadDeps = {
  async downloadRange(url, fileUri, range, onBytes) {
    const download = FileSystem.createDownloadResumable(
      url,
      fileUri,
      { headers: { Range: `bytes=${range.start}-${range.end}` } },
      (progress) => onBytes(progress.totalBytesWritten)
    );
    const result = await download.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`range ${range.start}-${range.end} returned ${result?.status ?? 'unknown'}`);
    }
    // A server that ignores Range answers 200 with the WHOLE file; concatenating
    // that with other parts would corrupt the output.
    if (result.status === 200 && range.start > 0) {
      throw new Error('server ignored Range header');
    }
  },

  async concatenate(parts, destUri) {
    // Streamed, one writer for the destination and each part piped through in
    // order, so peak memory is one chunk rather than the whole file — an 85MB
    // video must not be held in JS memory.
    //
    // Deliberately NOT done by reading parts as base64 and concatenating the
    // strings: base64 pads each part to a 4-character boundary, so joining two
    // encoded parts corrupts everything after the first unless every part length
    // happens to be a multiple of 3.
    const destination = new File(destUri);
    if (destination.exists) destination.delete();
    destination.create();

    const writer = destination.writableStream().getWriter();
    try {
      for (const part of parts) {
        const reader = new File(part).readableStream().getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) await writer.write(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
    } finally {
      await writer.close();
    }
  },

  async remove(fileUri) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
  },
};
