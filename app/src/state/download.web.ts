import type { Job } from '@/lib/api';

export class TransferError extends Error {
  constructor(
    public kind: 'transfer' | 'storage' | 'server',
    message: string,
  ) {
    super(message);
  }
}

export function safeName(name: string): string {
  return name;
}

/** Web build: stream the file with progress, then hand it to the browser as a download. */
export async function downloadJobFile(
  job: Job,
  url: string,
  headers: Record<string, string>,
  onProgress: (received: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ uri: string; size: number }> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal });
  } catch (e) {
    throw new TransferError('transfer', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new TransferError(res.status === 409 || res.status === 404 ? 'server' : 'transfer', `HTTP ${res.status}`);
  const total = Number(res.headers.get('Content-Length')) || job.file?.size || 0;
  const reader = res.body?.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as unknown as BlobPart);
      received += value.byteLength;
      onProgress(received, total);
    }
  } else {
    const buf = await res.arrayBuffer();
    chunks.push(buf);
    received = buf.byteLength;
  }
  const blob = new Blob(chunks, { type: job.file?.mime || 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = job.file?.name ?? job.id;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { uri: objectUrl, size: received };
}

export function discardLocal(): void {}
export function discardPartial(): void {}
