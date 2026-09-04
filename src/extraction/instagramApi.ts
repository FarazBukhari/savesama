import { pickDashAudioUrl, pickDashVideo } from './dashManifest';
import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionResult, MediaFormat, MediaItem, SourcePlatform } from './types';

/** Instagram's public web app id, required on api/v1 requests. */
export const IG_APP_ID = '936619743392459';

// media_type in the private api: 1 = image, 2 = video, 8 = carousel (sidecar).
const MEDIA_TYPE_VIDEO = 2;

/**
 * Maps a response from `api/v1/media/{id}/info/` into an ExtractionResult.
 * The endpoint returns `{ items: [media] }`; a media node is either a single
 * image/video or a carousel whose children live under `carousel_media`.
 *
 * Threads serves the same endpoint and payload shape from its own origin, so it
 * reuses this mapper and only overrides `platform`. (Threads text-only posts use
 * media_type 19 and carry no image/video versions — those map to null.)
 */
export function mapMediaInfo(
  json: unknown,
  shortcode: string,
  platform: SourcePlatform = 'instagram'
): ExtractionResult | null {
  const media = getIn(json, ['items', 0]);
  if (!isRecord(media)) return null;

  const username = asString(getIn(media, ['user', 'username']));
  const items: MediaItem[] = [];
  const carousel = asArray(media['carousel_media']);
  if (carousel) {
    carousel.forEach((child, index) => {
      if (isRecord(child)) {
        const item = nodeToItem(child, `${shortcode}-${index}`, platform, {
          username,
          postCode: shortcode,
          position: index + 1,
        });
        if (item) items.push(item);
      }
    });
  } else {
    const item = nodeToItem(media, shortcode, platform, { username, postCode: shortcode });
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  return {
    platform,
    shortcode,
    items,
    username,
    caption: asString(getIn(media, ['caption', 'text'])),
  };
}

/** Post-level fields every item carries so the saved file can be named after its poster. */
interface ItemMeta {
  username: string | null;
  postCode: string;
  position?: number;
}

function nodeToItem(
  node: Record<string, unknown>,
  id: string,
  platform: SourcePlatform,
  meta: ItemMeta
): MediaItem | null {
  const isVideo = node['media_type'] === MEDIA_TYPE_VIDEO || Array.isArray(node['video_versions']);
  const thumbnail = asString(getIn(node, ['image_versions2', 'candidates', 0, 'url']));

  if (isVideo) {
    // `video_versions` is an array of the same clip at multiple resolutions
    // (Instagram serves them muxed, highest-first). Expose the whole ladder so
    // the resolution planner can honour a lower-quality preference without any
    // on-device transcoding in the common case.
    const formats = buildVideoFormats(node);
    if (formats.length === 0) return null;
    // video_dash_manifest carries an audio-only AdaptationSet; its video
    // representations are VP9 and deliberately unused (see dashManifest.ts).
    const audioOnlyUrl = pickDashAudioUrl(node['video_dash_manifest']);
    // The manifest's top video rung is the true original; only worth carrying when it
    // beats the muxed rendition, otherwise the default path already saves the best.
    const dashVideo = pickDashVideo(node['video_dash_manifest']);
    const muxedShortSide = Math.min(formats[0].width ?? 0, formats[0].height ?? 0);
    const dashShortSide = Math.min(dashVideo?.width ?? 0, dashVideo?.height ?? 0);
    const originalVideo = dashVideo && dashShortSide > muxedShortSide ? dashVideo : null;
    return {
      id,
      type: 'video',
      url: formats[0].url,
      thumbnailUrl: thumbnail,
      width: formats[0].width,
      height: formats[0].height,
      platform,
      formats,
      ...meta,
      ...(audioOnlyUrl ? { audioOnlyUrl } : {}),
      ...(originalVideo ? { originalVideo } : {}),
    };
  }

  if (!thumbnail) return null;
  // Unlike video_versions, `candidates` IS a genuine ladder (e.g. 640x1138, 480x854,
  // 320x569, 240x427), so a photo can honour a resolution preference by simply
  // picking a smaller rendition — no on-device resizing needed.
  const formats = buildImageFormats(node);
  return {
    id,
    type: 'image',
    url: thumbnail,
    thumbnailUrl: thumbnail,
    width: asNumber(getIn(node, ['image_versions2', 'candidates', 0, 'width'])),
    height: asNumber(getIn(node, ['image_versions2', 'candidates', 0, 'height'])),
    platform,
    ...meta,
    ...(formats.length > 1 ? { formats } : {}),
  };
}

/** Aspect ratios within 2% count as the same framing. */
const ASPECT_TOLERANCE = 0.02;

/**
 * Maps `image_versions2.candidates` into a quality ladder.
 *
 * ⚠️ The candidate list mixes two families: renditions of the full image
 * (640x1138, 480x854, 320x569, 240x427) *and* square centre-crops
 * (640x640, 480x480, 320x320, 240x240, 150x150). Ranking by size alone ties
 * 480x854 against 480x480 for a 480 target, and picking the crop would silently
 * save a cropped photo. So candidates are kept only when their aspect ratio
 * matches the post's own — `original_width`/`original_height` when present, else
 * the first (largest, always full-frame) candidate.
 */
function buildImageFormats(node: Record<string, unknown>): MediaFormat[] {
  const candidates = asArray(getIn(node, ['image_versions2', 'candidates'])) ?? [];

  const originalWidth = asNumber(node['original_width']);
  const originalHeight = asNumber(node['original_height']);
  let reference: number | null =
    originalWidth && originalHeight ? originalWidth / originalHeight : null;

  const formats: MediaFormat[] = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const url = asString(candidate['url']);
    const width = asNumber(candidate['width']);
    const height = asNumber(candidate['height']);
    if (!url || !width || !height) continue;

    const aspect = width / height;
    // No original dimensions to compare against: the largest candidate is full-frame,
    // so adopt its aspect as the reference.
    if (reference == null) reference = aspect;
    if (Math.abs(aspect - reference) / reference > ASPECT_TOLERANCE) continue;

    formats.push({ url, width, height, bitrate: null, hasAudio: true });
  }
  return formats;
}

/** Maps Instagram's `video_versions` array (highest-first) into muxed formats. */
function buildVideoFormats(node: Record<string, unknown>): MediaFormat[] {
  const versions = asArray(node['video_versions']) ?? [];
  const formats: MediaFormat[] = [];
  for (const version of versions) {
    if (!isRecord(version)) continue;
    const url = asString(version['url']);
    if (!url) continue;
    formats.push({
      url,
      width: asNumber(version['width']),
      height: asNumber(version['height']),
      bitrate: null,
      hasAudio: true,
    });
  }
  return formats;
}
