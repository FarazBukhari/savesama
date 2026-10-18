import type { Platform } from './links';
import type { Quality } from './quality';
import { baseUrl } from './pairing';

export type ErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'unsupported_url'
  | 'login_required'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'conflict'
  | 'internal';

/** Codes the app adds for failures that never reached the server's error shape. */
export type ClientCode = 'offline' | 'timeout' | 'not_savesama' | 'api_mismatch';

export interface ServerInfo {
  app: string;
  api: number;
  version: string;
  name: string;
  platforms: Platform[];
  ffmpeg: boolean;
  extractor_version: string;
}

export type ItemType = 'video' | 'image' | 'audio';

export interface ResolveItem {
  index: number;
  type: ItemType;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  qualities: number[];
  has_audio: boolean;
  /** Audio items: "Track · Artist" when known. */
  title?: string | null;
}

export interface Resolved {
  url: string;
  platform: Platform;
  id: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  duration: number | null;
  items: ResolveItem[];
}

export type Mode = 'media' | 'audio';
export type JobStatus = 'queued' | 'running' | 'processing' | 'done' | 'error' | 'cancelled';

export interface JobFile {
  name: string;
  size: number;
  mime: string;
  type: ItemType;
}

export interface Job {
  id: string;
  url: string;
  platform: Platform;
  item_index: number;
  mode: Mode;
  quality: Quality;
  status: JobStatus;
  progress: number;
  bytes_done: number | null;
  bytes_total: number | null;
  speed: number | null;
  eta: number | null;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  file: JobFile | null;
  error: { code: ErrorCode; message: string } | null;
  created_at: number;
  finished_at: number | null;
}

export interface CreateJobsBody {
  url: string;
  items?: number[] | null;
  mode: Mode;
  quality: Quality;
}

export class ApiError extends Error {
  constructor(
    public code: ErrorCode | ClientCode,
    message: string,
    public status: number = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KNOWN: ErrorCode[] = [
  'unauthorized',
  'bad_request',
  'unsupported_url',
  'login_required',
  'not_found',
  'rate_limited',
  'unavailable',
  'network',
  'conflict',
  'internal',
];

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 502 || status === 503 || status === 504) return 'network';
  if (status === 400 || status === 413) return 'bad_request';
  return 'internal';
}

/** Maps a non-2xx response to an ApiError using the server's {"error": {...}} shape. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  let code: ErrorCode = codeForStatus(res.status);
  let message = '';
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.code && (KNOWN as string[]).includes(body.error.code)) code = body.error.code as ErrorCode;
    if (typeof body?.error?.message === 'string') message = body.error.message;
  } catch {
    // Not JSON (a proxy page, a different server): keep the status-derived code.
  }
  return new ApiError(code, message, res.status);
}

export interface Target {
  host: string;
  port: number;
  token?: string | null;
}

type FetchLike = typeof fetch;

export const TIMEOUTS = { connect: 10_000, resolve: 60_000, probe: 2_000 } as const;

export function createClient(target: Target, fetchImpl: FetchLike = (...a) => fetch(...a)) {
  const root = `${baseUrl(target.host, target.port)}/api/v1`;

  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; timeout?: number; signal?: AbortSignal; auth?: boolean } = {},
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeout ?? TIMEOUTS.connect);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.auth !== false && target.token) headers.Authorization = `Bearer ${target.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetchImpl(root + path, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      if (timedOut) throw new ApiError('timeout', 'The request timed out.');
      throw new ApiError('offline', e instanceof Error ? e.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (!res.ok) throw await errorFromResponse(res);
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError('not_savesama', 'The response was not JSON.', res.status);
    }
  }

  return {
    root,
    info: (timeout?: number) => request<ServerInfo>('GET', '/info', { auth: false, timeout }),
    resolve: (url: string, signal?: AbortSignal) =>
      request<Resolved>('POST', '/resolve', { body: { url }, timeout: TIMEOUTS.resolve, signal }),
    createJobs: (body: CreateJobsBody) =>
      request<{ jobs: Job[] }>('POST', '/jobs', { body, timeout: TIMEOUTS.resolve }).then((r) => r.jobs),
    listJobs: () => request<{ jobs: Job[] }>('GET', '/jobs').then((r) => r.jobs),
    getJob: (id: string) => request<Job>('GET', `/jobs/${encodeURIComponent(id)}`),
    cancel: (id: string) => request<Job>('POST', `/jobs/${encodeURIComponent(id)}/cancel`),
    retry: (id: string) => request<Job>('POST', `/jobs/${encodeURIComponent(id)}/retry`),
    remove: (id: string) => request<void>('DELETE', `/jobs/${encodeURIComponent(id)}`),
    update: () => request<{ status: string }>('POST', '/maintenance/update'),
    fileUrl: (id: string) => `${root}/jobs/${encodeURIComponent(id)}/file`,
    authHeader: (): Record<string, string> => (target.token ? { Authorization: `Bearer ${target.token}` } : {}),
  };
}

export type Client = ReturnType<typeof createClient>;

/** Checks that something at host:port is a SaveSama server speaking API 1 and accepts the token. */
export async function verifyServer(target: Target, fetchImpl?: FetchLike): Promise<ServerInfo> {
  const client = createClient(target, fetchImpl);
  let info: ServerInfo;
  try {
    info = await client.info();
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'offline' || e.code === 'timeout')) throw e;
    throw new ApiError('not_savesama', 'Not a SaveSama server.');
  }
  if (!info || info.app !== 'savesama') throw new ApiError('not_savesama', 'Not a SaveSama server.');
  if (info.api !== 1) throw new ApiError('api_mismatch', String(info.api));
  await client.listJobs();
  return info;
}
