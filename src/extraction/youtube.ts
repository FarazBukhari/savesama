import { fetchWithTimeout } from './http';
import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionError, ExtractionResult, MediaFormat, MediaItem } from './types';

/**
 * YouTube extraction uses the InnerTube `player` endpoint with the ANDROID_VR
 * client context. Unlike the web/plain ANDROID clients (which now fail an
 * attestation/PoToken "precondition check" for anonymous callers), ANDROID_VR
 * still returns progressive stream URLs directly in `streamingData.formats[].url`
 * — they are not signature-ciphered and don't require running YouTube's player
 * JS, so we can extract entirely on-device (same no-backend philosophy as
 * Instagram).
 *
 * IMPORTANT: the request must carry a `visitorData` session token (fetched from
 * the InnerTube `visitor_id` endpoint, then sent in `context.client.visitorData`
 * + the `X-Goog-Visitor-Id` header). Without it, YouTube bot-checks many videos
 * with `LOGIN_REQUIRED` / "confirm you're not a bot" even on residential IPs.
 * This mirrors how Instagram requires an anonymous CSRF token first.
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

let cachedVisitorData: string | null = null;

function clientContext(visitorData: string | null): Record<string, unknown> {
  const client: Record<string, unknown> = {
    clientName: CLIENT_NAME,
    clientVersion: CLIENT_VERSION,
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
    osName: 'Android',
    osVersion: '12L',
    hl: 'en',
    gl: 'US',
  };
  if (visitorData) client['visitorData'] = visitorData;
  return client;
}

/**
 * Fetches (and caches) an anonymous `visitorData` session token from the
 * InnerTube `visitor_id` endpoint. Returns null on failure — the player call
 * can still be attempted without it, just with a higher bot-check rate.
 */
async function getVisitorData(forceRefresh = false): Promise<string | null> {
  if (cachedVisitorData && !forceRefresh) return cachedVisitorData;
  try {
    const response = await fetchWithTimeout(
      'https://www.youtube.com/youtubei/v1/visitor_id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': CLIENT_USER_AGENT,
          'X-YouTube-Client-Name': CLIENT_NAME_ID,
          'X-YouTube-Client-Version': CLIENT_VERSION,
          Accept: '*/*',
        },
        body: JSON.stringify({ context: { client: clientContext(null) } }),
      }
    );
    if (!response.ok) return null;
    const json = JSON.parse(await response.text());
    cachedVisitorData = asString(getIn(json, ['responseContext', 'visitorData']));
  } catch {
    cachedVisitorData = null;
  }
  return cachedVisitorData;
}

/** Test-only: clears the cached visitorData between cases. */
export function resetYouTubeVisitorDataCache(): void {
  cachedVisitorData = null;
}

export async function extractYouTube(videoId: string): Promise<ExtractionResult> {
  let player = await requestPlayer(videoId, false);

  let result = mapPlayerResponse(player, videoId);
  if (result) return result;

  // A bot-check usually means a missing/stale session token — refresh the
  // visitorData once and retry before giving up.
  if (isBotCheck(player)) {
    player = await requestPlayer(videoId, true);
    result = mapPlayerResponse(player, videoId);
    if (result) return result;
  }

  // No progressive stream: distinguish "can't be played" from "no usable format".
  throw playabilityError(player, videoId);
}

async function requestPlayer(videoId: string, refreshVisitorData: boolean): Promise<unknown> {
  try {
    const visitorData = await getVisitorData(refreshVisitorData);
    return await fetchPlayerResponse(videoId, visitorData);
  } catch (error) {
    throw new ExtractionError(
      `youtube player request failed for ${videoId}: ${String(error)}`,
      'Could not reach YouTube. Check your connection and try again in a minute.'
    );
  }
}

function isBotCheck(player: unknown): boolean {
  const status = asString(getIn(player, ['playabilityStatus', 'status']));
  const reason = asString(getIn(player, ['playabilityStatus', 'reason']));
  return status === 'LOGIN_REQUIRED' && !!reason && /not a bot/i.test(reason);
}

async function fetchPlayerResponse(videoId: string, visitorData: string | null): Promise<unknown> {
  const body = JSON.stringify({
    context: { client: clientContext(visitorData) },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': CLIENT_USER_AGENT,
    'X-YouTube-Client-Name': CLIENT_NAME_ID,
    'X-YouTube-Client-Version': CLIENT_VERSION,
    Accept: '*/*',
  };
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  const response = await fetchWithTimeout('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers,
    body,
  });
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
        platform: 'youtube',
        formats: buildFormats(player),
      } satisfies MediaItem,
    ],
    username: asString(getIn(player, ['videoDetails', 'author'])),
    caption: asString(getIn(player, ['videoDetails', 'title'])),
  };
}

/**
 * Builds the full quality ladder offered to the resolution planner:
 *  - progressive MP4 streams (muxed audio+video, ≤720p) → `hasAudio: true`
 *  - adaptive **H.264/MP4** video-only streams (1080p+) → `hasAudio: false`,
 *    each paired with the best adaptive **AAC (M4A)** audio-only stream.
 *
 * We deliberately restrict adaptive picks to H.264 video + AAC audio so the
 * on-device muxer can passthrough-remux them into MP4. YouTube's VP9/Opus/WebM
 * variants cannot be muxed into an MP4 container, so they are excluded here.
 */
export function buildFormats(player: Record<string, unknown>): MediaFormat[] {
  const formats: MediaFormat[] = progressiveFormats(player).map((format) => ({
    url: asString(format['url']) as string,
    width: asNumber(format['width']),
    height: asNumber(format['height']),
    bitrate: asNumber(format['bitrate']),
    hasAudio: true,
  }));

  const audioUrl = pickBestAdaptiveAudio(player);
  if (audioUrl) {
    for (const format of adaptiveVideoFormats(player)) {
      const videoUrl = asString(format['url']);
      if (!videoUrl) continue;
      formats.push({
        url: videoUrl,
        width: asNumber(format['width']),
        height: asNumber(format['height']),
        bitrate: asNumber(format['bitrate']),
        hasAudio: false,
        audioUrl,
      });
    }
  }

  return formats;
}

/** Adaptive H.264/MP4 video-only streams with a direct url (mux-compatible). */
function adaptiveVideoFormats(player: Record<string, unknown>): Record<string, unknown>[] {
  const formats = asArray(getIn(player, ['streamingData', 'adaptiveFormats'])) ?? [];
  return formats.filter(isRecord).filter((format) => {
    const mime = asString(format['mimeType']) ?? '';
    return (
      mime.startsWith('video/mp4') &&
      /avc1|h264/i.test(mime) &&
      asString(format['url']) !== null
    );
  });
}

/** Highest-bitrate adaptive AAC (M4A) audio-only stream url, or null. */
function pickBestAdaptiveAudio(player: Record<string, unknown>): string | null {
  const formats = asArray(getIn(player, ['streamingData', 'adaptiveFormats'])) ?? [];
  let bestUrl: string | null = null;
  let bestBitrate = -1;
  for (const format of formats) {
    if (!isRecord(format)) continue;
    const mime = asString(format['mimeType']) ?? '';
    if (!mime.startsWith('audio/mp4') || !/mp4a/i.test(mime)) continue;
    const url = asString(format['url']);
    if (!url) continue;
    const bitrate = asNumber(format['bitrate']) ?? 0;
    if (bitrate > bestBitrate) {
      bestBitrate = bitrate;
      bestUrl = url;
    }
  }
  return bestUrl;
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
