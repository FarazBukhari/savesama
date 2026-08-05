import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionResult, MediaItem, SourcePlatform } from './types';

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
    platform,
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
    const videoUrl = asString(getIn(node, ['video_versions', 0, 'url']));
    if (!videoUrl) return null;
    return {
      id,
      type: 'video',
      url: videoUrl,
      thumbnailUrl: thumbnail,
      width: asNumber(getIn(node, ['video_versions', 0, 'width'])),
      height: asNumber(getIn(node, ['video_versions', 0, 'height'])),
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
  };
}
