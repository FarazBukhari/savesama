import { ApiError, createClient, errorFromResponse, verifyServer } from '../api';

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    if (r instanceof Error) throw r;
    return r;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const target = { host: '127.0.0.1', port: 8765, token: 'secret' };

describe('request shapes', () => {
  it('info is unauthenticated', async () => {
    const { impl, calls } = mockFetch([json(200, { app: 'savesama', api: 1 })]);
    await createClient(target, impl).info();
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/v1/info');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('resolve posts the url with bearer auth', async () => {
    const { impl, calls } = mockFetch([json(200, { url: 'u', items: [] })]);
    await createClient(target, impl).resolve('https://youtu.be/x');
    expect(calls[0].url).toBe('http://127.0.0.1:8765/api/v1/resolve');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ url: 'https://youtu.be/x' });
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer secret');
    expect(h['Content-Type']).toBe('application/json');
  });

  it('createJobs sends items, mode and quality and unwraps jobs', async () => {
    const { impl, calls } = mockFetch([json(201, { jobs: [{ id: 'a' }, { id: 'b' }] })]);
    const jobs = await createClient(target, impl).createJobs({ url: 'u', items: [0, 2], mode: 'audio', quality: 720 });
    expect(jobs.map((j) => j.id)).toEqual(['a', 'b']);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ url: 'u', items: [0, 2], mode: 'audio', quality: 720 });
  });

  it('job routes', async () => {
    const { impl, calls } = mockFetch([json(200, { jobs: [] }), json(200, {}), json(200, {}), new Response(null, { status: 204 })]);
    const c = createClient(target, impl);
    await c.listJobs();
    await c.cancel('ab12');
    await c.retry('ab12');
    await expect(c.remove('ab12')).resolves.toBeUndefined();
    expect(calls.map((x) => `${x.init.method} ${x.url.replace(c.root, '')}`)).toEqual([
      'GET /jobs',
      'POST /jobs/ab12/cancel',
      'POST /jobs/ab12/retry',
      'DELETE /jobs/ab12',
    ]);
    expect(c.fileUrl('ab12')).toBe('http://127.0.0.1:8765/api/v1/jobs/ab12/file');
  });
});

describe('error mapping', () => {
  it.each([
    [401, 'unauthorized'],
    [422, 'login_required'],
    [422, 'unsupported_url'],
    [422, 'unavailable'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [502, 'network'],
    [409, 'conflict'],
    [500, 'internal'],
  ])('%i %s', async (status, code) => {
    const e = await errorFromResponse(json(status, { error: { code, message: 'Safe text.' } }));
    expect(e.code).toBe(code);
    expect(e.message).toBe('Safe text.');
    expect(e.status).toBe(status);
  });

  it('falls back to the status when the body is not the error shape', async () => {
    expect((await errorFromResponse(new Response('<html>', { status: 429 }))).code).toBe('rate_limited');
    expect((await errorFromResponse(json(401, {}))).code).toBe('unauthorized');
    expect((await errorFromResponse(json(418, { error: { code: 'teapot' } }))).code).toBe('internal');
  });

  it('maps fetch failures to offline', async () => {
    const { impl } = mockFetch([new TypeError('Network request failed')]);
    await expect(createClient(target, impl).listJobs()).rejects.toMatchObject({ code: 'offline' });
  });

  it('maps a slow server to timeout', async () => {
    jest.useFakeTimers();
    const impl = ((_: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const p = createClient(target, impl).info(2000);
    jest.advanceTimersByTime(2001);
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
    jest.useRealTimers();
  });
});

describe('verifyServer', () => {
  it('accepts a SaveSama server that takes the key', async () => {
    const { impl, calls } = mockFetch([json(200, { app: 'savesama', api: 1, name: 'PC' }), json(200, { jobs: [] })]);
    await expect(verifyServer(target, impl)).resolves.toMatchObject({ name: 'PC' });
    expect(calls[1].url.endsWith('/jobs')).toBe(true);
  });
  it('rejects other servers, API mismatch and wrong keys', async () => {
    await expect(verifyServer(target, mockFetch([json(200, { app: 'other' })]).impl)).rejects.toMatchObject({ code: 'not_savesama' });
    await expect(verifyServer(target, mockFetch([new Response('nope', { status: 404 })]).impl)).rejects.toMatchObject({
      code: 'not_savesama',
    });
    await expect(verifyServer(target, mockFetch([json(200, { app: 'savesama', api: 2 })]).impl)).rejects.toMatchObject({
      code: 'api_mismatch',
    });
    await expect(
      verifyServer(target, mockFetch([json(200, { app: 'savesama', api: 1 }), json(401, { error: { code: 'unauthorized' } })]).impl),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(verifyServer(target, mockFetch([new TypeError('fail')]).impl)).rejects.toBeInstanceOf(ApiError);
  });
});
