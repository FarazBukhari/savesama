export const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'threads', 'reddit'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  threads: 'Threads',
  reddit: 'Reddit',
};

// Mirrors docs/API.md "Hosts" (and the server's urls.py). Subdomains are accepted.
const DOMAINS: Record<Platform, string[]> = {
  youtube: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  facebook: ['facebook.com', 'fb.watch', 'fb.com'],
  threads: ['threads.com', 'threads.net'],
  reddit: ['reddit.com', 'redd.it'],
};

// Outbound-link shims that redirect anywhere; the server refuses them too.
const BLOCKED = ['l.facebook.com', 'lm.facebook.com', 'l.instagram.com', 'l.threads.com', 'l.threads.net', 'out.reddit.com'];

export function platformOfHost(host: string): Platform | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h || BLOCKED.includes(h)) return null;
  for (const p of PLATFORMS) {
    if (DOMAINS[p].some((d) => h === d || h.endsWith('.' + d))) return p;
  }
  return null;
}

export interface ParsedLink {
  url: string;
  platform: Platform;
}

const TRAILING = /[.,;:!?)\]}>'"»”]+$/;

/** Turns one token into a normalised https link if it belongs to a supported platform. */
export function parseLink(token: string): ParsedLink | null {
  let raw = token.trim().replace(TRAILING, '');
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(raw)) return null;
    raw = 'https://' + raw;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const platform = platformOfHost(u.hostname);
  if (!platform) return null;
  u.protocol = 'https:';
  u.port = '';
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  let url = u.toString();
  if (url.endsWith('/') && u.pathname === '/' && !u.search) url = url.slice(0, -1);
  return { url, platform };
}

export interface ParseResult {
  links: ParsedLink[];
  /** Non-empty lines/tokens that weren't a supported link. */
  skipped: number;
}

/** Splits pasted or shared text into supported links (deduplicated, in order). */
export function parseLinks(text: string): ParseResult {
  const links: ParsedLink[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // A line can be "Watch this! https://..." from a share sheet; take its links, else count it.
    const found = line
      .split(/\s+/)
      .map(parseLink)
      .filter((l): l is ParsedLink => l !== null);
    if (found.length === 0) {
      skipped += 1;
      continue;
    }
    for (const l of found) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      links.push(l);
    }
  }
  return { links, skipped };
}

/** Key used for duplicate detection: host without www/m, path without trailing slash, no tracking. */
export function linkKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|mobile|web)\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const p = platformOfHost(u.hostname);
    if (p === 'youtube') {
      const v = u.searchParams.get('v');
      if (host === 'youtu.be') return `youtube:${path.slice(1)}`;
      if (v) return `youtube:${v}`;
      const m = path.match(/^\/(?:shorts|live|embed)\/([\w-]+)/);
      if (m) return `youtube:${m[1]}`;
    }
    if (p === 'reddit') {
      // www., old., redd.it/<id> and share-tracking variants of one post.
      const m = path.match(/\/comments\/([a-z0-9]+)/i) ?? (host === 'redd.it' ? path.match(/^\/([a-z0-9]+)$/i) : null);
      if (m) return `reddit:${m[1].toLowerCase()}`;
    }
    if (p === 'facebook' || p === 'tiktok') {
      // Facebook keeps the id in the query on some links (watch/?v=, story.php?story_fbid=).
      const keep = ['v', 'story_fbid', 'id', 'fbid'].map((k) => u.searchParams.get(k)).filter(Boolean);
      return `${host}${path}${keep.length ? '?' + keep.join('&') : ''}`;
    }
    return `${host}${path}`;
  } catch {
    return url;
  }
}

/** "instagram.com/reel/C9xT2..." style: no scheme, no www. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, '');
  } catch {
    return url;
  }
}
