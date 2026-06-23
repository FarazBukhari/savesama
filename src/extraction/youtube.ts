import { fetchWithTimeout } from './http';
import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionError, ExtractionResult, MediaItem } from './types';

/**
 * YouTube extraction uses the InnerTube `player` endpoint with the ANDROID_VR
 * client context. Unlike the web/plain ANDROID clients (which now fail an
 * attestation/PoToken "precondition check" for anonymous callers), ANDROID_VR
 * still returns progressive stream URLs directly in `streamingData.formats[].url`
 * — they are not signature-ciphered and don't require running YouTube's player
 * JS, so we can extract entirely on-device (same no-backend philosophy as
 * Instagram).
 *
 * We deliberately pick a *progressive* format (muxed audio + video, e.g. itag
 * 18 = 360p, itag 22 = 720p). That single URL works for both "Save video" and
 * "Save audio" — the on-device M4A remux in download.ts reads the AAC track
 * straight out of the MP4. Higher resolutions (1080p+) are only served as
 * separate adaptive video/audio streams, which would need on-device muxing
 * (a future native change); see docs/MAINTENANCE.md §8.
 */

// ANDROID_VR client identity. If extraction breaks, refresh the client version
// (and revisit the client choice) first — see docs/MAINTENANCE.md §8.
const CLIENT_NAME = 'ANDROID_VR';
const CLIENT_VERSION = '1.60.19';
const CLIENT_NAME_ID = '28';
const CLIENT_USER_AGENT =
  'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; GB) gzip';

export async function extractYouTube(videoId: string): Promise<ExtractionResult> {
  let player: unknown;
  try {
    player = await fetchPlayerResponse(videoId);
  } catch (error) {
    throw new ExtractionError(
      `youtube player request failed for ${videoId}: ${String(error)}`,
      'Could not reach YouTube. Check your connection and try again in a minute.'
    );
  }

  const result = mapPlayerResponse(player, videoId);
  if (result) return result;

  // No progressive stream: distinguish "can't be played" from "no usable format".
  throw playabilityError(player, videoId);
}

async function fetchPlayerResponse(videoId: string): Promise<unknown> {
  const body = JSON.stringify({
    context: {
      client: {
        clientName: CLIENT_NAME,
        clientVersion: CLIENT_VERSION,
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        hl: 'en',
        gl: 'US',
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  });

  const response = await fetchWithTimeout(
    'https://www.youtube.com/youtubei/v1/player',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': CLIENT_USER_AGENT,
        'X-YouTube-Client-Name': CLIENT_NAME_ID,
        'X-YouTube-Client-Version': CLIENT_VERSION,
        Accept: '*/*',
      },
      body,
    }
  );
  if (!response.ok) throw new Error(`player endpoint returned ${response.status}`);

  const raw = await response.text();
  return JSON.parse(raw);
}

/**
 * Maps an InnerTube player response into an ExtractionResult, or null when no
 * progressive (muxed) MP4 stream with a direct URL is available. Exported for
 * unit testing.
 */
export function mapPlayerResponse(
  player: unknown,
  videoId: string
): ExtractionResult | null {
  if (!isRecord(player)) return null;

  const best = pickBestProgressive(progressiveFormats(player));
  if (!best) return null;
  const url = asString(best['url']);
  if (!url) return null;

  return {
    platform: 'youtube',
    shortcode: videoId,
    items: [
      {
        id: videoId,
        type: 'video',
        url,
        thumbnailUrl: pickThumbnail(player, videoId),
        width: asNumber(best['width']),
        height: asNumber(best['height']),
      } satisfies MediaItem,
    ],
    username: asString(getIn(player, ['videoDetails', 'author'])),
    caption: asString(getIn(player, ['videoDetails', 'title'])),
  };
}

/**
 * Progressive formats live in `streamingData.formats` (muxed audio + video);
 * `adaptiveFormats` are video-only or audio-only and are intentionally ignored.
 * We keep only MP4 entries that expose a direct `url` (ANDROID client) — entries
 * that only carry `signatureCipher` would need on-device JS deciphering.
 */
function progressiveFormats(player: Record<string, unknown>): Record<string, unknown>[] {
  const formats = asArray(getIn(player, ['streamingData', 'formats'])) ?? [];
  return formats.filter(isRecord).filter((format) => {
    const mime = asString(format['mimeType']) ?? '';
    return mime.startsWith('video/mp4') && asString(format['url']) !== null;
  });
}

function pickBestProgressive(
  formats: Record<string, unknown>[]
): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const format of formats) {
    // Prefer higher resolution, then higher bitrate.
    const score = (asNumber(format['height']) ?? 0) * 1e8 + (asNumber(format['bitrate']) ?? 0);
    if (score > bestScore) {
      best = format;
      bestScore = score;
    }
  }
  return best;
}

function pickThumbnail(player: Record<string, unknown>, videoId: string): string {
  const thumbnails = asArray(getIn(player, ['videoDetails', 'thumbnail', 'thumbnails']));
  if (thumbnails && thumbnails.length > 0) {
    const url = asString(getIn(thumbnails[thumbnails.length - 1], ['url']));
    if (url) return url;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function playabilityError(player: unknown, videoId: string): ExtractionError {
  const status = asString(getIn(player, ['playabilityStatus', 'status']));
  const reason =
    asString(getIn(player, ['playabilityStatus', 'reason'])) ??
    asString(getIn(player, ['playabilityStatus', 'messages', 0]));

  if (status === 'LOGIN_REQUIRED') {
    // "confirm you're not a bot" is IP-based rate limiting, not an age/privacy wall —
    // surface it as a transient block the user can retry rather than a hard failure.
    if (reason && /not a bot/i.test(reason)) {
      return new ExtractionError(
        `youtube bot check for ${videoId}: ${reason}`,
        'YouTube is temporarily blocking anonymous downloads from this network. Wait a minute and try again.'
      );
    }
    return new ExtractionError(
      `youtube login required for ${videoId}: ${reason ?? 'no reason'}`,
      'This video needs sign-in (it’s age-restricted or private), so it can’t be downloaded.'
    );
  }
  if (status === 'UNPLAYABLE' || status === 'ERROR') {
    return new ExtractionError(
      `youtube unplayable ${videoId}: ${reason ?? 'no reason'}`,
      reason ?? 'This video can’t be downloaded. It may be private, removed, or region-locked.'
    );
  }
  return new ExtractionError(
    `youtube: no progressive format for ${videoId} (status ${status ?? 'unknown'})`,
    'Could not get a downloadable stream for this video — it may be a livestream or YouTube may be limiting downloads. Try again in a minute.'
  );
}
