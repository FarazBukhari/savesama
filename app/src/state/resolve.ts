import { ApiError, type Resolved } from '@/lib/api';

import { clientFor } from './servers';
import { activeServer } from './stores';

const cache = new Map<string, { at: number; data: Resolved }>();
const inflight = new Map<string, Promise<Resolved>>();
const TTL = 30 * 60_000;

export class NotPairedError extends Error {}

/** POST /resolve with a short cache so Batch rows and their stacked Preview share one result. */
export function resolveLink(url: string, force = false): Promise<Resolved> {
  const server = activeServer();
  const client = clientFor(server);
  if (!server || !client) return Promise.reject(new NotPairedError('not paired'));
  const key = `${server.id}|${url}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  const running = inflight.get(key);
  if (running && !force) return running;
  const p = client
    .resolve(url)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function peekResolved(url: string): Resolved | null {
  const server = activeServer();
  if (!server) return null;
  return cache.get(`${server.id}|${url}`)?.data ?? null;
}

export { ApiError };
