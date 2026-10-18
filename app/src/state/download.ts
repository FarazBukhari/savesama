import { Directory, File, Paths } from 'expo-file-system';

import type { Job } from '@/lib/api';

export class TransferError extends Error {
  constructor(
    public kind: 'transfer' | 'storage' | 'server' | 'gallery',
    message: string,
  ) {
    super(message);
  }
}

const dir = () => {
  const d = new Directory(Paths.cache, 'transfers');
  d.create({ idempotent: true, intermediates: true });
  return d;
};

/**
 * A cache file name that survives the native side. expo-file-system builds a WHATWG file:// URL
 * (which leaves ASCII punctuation such as [ ] , ' raw) and Android parses it with
 * java.net.URI, which rejects [ ]; the gallery then reads the extension with
 * MimeTypeMap.getFileExtensionFromUrl, which gives up on anything but [A-Za-z0-9_.()%-]. So keep
 * only ASCII letters, digits, space, _ . - ( ) and non-ASCII text (percent-encoded in the URL).
 */
export function safeName(name: string, id: string): string {
  const ext = (name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '').toLowerCase();
  const stem = name
    .slice(0, name.length - ext.length)
    .replace(/'/g, '\u2019')
    .replace(/[[{]/g, '(')
    .replace(/[\]}]/g, ')')
    .replace(/[\u0000-\u001f\u007f]|[^\w\s.()\-\u0080-\uffff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // ext4 caps a name at 255 bytes; cut by code point (never splitting an emoji) to ~150 bytes.
  let short = '';
  let bytes = 0;
  for (const ch of stem) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes > 150) break;
    short += ch;
  }
  short = short.trim();
  return `${short || 'SaveSama ' + id.slice(0, 8)}${ext}`;
}

function classify(e: unknown): TransferError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ENOSPC|no space|disk full/i.test(msg)) return new TransferError('storage', msg);
  if (/\b(404|409|410)\b/.test(msg)) return new TransferError('server', msg);
  return new TransferError('transfer', msg);
}

function append(target: File, source: File): void {
  const out = target.open();
  const input = source.open();
  try {
    out.offset = out.size ?? 0;
    const CHUNK = 4 * 1024 * 1024;
    for (;;) {
      const bytes = input.readBytes(CHUNK);
      if (bytes.length === 0) break;
      out.writeBytes(bytes);
    }
  } finally {
    out.close();
    input.close();
  }
}

/**
 * Pulls GET /jobs/{id}/file into the cache. A partial file from an earlier attempt is resumed
 * with a Range request (docs/API.md) and kept when this attempt fails.
 */
export async function downloadJobFile(
  job: Job,
  url: string,
  headers: Record<string, string>,
  onProgress: (received: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ uri: string; size: number }> {
  const total = job.file?.size ?? 0;
  const d = dir();
  const part = new File(d, `${job.id}.part`);
  const have = part.exists ? (part.size ?? 0) : 0;
  const need = Math.max(0, total - have);
  if (need + 16e6 > Paths.availableDiskSpace) throw new TransferError('storage', 'Not enough space');

  try {
    if (have > 0 && have < total) {
      const rest = new File(d, `${job.id}.rest`);
      if (rest.exists) rest.delete();
      await File.createDownloadTask(url, rest, {
        headers: { ...headers, Range: `bytes=${have}-` },
        signal,
        onProgress: ({ bytesWritten }) => onProgress(have + bytesWritten, total),
      }).downloadAsync();
      if ((rest.size ?? 0) === total) {
        // The server ignored the range and sent the whole file.
        part.delete();
        rest.moveSync(part);
      } else {
        append(part, rest);
        rest.delete();
      }
    } else if (have !== total || total === 0) {
      if (part.exists) part.delete();
      await File.createDownloadTask(url, part, {
        headers,
        signal,
        onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, total || Math.max(totalBytes, 0)),
      }).downloadAsync();
    }
  } catch (e) {
    if (signal.aborted) throw new TransferError('transfer', 'cancelled');
    throw classify(e);
  }

  const size = part.size ?? 0;
  let lastError: unknown;
  if (total && size !== total) {
    part.delete();
    throw new TransferError('transfer', `Size mismatch: ${size} of ${total}`);
  }
  const name = job.file?.name ?? job.id;
  const ext = (name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '').toLowerCase();
  for (const candidate of [safeName(name, job.id), `SaveSama ${job.id.slice(0, 8)}${ext}`]) {
    try {
      const final = new File(d, candidate);
      if (final.exists) final.delete();
      part.moveSync(final);
      return { uri: final.uri, size };
    } catch (e) {
      lastError = e;
    }
  }
  throw new TransferError('transfer', `Couldn't write the file: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export function discardLocal(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export function discardPartial(jobId: string): void {
  for (const suffix of ['.part', '.rest']) {
    try {
      const f = new File(Paths.cache, 'transfers', `${jobId}${suffix}`);
      if (f.exists) f.delete();
    } catch {
      // nothing to clean
    }
  }
}
