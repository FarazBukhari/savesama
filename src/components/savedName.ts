import { MediaType } from 'expo-media-library';

import type { MediaItem } from '../extraction/types';

/**
 * How saved files are named.
 *
 * Current scheme: `<poster> - <code>[ - <n>][ - audio].<ext>`, e.g.
 *
 *   natgeo - DblSWtPD9-n.mp4          a reel by @natgeo
 *   natgeo - DblSWtPD9-n - 3.jpg      third photo of that carousel
 *   natgeo - DblSWtPD9-n - audio.m4a  its soundtrack
 *   Rick Astley - dQw4w9WgXcQ.mp4     a YouTube video (channel name)
 *
 * ` - ` is the separator because it appears in neither a handle (letters, digits,
 * `.` `_`) nor a post code (base64url: letters, digits, `-` `_`), so the name parses
 * back unambiguously. When the poster is unknown the platform stands in
 * (`instagram - DblSWtPD9-n.mp4`). MediaStore de-duplicates by appending ` (1)`,
 * which the parser tolerates.
 *
 * Legacy scheme (files saved before this): `savesama_<code>[-<n>]_<timestamp>_dl.<ext>`.
 * Those keep parsing so old rows don't regress to raw filenames.
 */
const SEPARATOR = ' - ';
const LEGACY_SAVED_FILENAME = /^savesama_(.+?)(?:-(\d+))?_\d{10,}_dl\.[A-Za-z0-9]+$/;
const POST_CODE = /^[A-Za-z0-9_-]{5,}$/;
/** The poster part, after sanitising: handles, or a channel name with spaces. */
const POSTER_CHARS = /[^A-Za-z0-9._ -]+/g;
const MAX_POSTER_LENGTH = 40;

export interface SavedName {
  /** Primary line: who posted it, or the kind when unknown. */
  title: string;
  /** "Video", "Photo 3", "Audio" — kind plus carousel position when there is one. */
  kind: string;
  /** The source post's code, or null if unrecognised. */
  code: string | null;
}

export function kindLabel(mediaType: MediaType): string {
  if (mediaType === MediaType.AUDIO) return 'Audio';
  if (mediaType === MediaType.VIDEO) return 'Video';
  return 'Photo';
}

/** Strips characters that can't go in a filename or would confuse the parser. */
export function sanitizePoster(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(POSTER_CHARS, '')
    .replace(/\s+/g, ' ')
    .replace(/ - /g, ' ')
    .trim()
    .slice(0, MAX_POSTER_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Filename for a media item about to be saved, extension included. */
export function buildSavedFilename(
  item: Pick<MediaItem, 'username' | 'postCode' | 'position' | 'platform' | 'id'>,
  format: 'video' | 'audio' | 'image',
  extension: string
): string {
  const poster = sanitizePoster(item.username) ?? item.platform ?? 'savesama';
  const code = item.postCode ?? item.id.replace(/[^A-Za-z0-9_-]/g, '');
  const parts = [poster, code];
  if (item.position) parts.push(String(item.position));
  if (format === 'audio') parts.push('audio');
  return `${parts.join(SEPARATOR)}.${extension.replace(/^\./, '')}`;
}

/** Splits a filename into its stem and lower-case extension (without the dot). */
export function splitExtension(filename: string): { stem: string; extension: string | null } {
  const match = /^(.*)\.([A-Za-z0-9]+)$/.exec(filename);
  if (!match) return { stem: filename, extension: null };
  return { stem: match[1], extension: match[2].toLowerCase() };
}

export function prettyName(filename: string | null, mediaType: MediaType): SavedName {
  const kind = kindLabel(mediaType);
  if (!filename) return { title: kind, kind, code: null };

  const legacy = LEGACY_SAVED_FILENAME.exec(filename);
  if (legacy) {
    const [, code, index] = legacy;
    return { title: kind, kind: index ? `${kind} ${index}` : kind, code };
  }

  const { stem } = splitExtension(filename);
  // Drop MediaStore's de-duplication suffix before parsing.
  const parts = stem.replace(/ \(\d+\)$/, '').split(SEPARATOR);
  if (parts.length >= 2 && POST_CODE.test(parts[1])) {
    const [poster, code, ...rest] = parts;
    const position = rest.find((part) => /^\d{1,2}$/.test(part));
    return {
      title: poster,
      kind: position ? `${kind} ${position}` : kind,
      code,
    };
  }

  // Not one of ours (or renamed by the user): show the name without its extension.
  return { title: stem, kind, code: null };
}
