import { ParsedLink } from './types';

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const TRAILING_PUNCTUATION = /[).,!?:;\]]+$/;

/** Pulls the first http(s) URL out of free-form text (e.g. share-sheet text with a message around it). */
export function extractUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  return match[0].replace(TRAILING_PUNCTUATION, '');
}

function splitUrl(raw: string): { host: string; path: string } | null {
  const match = raw.match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
  if (!match) return null;
  const host = match[1].toLowerCase().replace(/^www\./, '');
  const path = match[2].length > 0 ? match[2] : '/';
  return { host, path };
}

const IG_POST_PATH = /\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const THREADS_POST_PATH = /\/@[^/]+\/post\/([A-Za-z0-9_-]+)/;
const THREADS_SHORT_PATH = /^\/t\/([A-Za-z0-9_-]+)/;

export function parseLink(text: string): ParsedLink | null {
  const raw = extractUrl(text.trim());
  if (!raw) return null;
  const parts = splitUrl(raw);
  if (!parts) return null;
  const { host, path } = parts;

  const isInstagram =
    host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com');
  if (isInstagram) {
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

  const isThreads =
    host === 'threads.net' ||
    host === 'threads.com' ||
    host.endsWith('.threads.net') ||
    host.endsWith('.threads.com');
  if (isThreads) {
    const postMatch = path.match(THREADS_POST_PATH);
    if (postMatch) {
      return {
        platform: 'threads',
        shortcode: postMatch[1],
        canonicalUrl: `https://www.threads.com${path}`,
        needsResolution: false,
      };
    }
    if (THREADS_SHORT_PATH.test(path)) {
      return { platform: 'threads', shortcode: null, canonicalUrl: raw, needsResolution: true };
    }
    return null;
  }

  return null;
}
