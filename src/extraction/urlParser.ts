import { ParsedLink } from './types';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const TRAILING_PUNCTUATION = /[).,!?:;\]]+$/;

/** Pulls the first http(s) URL out of free-form text (e.g. share-sheet text with a message around it). */
export function extractUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  return match[0].replace(TRAILING_PUNCTUATION, '');
}

function splitUrl(raw: string): { host: string; path: string; query: string } | null {
  const match = raw.match(/^https?:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!match) return null;
  const host = match[1].toLowerCase().replace(/^www\./, '');
  const path = match[2].length > 0 ? match[2] : '/';
  const query = match[3] ?? '';
  return { host, path, query };
}

// Audio/song pages: /reels/audio/<numeric-id> (must be tested before IG_POST_PATH,
// which would otherwise capture the literal "audio" as a shortcode).
const IG_AUDIO_PATH = /\/reels?\/audio\/(\d+)/;
const IG_POST_PATH = /\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

// Threads post links come in three equivalent forms, all carrying the post code:
// /@username/post/<code> (canonical, optionally suffixed /media), /post/<code>,
// and the short /t/<code>. Threads redirects the latter two to the canonical form,
// so the code alone is enough — no share-link resolution needed.
const THREADS_POST_PATH = /\/(?:@[A-Za-z0-9_.]+\/)?(?:post|t)\/([A-Za-z0-9_-]+)/;

// YouTube video ids are always exactly 11 url-safe-base64 characters.
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
// Path-based forms: /shorts/<id>, /embed/<id>, /v/<id>, /live/<id>.
const YT_PATH = /\/(?:shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/;

function isYouTubeId(value: string | undefined): value is string {
  return typeof value === 'string' && YT_ID.test(value);
}

/** Reads a single query parameter out of a raw `?a=b&c=d` query string. */
function queryParam(query: string, name: string): string | undefined {
  const q = query.startsWith('?') ? query.slice(1) : query;
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (decodeURIComponent(key) !== name) continue;
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    return decodeURIComponent(value);
  }
  return undefined;
}

function youtubeVideoId(host: string, path: string, query: string): string | null {
  // youtu.be/<id> — the id is the first path segment.
  if (host === 'youtu.be') {
    const segment = path.split('/').filter(Boolean)[0];
    return isYouTubeId(segment) ? segment : null;
  }
  const pathMatch = path.match(YT_PATH);
  if (pathMatch && isYouTubeId(pathMatch[1])) return pathMatch[1];
  // /watch?v=<id> (and music/m. variants).
  const fromQuery = queryParam(query, 'v');
  return isYouTubeId(fromQuery) ? fromQuery : null;
}

export function parseLink(text: string): ParsedLink | null {
  const raw = extractUrl(text.trim());
  if (!raw) return null;
  const parts = splitUrl(raw);
  if (!parts) return null;
  const { host, path, query } = parts;

  const isYouTube =
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube.com');
  if (isYouTube) {
    const videoId = youtubeVideoId(host, path, query);
    if (!videoId) return null;
    return {
      platform: 'youtube',
      shortcode: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      needsResolution: false,
    };
  }

  // threads.net is the original host; it now redirects to threads.com, but old
  // links (and the share sheet on older app versions) still use it.
  const isThreads =
    host === 'threads.com' ||
    host === 'threads.net' ||
    host.endsWith('.threads.com') ||
    host.endsWith('.threads.net');
  if (isThreads) {
    const postMatch = path.match(THREADS_POST_PATH);
    if (!postMatch) return null;
    const shortcode = postMatch[1];
    return {
      platform: 'threads',
      shortcode,
      canonicalUrl: `https://www.threads.com/post/${shortcode}`,
      needsResolution: false,
    };
  }

  const isInstagram =
    host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com');
  if (isInstagram) {
    const audioMatch = path.match(IG_AUDIO_PATH);
    if (audioMatch) {
      return {
        platform: 'instagram',
        shortcode: null,
        canonicalUrl: `https://www.instagram.com/reels/audio/${audioMatch[1]}/`,
        needsResolution: false,
        unsupported: 'audio',
      };
    }
    // Share links carry an opaque token, not the post shortcode — resolve the redirect first.
    if (path.startsWith('/share/')) {
      return { platform: 'instagram', shortcode: null, canonicalUrl: raw, needsResolution: true };
    }
    const postMatch = path.match(IG_POST_PATH);
    if (postMatch) {
      const shortcode = postMatch[1];
      return {
        platform: 'instagram',
        shortcode,
        canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
        needsResolution: false,
      };
    }
    return null;
  }

  return null;
}
