import { metaTagContent } from './html';
import { fetchHtml } from './http';
import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionError, ExtractionResult, MediaItem } from './types';

export async function extractThreads(
  shortcode: string,
  canonicalUrl: string
): Promise<ExtractionResult> {
  let lastError: unknown = null;
  try {
    const html = await fetchHtml(canonicalUrl);
    if (html) {
      const fromJson = parseThreadsHtml(html, shortcode);
      if (fromJson && fromJson.items.length > 0) return fromJson;

      const fromOg = parseOgFallback(html, shortcode);
      if (fromOg) return fromOg;
    }
  } catch (error) {
    lastError = error;
  }

  throw new ExtractionError(
    `threads extraction failed for ${shortcode}: ${String(lastError)}`,
    'Could not read this Threads post. It may be private, deleted, or text-only (no photos or videos to download).'
  );
}

/** Finds <script type="application/json" ... data-sjs>...</script> payloads in a Threads page. */
function extractDataSjsBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pattern = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

export function parseThreadsHtml(html: string, shortcode: string): ExtractionResult | null {
  for (const block of extractDataSjsBlocks(html)) {
    if (!block.includes(shortcode)) continue;
    if (!block.includes('image_versions2') && !block.includes('video_versions')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    const posts: Record<string, unknown>[] = [];
    collectPosts(parsed, shortcode, posts);
    for (const post of posts) {
      const result = mapThreadsPost(post, shortcode);
      if (result) return result;
    }
  }
  return null;
}

/** Recursively collects post objects whose code matches and that carry media fields. */
function collectPosts(
  node: unknown,
  shortcode: string,
  out: Record<string, unknown>[]
): void {
  if (Array.isArray(node)) {
    for (const child of node) collectPosts(child, shortcode, out);
    return;
  }
  if (!isRecord(node)) return;

  const hasMedia =
    node['video_versions'] !== undefined ||
    node['image_versions2'] !== undefined ||
    node['carousel_media'] !== undefined;
  if (node['code'] === shortcode && hasMedia) {
    out.push(node);
  }
  for (const value of Object.values(node)) collectPosts(value, shortcode, out);
}

export function mapThreadsPost(
  post: Record<string, unknown>,
  shortcode: string
): ExtractionResult | null {
  const items: MediaItem[] = [];
  const carousel = asArray(post['carousel_media']);

  if (carousel) {
    carousel.forEach((child, index) => {
      if (isRecord(child)) {
        const item = threadsNodeToItem(child, `${shortcode}-${index}`);
        if (item) items.push(item);
      }
    });
  } else {
    const item = threadsNodeToItem(post, shortcode);
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  return {
    platform: 'threads',
    shortcode,
    items,
    username: asString(getIn(post, ['user', 'username'])),
    caption: asString(getIn(post, ['caption', 'text'])),
  };
}

function threadsNodeToItem(node: Record<string, unknown>, id: string): MediaItem | null {
  const imageCandidates = asArray(getIn(node, ['image_versions2', 'candidates']));
  const firstCandidate = imageCandidates && imageCandidates.length > 0 ? imageCandidates[0] : null;
  const imageUrl = isRecord(firstCandidate) ? asString(firstCandidate['url']) : null;
  const width = asNumber(node['original_width']);
  const height = asNumber(node['original_height']);

  const videos = asArray(node['video_versions']);
  const firstVideo = videos && videos.length > 0 ? videos[0] : null;
  const videoUrl = isRecord(firstVideo) ? asString(firstVideo['url']) : null;

  if (videoUrl) {
    return { id, type: 'video', url: videoUrl, thumbnailUrl: imageUrl, width, height };
  }
  if (imageUrl) {
    return { id, type: 'image', url: imageUrl, thumbnailUrl: imageUrl, width, height };
  }
  return null;
}

function parseOgFallback(html: string, shortcode: string): ExtractionResult | null {
  const videoUrl = metaTagContent(html, 'og:video');
  const imageUrl = metaTagContent(html, 'og:image');
  const url = videoUrl ?? imageUrl;
  if (!url) return null;

  return {
    platform: 'threads',
    shortcode,
    items: [
      {
        id: shortcode,
        type: videoUrl ? 'video' : 'image',
        url,
        thumbnailUrl: imageUrl,
        width: null,
        height: null,
      },
    ],
    username: null,
    caption: null,
  };
}
