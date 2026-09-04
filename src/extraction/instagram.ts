import { getFetcher } from '../services/mediaSession';
import { getPreferences } from '../services/preferences';
import { describeBlock } from '../services/sessionThrottle';
import { decodeHtmlEntities, decodeJsonString } from './html';
import {
  CRAWLER_USER_AGENT,
  DESKTOP_USER_AGENT,
  fetchHtml,
  fetchWithTimeout,
  getInstagramCsrfToken,
} from './http';
import { IG_APP_ID, mapMediaInfo } from './instagramApi';
import { asArray, asNumber, asString, getIn, isRecord } from './json';
import { shortcodeToMediaId } from './shortcode';
import { ExtractionError, ExtractionResult, MediaItem } from './types';

/**
 * Public doc_id for Instagram's PolarisPostActionLoadPostQueryQuery. Meta rotates
 * this; a retired id makes /graphql/query return `{"errors":[{"message":"execution
 * error","severity":"CRITICAL"}],"data":null}` (HTTP 200) for every post. When that
 * happens, grab the current id from the web client and bump this. (Verified June 2026.)
 */
const GRAPHQL_DOC_ID = '10015901848480474';

export async function extractInstagram(shortcode: string): Promise<ExtractionResult> {
  // The authenticated WebView fetch is the primary path; downloads run as the user's
  // own account. The anonymous strategies below remain for environments without a
  // mounted resolver (web build, tests, e2e script) and for users who never signed in.
  const authed = await extractViaAuthenticatedFetch(shortcode);
  if (authed) return authed;

  // A signed-in user gets no anonymous fallback. Firing desktop-UA GraphQL and
  // crawler-UA embed requests from the same device seconds after an authed call is
  // the "mixed clients on one IP" pattern that reads as scraping — and it would only
  // ever fetch a post the account itself was refused.
  if (getPreferences().instagramSignedIn && getFetcher('instagram')) {
    throw new ExtractionError(
      `instagram authed fetch failed for ${shortcode}`,
      'Could not read this Instagram post. It may be private, deleted, or from an account you don’t follow.'
    );
  }

  const strategies: ReadonlyArray<(code: string) => Promise<ExtractionResult | null>> = [
    fetchViaGraphQl,
    fetchViaEmbed,
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

async function extractViaAuthenticatedFetch(shortcode: string): Promise<ExtractionResult | null> {
  const fetcher = getFetcher('instagram');
  if (!fetcher) return null;

  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId) return null;

  const result = await fetcher(mediaId);
  if (result.cancelled) {
    throw new ExtractionError(
      'instagram login cancelled',
      'Instagram requires a login to download. Sign in to save this post.'
    );
  }
  if (result.blocked) {
    throw new ExtractionError(
      `instagram blocked: ${result.blocked}`,
      describeBlock('Instagram', result.blocked, result.cooldownMs)
    );
  }
  if (!result.ok) return null;

  let json: unknown;
  try {
    json = JSON.parse(result.body);
  } catch {
    return null;
  }
  return mapMediaInfo(json, shortcode);
}

async function fetchViaGraphQl(shortcode: string): Promise<ExtractionResult | null> {
  // Instagram walls the unauthenticated /api/graphql endpoint (it serves the logged-out
  // HTML shell). The /graphql/query endpoint works for public posts when accompanied by
  // an anonymous CSRF token, sent as both the X-CSRFToken header and a csrftoken cookie.
  const token = await getInstagramCsrfToken();
  if (!token) return null;

  const variables = JSON.stringify({
    shortcode,
    fetch_tagged_user_count: null,
    hoisted_comment_id: null,
    hoisted_reply_id: null,
  });
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
  const username = asString(getIn(media, ['owner', 'username']));
  const items: MediaItem[] = [];
  const sidecarEdges = asArray(getIn(media, ['edge_sidecar_to_children', 'edges']));

  if (sidecarEdges) {
    sidecarEdges.forEach((edge, index) => {
      const node = getIn(edge, ['node']);
      if (isRecord(node)) {
        const item = graphqlNodeToItem(node, `${shortcode}-${index}`);
        if (item) items.push({ ...item, username, postCode: shortcode, position: index + 1 });
      }
    });
  } else {
    const item = graphqlNodeToItem(media, shortcode);
    if (item) items.push({ ...item, username, postCode: shortcode });
  }

  if (items.length === 0) return null;

  return {
    platform: 'instagram',
    shortcode,
    items,
    username,
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
    platform: 'instagram',
  };
}

async function fetchViaEmbed(shortcode: string): Promise<ExtractionResult | null> {
  // The embed page only server-renders media data for crawler user-agents
  // (facebookexternalhit/Googlebot). A normal desktop UA gets the empty JS app shell.
  const html = await fetchHtml(
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    CRAWLER_USER_AGENT
  );
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
          platform: 'instagram',
          username,
          postCode: shortcode,
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
        platform: 'instagram',
        username,
        postCode: shortcode,
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
