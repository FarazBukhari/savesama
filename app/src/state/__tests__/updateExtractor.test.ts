import { updateExtractor } from '../servers';
import { serversStore } from '../stores';

jest.mock('../persist', () => ({ loadJson: jest.fn(), persistStore: jest.fn(), getToken: jest.fn(), setToken: jest.fn(), deleteToken: jest.fn() }));
jest.mock('../ui', () => ({ snack: jest.fn() }));

const info = (v: string) => ({ app: 'savesama', api: 1, version: '0.1.0', name: 'Test', platforms: [], ffmpeg: true, extractor_version: v });

/** A fake server: /info answers per `phase(msSinceUpdate)`; null means the process is down. */
function serve(phase: (t: number) => string | null) {
  let t0 = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/maintenance/update')) {
      t0 = Date.now();
      return new Response(JSON.stringify({ status: 'updating' }), { status: 202 });
    }
    if (init?.method === 'GET' && url.endsWith('/info')) {
      const v = phase(Date.now() - t0);
      if (v === null) throw new TypeError('Network request failed');
      return new Response(JSON.stringify(info(v)), { status: 200 });
    }
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
}

async function run() {
  const p = updateExtractor();
  await jest.advanceTimersByTimeAsync(65_000);
  return p;
}

beforeEach(() => {
  jest.useFakeTimers();
  serversStore.set({
    servers: [{ id: 's1', name: 'Test', host: '127.0.0.1', port: 8765, addedAt: 0, lastSeen: null }],
    activeId: 's1',
    tokens: { s1: 't' },
    info: { s1: info('2026.08.19') },
    status: { s1: 'online' },
  });
});
afterEach(() => jest.useRealTimers());

it('waits through a slow pip install and reports the new version after the restart', async () => {
  // Old version for 20 s (pip), down for 3 s (restart), then the new version.
  serve((t) => (t < 20_000 ? '2026.08.19' : t < 23_000 ? null : '2026.10.01'));
  await expect(run()).resolves.toEqual({ kind: 'updated', version: '2026.10.01' });
  expect(serversStore.get().info.s1.extractor_version).toBe('2026.10.01');
});

it('reports "same" only after the restart was seen', async () => {
  serve((t) => (t < 15_000 ? '2026.08.19' : t < 17_000 ? null : '2026.08.19'));
  await expect(run()).resolves.toEqual({ kind: 'same', version: '2026.08.19' });
});

it('is pending, not "up to date", when the server never restarted within 60 s', async () => {
  serve(() => '2026.08.19');
  await expect(run()).resolves.toEqual({ kind: 'pending', version: '2026.08.19' });
  expect(serversStore.get().status.s1).toBe('online');
});

it('times out when the server went away and did not come back', async () => {
  serve((t) => (t < 5_000 ? '2026.08.19' : null));
  await expect(run()).resolves.toEqual({ kind: 'timeout' });
  expect(serversStore.get().status.s1).toBe('offline');
});
