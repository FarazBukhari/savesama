// Bridge between the pure extraction code and the mounted <WebViewSessionResolver>
// WebViews. Meta login-walls its media endpoints, so media info must be fetched from
// inside a WebView holding the user's session cookie (the httpOnly `sessionid` is
// attached by the browser on same-origin requests).
//
// One resolver is mounted per platform and registers its fetcher here; the matching
// extractor looks it up. A fetcher handles the full login dance internally: if a
// request comes back logged-out, the resolver reveals itself for the user to sign in,
// then retries, so the returned promise settles only with a final answer.

/** Platforms whose extraction runs through an authenticated WebView. */
export type SessionPlatform = 'instagram' | 'threads';

export interface SessionFetchResult {
  /** True when the request returned a usable 2xx media-info payload. */
  ok: boolean;
  status: number;
  body: string;
  /** True when the user dismissed the login screen without authenticating. */
  cancelled?: boolean;
}

export type MediaInfoFetcher = (mediaId: string) => Promise<SessionFetchResult>;

const fetchers = new Map<SessionPlatform, MediaInfoFetcher>();

export function registerFetcher(platform: SessionPlatform, next: MediaInfoFetcher): void {
  fetchers.set(platform, next);
}

export function unregisterFetcher(platform: SessionPlatform, current: MediaInfoFetcher): void {
  if (fetchers.get(platform) === current) fetchers.delete(platform);
}

export function getFetcher(platform: SessionPlatform): MediaInfoFetcher | null {
  return fetchers.get(platform) ?? null;
}
