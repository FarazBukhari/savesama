export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Instagram's /embed/ page only server-renders media data for link-preview crawlers;
// a browser UA gets the empty JS app shell instead.
export const CRAWLER_USER_AGENT =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtml(
  url: string,
  userAgent: string = DESKTOP_USER_AGENT
): Promise<string | null> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) return null;
  return response.text();
}

// Matches the anonymous CSRF token Instagram embeds in its page body, whether the
// surrounding quotes are escaped (inside data-sjs JSON) or not: csrf_token":"VALUE.
const CSRF_TOKEN_PATTERN = /csrf_token\\?"\s*:\s*\\?"([^"\\]+)/;

let cachedCsrfToken: string | null = null;

/**
 * Obtains an anonymous Instagram CSRF token by reading it from the homepage body.
 *
 * We deliberately parse the token out of the HTML rather than the `Set-Cookie`
 * header: React Native's networking layer (especially on iOS) consumes Set-Cookie
 * into the native cookie store and does not expose it reliably to `fetch`. The
 * token is the same value Instagram also sets as the `csrftoken` cookie, so callers
 * send it back as both the `X-CSRFToken` header and a manual `Cookie` header.
 */
export async function getInstagramCsrfToken(forceRefresh = false): Promise<string | null> {
  if (cachedCsrfToken && !forceRefresh) return cachedCsrfToken;
  const response = await fetchWithTimeout('https://www.instagram.com/', {
    headers: {
      'User-Agent': DESKTOP_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) return null;
  const body = await response.text();
  const match = body.match(CSRF_TOKEN_PATTERN);
  cachedCsrfToken = match ? match[1] : null;
  return cachedCsrfToken;
}

/** Test-only: clears the cached CSRF token between cases. */
export function resetCsrfTokenCache(): void {
  cachedCsrfToken = null;
}

/**
 * Follows redirects and returns the final URL (used for /share/ and /t/ short links).
 *
 * The user agent matters: Threads answers a share link with the login shell at status
 * 200 (no redirect) for a browser UA, but 302s to the canonical post URL for a
 * link-preview crawler UA, so Threads callers pass CRAWLER_USER_AGENT.
 */
export async function resolveFinalUrl(
  url: string,
  userAgent: string = DESKTOP_USER_AGENT
): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return response.url.length > 0 ? response.url : url;
}
