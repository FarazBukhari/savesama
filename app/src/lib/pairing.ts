export interface PairInfo {
  host: string;
  port: number;
  token: string;
  name: string | null;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function isValidHost(host: string): boolean {
  const h = host.trim();
  if (!h) return false;
  if (IPV4.test(h)) return true;
  const bare = h.replace(/^\[|\]$/g, '');
  if (bare.includes(':')) return /^[0-9a-f:.]+$/i.test(bare) && bare.split(':').length <= 8 && bare.length >= 2;
  return HOSTNAME.test(h) && !/^\d+(\.\d+)*$/.test(h);
}

export function parsePort(port: string | number): number | null {
  const s = String(port).trim();
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 65535 ? n : null;
}

/** Parses savesama://pair?host=&port=&token=&name= (from a deep link or a QR code). */
export function parsePairLink(link: string): PairInfo | null {
  const m = link.trim().match(/^savesama:\/\/\/?pair\/?\?(.*)$/i);
  if (!m) return null;
  const params = new URLSearchParams(m[1]);
  return validatePair({
    host: params.get('host') ?? '',
    port: params.get('port') ?? '',
    token: params.get('token') ?? '',
    name: params.get('name'),
  });
}

export function validatePair(raw: {
  host: string;
  port: string | number;
  token: string;
  name?: string | null;
}): PairInfo | null {
  const host = raw.host.trim().replace(/^\[|\]$/g, '');
  const port = parsePort(raw.port);
  const token = raw.token.trim();
  if (!isValidHost(host) || port === null || !token) return null;
  const name = raw.name?.trim() || null;
  return { host, port, token, name };
}

export function baseUrl(host: string, port: number): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return `http://${h}:${port}`;
}

export function hostPort(host: string, port: number): string {
  return `${host.includes(':') ? `[${host}]` : host}:${port}`;
}
