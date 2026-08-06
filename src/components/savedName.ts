import { MediaType } from 'expo-media-library';

/**
 * The app writes files as `savesama_<shortcode>[-<n>]_<timestamp>_dl.<ext>`.
 * That's a good filename and a terrible label — a list of
 * `savesama_DboX9Zakaiz-11_1785936336888_dl.jpg` tells you nothing about which
 * clip is which. This turns it back into something a person can read.
 *
 * `foxy_` is still accepted: files saved before the app was renamed are still
 * on the device and still listed in the Saved tab.
 */
const SAVED_FILENAME = /^(?:savesama|foxy)_(.+?)(?:-(\d+))?_\d{10,}_dl\.[A-Za-z0-9]+$/;

export interface SavedName {
  /** Primary line: what the thing is, and which one of the post it came from. */
  title: string;
  /** Secondary detail: the source post's shortcode, or null if unrecognised. */
  code: string | null;
}

export function kindLabel(mediaType: MediaType): string {
  if (mediaType === MediaType.AUDIO) return 'Audio';
  if (mediaType === MediaType.VIDEO) return 'Video';
  return 'Photo';
}

export function prettyName(filename: string | null, mediaType: MediaType): SavedName {
  const kind = kindLabel(mediaType);
  if (!filename) return { title: kind, code: null };

  const match = SAVED_FILENAME.exec(filename);
  if (match) {
    const [, code, index] = match;
    // Carousel items keep their position, so "Photo 3" and "Photo 4" stay
    // distinguishable without exposing the timestamp.
    return { title: index ? `${kind} ${index}` : kind, code };
  }

  // Not one of ours (or an older naming scheme): show the name without its
  // extension rather than inventing something.
  return { title: filename.replace(/\.[A-Za-z0-9]+$/, ''), code: null };
}
