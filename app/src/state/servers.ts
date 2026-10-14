import { ApiError, createClient, TIMEOUTS, verifyServer, type ServerInfo } from '@/lib/api';
import { type PairInfo } from '@/lib/pairing';

import { deleteToken, setToken } from './persist';
import { activeServer, serversStore, settingsStore, type SavedServer, type ServerStatus } from './stores';
import { snack } from './ui';

export const LOCAL = { host: '127.0.0.1', port: 8765 };

export function clientFor(server: SavedServer | null = activeServer()) {
  if (!server) return null;
  return createClient({ host: server.host, port: server.port, token: serversStore.get().tokens[server.id] });
}

function setStatus(id: string, status: ServerStatus) {
  serversStore.set((s) => ({ status: { ...s.status, [id]: status } }));
}

const isLocal = (host: string) => host === '127.0.0.1' || host === 'localhost' || host === '::1';

export function findServer(host: string, port: number): SavedServer | null {
  return (
    serversStore
      .get()
      .servers.find((s) => s.port === port && (s.host === host || (isLocal(s.host) && isLocal(host)))) ?? null
  );
}

/** Confirms the server and saves + activates it. Throws ApiError with a client code on failure. */
export async function pairServer(info: PairInfo): Promise<SavedServer> {
  const serverInfo = await verifyServer({ host: info.host, port: info.port, token: info.token });
  const name = info.name || serverInfo.name || `${info.host}:${info.port}`;
  const existing = findServer(info.host, info.port);
  let server: SavedServer;
  if (existing) {
    server = { ...existing, name: info.name || existing.name, lastSeen: Date.now() };
  } else {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    server = { id, name, host: info.host, port: info.port, addedAt: Date.now(), lastSeen: Date.now() };
  }
  await setToken(server.id, info.token);
  serversStore.set((s) => ({
    servers: existing ? s.servers.map((x) => (x.id === server.id ? server : x)) : [...s.servers, server],
    activeId: server.id,
    tokens: { ...s.tokens, [server.id]: info.token },
    status: { ...s.status, [server.id]: 'online' },
    info: { ...s.info, [server.id]: serverInfo },
    discovered: isLocal(info.host) && info.port === LOCAL.port ? null : s.discovered,
  }));
  settingsStore.set({ onboarded: true });
  snack(existing ? `Already paired with ${server.name}. Switched to it.` : `Paired with ${server.name}`);
  return server;
}

export function activate(id: string): void {
  const server = serversStore.get().servers.find((s) => s.id === id);
  if (!server || serversStore.get().activeId === id) return;
  serversStore.set({ activeId: id });
  snack(`Now using ${server.name}`);
  void checkServer(server);
}

export function renameServer(id: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  serversStore.set((s) => ({ servers: s.servers.map((x) => (x.id === id ? { ...x, name: n } : x)) }));
}

export async function removeServer(id: string): Promise<void> {
  await deleteToken(id);
  serversStore.set((s) => {
    const servers = s.servers.filter((x) => x.id !== id);
    const tokens = { ...s.tokens };
    delete tokens[id];
    return { servers, tokens, activeId: s.activeId === id ? (servers[0]?.id ?? null) : s.activeId };
  });
}

/** GET /info on a saved server; updates status, info and last seen. */
export async function checkServer(server: SavedServer | null = activeServer(), quiet = false): Promise<ServerStatus | null> {
  if (!server) return null;
  const prev = serversStore.get().status[server.id];
  if (!quiet && prev !== 'online' && prev !== 'updating') setStatus(server.id, 'checking');
  const client = clientFor(server)!;
  try {
    const info = await client.info(TIMEOUTS.connect);
    if (info?.app !== 'savesama') throw new ApiError('not_savesama', '');
    serversStore.set((s) => ({
      info: { ...s.info, [server.id]: info },
      servers: s.servers.map((x) => (x.id === server.id ? { ...x, lastSeen: Date.now() } : x)),
      status: {
        ...s.status,
        [server.id]: s.status[server.id] === 'unauthorized' || s.status[server.id] === 'updating' ? s.status[server.id] : 'online',
      },
    }));
    return serversStore.get().status[server.id];
  } catch {
    if (serversStore.get().status[server.id] !== 'updating') setStatus(server.id, 'offline');
    return 'offline';
  }
}

export function markUnauthorized(id: string): void {
  setStatus(id, 'unauthorized');
}

export function markOnline(id: string): void {
  const st = serversStore.get().status[id];
  if (st !== 'online' && st !== 'updating') setStatus(id, 'online');
}

/** Probes 127.0.0.1:8765 (no auth). Sets `discovered` when it answers and isn't saved. */
export async function discoverLocal(): Promise<ServerInfo | null> {
  try {
    const info = await createClient(LOCAL).info(TIMEOUTS.probe);
    if (info?.app !== 'savesama') throw new Error('not savesama');
    const saved = findServer(LOCAL.host, LOCAL.port);
    serversStore.set({ discovered: saved ? null : info });
    return info;
  } catch {
    serversStore.set({ discovered: null });
    return null;
  }
}

const UPDATE_WAIT_MS = 60_000;
// The restart gap is short (about 0.2 s on a desktop, a few seconds on a phone), so poll fast.
const UPDATE_POLL_MS = 500;

export type UpdateOutcome = { kind: 'updated' | 'same'; version: string } | { kind: 'timeout' } | { kind: 'pending'; version: string } | { kind: 'error'; error: ApiError };

/**
 * POST /maintenance/update, then poll /info until extractor_version changes or 60 s pass
 * (docs/API.md). The server keeps answering with the old version while pip runs and only then
 * restarts, so an unchanged version is final only once the restart was seen (it went away and
 * came back) or the 60 s are up.
 */
export async function updateExtractor(): Promise<UpdateOutcome> {
  const server = activeServer();
  const client = clientFor(server);
  if (!server || !client) return { kind: 'timeout' };
  const before = serversStore.get().info[server.id]?.extractor_version ?? null;
  try {
    await client.update();
  } catch (e) {
    return { kind: 'error', error: e instanceof ApiError ? e : new ApiError('internal', String(e)) };
  }
  setStatus(server.id, 'updating');
  const started = Date.now();
  let lastInfo: ServerInfo | null = null;
  let restarted = false;
  let wentAway = false;
  while (Date.now() - started < UPDATE_WAIT_MS) {
    await new Promise((r) => setTimeout(r, UPDATE_POLL_MS));
    try {
      const info = await client.info(TIMEOUTS.probe);
      lastInfo = info;
      if (wentAway) restarted = true;
      if (info.extractor_version !== before || restarted) break;
    } catch {
      wentAway = true;
    }
  }
  const changed = !!lastInfo && lastInfo.extractor_version !== before;
  if (!lastInfo || (wentAway && !restarted)) {
    setStatus(server.id, 'offline');
    return { kind: 'timeout' };
  }
  if (!changed && !restarted) {
    // Answered with the old version all along: pip may still be running (slow on a phone), or
    // the restart was too quick to see. Either way, don't claim it's up to date.
    setStatus(server.id, 'online');
    return { kind: 'pending', version: lastInfo.extractor_version };
  }
  serversStore.set((s) => ({
    info: { ...s.info, [server.id]: lastInfo! },
    status: { ...s.status, [server.id]: 'online' },
    servers: s.servers.map((x) => (x.id === server.id ? { ...x, lastSeen: Date.now() } : x)),
  }));
  return { kind: changed ? 'updated' : 'same', version: lastInfo.extractor_version };
}
