// Bridge between the pure extraction code and the mounted <ThreadsResolver>
// WebView — the Threads counterpart of instagramSession.ts.
//
// Threads login-walls post pages and its api/v1 media-info endpoint for anonymous
// clients (a logged-out request answers with the HTML app shell at status 200), so
// media info must be fetched from inside a WebView holding the user's threads.com
// session cookie. There is no anonymous fallback.
//
// The resolver registers a fetcher here on mount; extractThreads looks it up. The
// fetcher handles the login dance internally: a logged-out response reveals the
// login modal, then the request is retried, so the promise settles only with a
// final answer.

export interface ThreadsFetchResult {
  /** True when the request returned a usable 2xx media-info payload. */
  ok: boolean;
  status: number;
  body: string;
  /** True when the user dismissed the login screen without authenticating. */
  cancelled?: boolean;
}

export type ThreadsMediaInfoFetcher = (mediaId: string) => Promise<ThreadsFetchResult>;

let fetcher: ThreadsMediaInfoFetcher | null = null;

export function registerThreadsFetcher(next: ThreadsMediaInfoFetcher): void {
  fetcher = next;
}

export function unregisterThreadsFetcher(current: ThreadsMediaInfoFetcher): void {
  if (fetcher === current) fetcher = null;
}

export function getThreadsFetcher(): ThreadsMediaInfoFetcher | null {
  return fetcher;
}
