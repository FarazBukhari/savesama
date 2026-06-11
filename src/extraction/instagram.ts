import { decodeHtmlEntities, decodeJsonString, metaTagContent } from './html';
import {
  DESKTOP_USER_AGENT,
  fetchHtml,
  fetchWithTimeout,
  getInstagramCsrfToken,
} from './http';
import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { ExtractionError, ExtractionResult, MediaItem } from './types';

const IG_APP_ID = '936619743392459';
/** Public doc_id for Instagram's PolarisPostActionLoadPostQueryQuery. */
const GRAPHQL_DOC_ID = '8845758582119845';

export async function extractInstagram(shortcode: string): Promise<ExtractionResult> {
  const strategies: ReadonlyArray<(code: string) => Promise<ExtractionResult | null>> = [
    fetchViaGraphQl,
    fetchViaEmbed,
    fetchViaOgTags,
  ];

  let lastError: unknown = null;
  for (const strategy of strategies) {
    try {
      const result = await strategy(shortcode);
      if (result && result.items.length > 0) return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw new ExtractionError(
    `instagram extraction failed for ${shortcode}: ${String(lastError)}`,
    'Could not read this Instagram post. It may be private, deleted, or Instagram may be temporarily blocking requests — try again in a minute.'
  );
}

async function fetchViaGraphQl(shortcode: string): Promise<ExtractionResult | null> {
  // Instagram walls the unauthenticated /api/graphql endpoint (it serves the logged-out
  // HTML shell). The /graphql/query endpoint works for public posts when accompanied by
  // an anonymous CSRF token, sent as both the X-CSRFToken header and a csrftoken cookie.
  const token = await getInstagramCsrfToken();
  if (!token) return null;

  const variables = JSON.stringify({ shortcode });
  const body = `variables=${encodeURIComponent(variables)}&doc_id=${GRAPHQL_DOC_ID}`;

  const response = await fetchWithTimeout('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': DESKTOP_USER_AGENT,
      'X-IG-App-ID': IG_APP_ID,
      'X-CSRFToken': token,
      Cookie: `csrftoken=${token}`,
      'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
      Referer: `https://www.instagram.com/p/${shortcode}/`,
      Accept: '*/*',
    },
    body,
  });
  if (!response.ok) return null;

  // If Instagram serves the HTML shell instead of JSON (e.g. blocked), parsing fails
  // and we fall through to the next strategy rather than throwing.
  const raw = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const media = getIn(json, ['data', 'xdt_shortcode_media']);
  if (!isRecord(media)) return null;
  return mapGraphqlMedia(media, shortcode);
}

export function mapGraphqlMedia(
  media: Record<string, unknown>,
  shortcode: string
): ExtractionResult | null {
  const items: MediaItem[] = [];
  const sidecarEdges = asArray(getIn(media, ['edge_sidecar_to_children', 'edges']));

  if (sidecarEdges) {
    sidecarEdges.forEach((edge, index) => {
      const node = getIn(edge, ['node']);
      if (isRecord(node)) {
        const item = graphqlNodeToItem(node, `${shortcode}-${index}`);
        if (item) items.push(item);
      }
    });
  } else {
    const item = graphqlNodeToItem(media, shortcode);
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  return {
    platform: 'instagram',
    shortcode,
    items,
    username: asString(getIn(media, ['owner', 'username'])),
    caption: asString(getIn(media, ['edge_media_to_caption', 'edges', 0, 'node', 'text'])),
  };
}

function graphqlNodeToItem(node: Record<string, unknown>, id: string): MediaItem | null {
  const isVideo = node['is_video'] === true;
  const displayUrl = asString(node['display_url']);
  const url = isVideo ? asString(node['video_url']) : displayUrl;
  if (!url) return null;
  return {
    id,
    type: isVideo ? 'video' : 'image',
    url,
    thumbnailUrl: displayUrl,
    width: asNumber(getIn(node, ['dimensions', 'width'])),
    height: asNumber(getIn(node, ['dimensions', 'height'])),
  };
}

async function fetchViaEmbed(shortcode: string): Promise<ExtractionResult | null> {
  const html = await fetchHtml(`https://www.instagram.com/p/${shortcode}/embed/captioned/`);
  if (!html) return null;
  return parseEmbedHtml(html, shortcode);
}

export function parseEmbedHtml(html: string, shortcode: string): ExtractionResult | null {
  const username = firstJsonString(html, /"username":"((?:[^"\\]|\\.)*)"/);
  const displayUrl = firstJsonString(html, /"display_url":"((?:[^"\\]|\\.)*)"/);

  const videoUrl = firstJsonString(html, /"video_url":"((?:[^"\\]|\\.)*)"/);
  if (videoUrl) {
    return {
      platform: 'instagram',
      shortcode,
      items: [
        {
          id: shortcode,
          type: 'video',
          url: videoUrl,
          thumbnailUrl: displayUrl,
          width: null,
          height: null,
        },
      ],
      username,
      caption: null,
    };
  }

  const imageMatch =
    html.match(/class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/) ??
    html.match(/src="([^"]+)"[^>]*?class="EmbeddedMediaImage"/);
  const imageUrl = imageMatch ? decodeHtmlEntities(imageMatch[1]) : displayUrl;
  if (!imageUrl) return null;

  return {
    platform: 'instagram',
    shortcode,
    items: [
      {
        id: shortcode,
        type: 'image',
        url: imageUrl,
        thumbnailUrl: imageUrl,
        width: null,
        height: null,
      },
    ],
    username,
    caption: null,
  };
}

function firstJsonString(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? decodeJsonString(match[1]) : null;
}

async function fetchViaOgTags(shortcode: string): Promise<ExtractionResult | null> {
  const html = await fetchHtml(`https://www.instagram.com/p/${shortcode}/`);
  if (!html) return null;

  const videoUrl = metaTagContent(html, 'og:video');
  const imageUrl = metaTagContent(html, 'og:image');
  const url = videoUrl ?? imageUrl;
  if (!url) return null;

  return {
    platform: 'instagram',
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
