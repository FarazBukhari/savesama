import { getFetcher } from '../services/mediaSession';
import { shortcodeToMediaId } from './shortcode';
import { mapMediaInfo } from './threadsApi';
import { ExtractionError, ExtractionResult } from './types';

/**
 * Threads has no usable anonymous path: post pages redirect logged-out visitors to
 * the Instagram OAuth login and `api/v1/media/{id}/info/` answers with the HTML app
 * shell. So extraction always runs through the authenticated WebView fetch.
 *
 * Post codes use the same url-safe-base64 encoding of the numeric media id as
 * Instagram shortcodes, so shortcodeToMediaId works unchanged.
 */
export async function extractThreads(shortcode: string): Promise<ExtractionResult> {
  const fetcher = getFetcher('threads');
  if (!fetcher) {
    throw new ExtractionError(
      'threads resolver not mounted',
      'Threads downloads need the app’s sign-in view, which isn’t available here.'
    );
  }

  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId) {
    throw new ExtractionError(
      `invalid threads post code: ${shortcode}`,
      'That Threads link doesn’t look like a post. Open the post and copy its link again.'
    );
  }

  const result = await fetcher(mediaId);
  if (result.cancelled) {
    throw new ExtractionError(
      'threads login cancelled',
      'Threads requires a login to download. Sign in to save this post.'
    );
  }
  if (!result.ok) {
    throw new ExtractionError(
      `threads media-info failed for ${shortcode}: status ${result.status}`,
      'Could not read this Threads post. It may be private, deleted, or from an account you don’t follow.'
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(result.body);
  } catch {
    throw new ExtractionError(
      `threads media-info was not json for ${shortcode}`,
      'Could not read this Threads post. Try again in a minute.'
    );
  }

  const mapped = mapMediaInfo(json, shortcode, 'threads');
  if (!mapped) {
    // Text-only posts (media_type 19) carry no image or video versions.
    throw new ExtractionError(
      `threads post has no media: ${shortcode}`,
      'This Threads post has no photo or video to download.'
    );
  }
  return mapped;
}
