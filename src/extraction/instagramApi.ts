import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionResult, MediaFormat, MediaItem } from './types';

/** Instagram's public web app id, required on api/v1 requests. */
export const IG_APP_ID = '936619743392459';

// media_type in the private api: 1 = image, 2 = video, 8 = carousel (sidecar).
const MEDIA_TYPE_VIDEO = 2;

/**
 * Maps a response from `api/v1/media/{id}/info/` into an ExtractionResult.
 * The endpoint returns `{ items: [media] }`; a media node is either a single
 * image/video or a carousel whose children live under `carousel_media`.
 */
export function mapMediaInfo(json: unknown, shortcode: string): ExtractionResult | null {
  const media = getIn(json, ['items', 0]);
  if (!isRecord(media)) return null;

  const items: MediaItem[] = [];
  const carousel = asArray(media['carousel_media']);
  if (carousel) {
    carousel.forEach((child, index) => {
      if (isRecord(child)) {
        const item = nodeToItem(child, `${shortcode}-${index}`);
        if (item) items.push(item);
      }
    });
  } else {
    const item = nodeToItem(media, shortcode);
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  return {
    platform: 'instagram',
    shortcode,
    items,
    username: asString(getIn(media, ['user', 'username'])),
    caption: asString(getIn(media, ['caption', 'text'])),
  };
}

function nodeToItem(node: Record<string, unknown>, id: string): MediaItem | null {
  const isVideo = node['media_type'] === MEDIA_TYPE_VIDEO || Array.isArray(node['video_versions']);
  const thumbnail = asString(getIn(node, ['image_versions2', 'candidates', 0, 'url']));

  if (isVideo) {
    // `video_versions` is an array of the same clip at multiple resolutions
    // (Instagram serves them muxed, highest-first). Expose the whole ladder so
    // the resolution planner can honour a lower-quality preference without any
    // on-device transcoding in the common case.
    const formats = buildVideoFormats(node);
    if (formats.length === 0) return null;
    return {
      id,
      type: 'video',
      url: formats[0].url,
      thumbnailUrl: thumbnail,
      width: formats[0].width,
      height: formats[0].height,
      platform: 'instagram',
      formats,
    };
  }

  if (!thumbnail) return null;
  return {
    id,
    type: 'image',
    url: thumbnail,
    thumbnailUrl: thumbnail,
    width: asNumber(getIn(node, ['image_versions2', 'candidates', 0, 'width'])),
    height: asNumber(getIn(node, ['image_versions2', 'candidates', 0, 'height'])),
    platform: 'instagram',
  };
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
