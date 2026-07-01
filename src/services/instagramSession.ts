// Bridge between the pure extraction code and the mounted <InstagramResolver>
// WebView. Instagram login-walled every anonymous endpoint, so media info must be
// fetched from within a WebView that holds the user's authenticated session cookie
// (the httpOnly `sessionid` is attached by the browser on same-origin requests).
//
// The resolver registers a fetcher here on mount; extractInstagram looks it up.
// The fetcher handles the full login dance internally: if a request comes back
// login_required, the resolver reveals itself for the user to log in, then retries,
// so the returned promise settles only with a final answer.

export interface IgFetchResult {
  /** True when the request returned a usable 2xx media-info payload. */
  ok: boolean;
  status: number;
  body: string;
  /** True when the user dismissed the login screen without authenticating. */
  cancelled?: boolean;
}

export type IgMediaInfoFetcher = (mediaId: string) => Promise<IgFetchResult>;

let fetcher: IgMediaInfoFetcher | null = null;

export function registerIgFetcher(next: IgMediaInfoFetcher): void {
  fetcher = next;
}

export function unregisterIgFetcher(current: IgMediaInfoFetcher): void {
  if (fetcher === current) fetcher = null;
}

export function getIgFetcher(): IgMediaInfoFetcher | null {
  return fetcher;
}
