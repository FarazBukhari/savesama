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

// Audio/song pages: /reels/audio/<numeric-id> (must be tested before IG_POST_PATH,
// which would otherwise capture the literal "audio" as a shortcode).
const IG_AUDIO_PATH = /\/reels?\/audio\/(\d+)/;
const IG_POST_PATH = /\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

export function parseLink(text: string): ParsedLink | null {
  const raw = extractUrl(text.trim());
  if (!raw) return null;
  const parts = splitUrl(raw);
  if (!parts) return null;
  const { host, path } = parts;

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
