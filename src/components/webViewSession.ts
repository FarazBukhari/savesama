// Pure logic behind <WebViewSessionResolver>: the per-platform config, the injected
// fetch script, and the two predicates that decide "is this response logged out?" and
// "is this navigation the end of sign-in?". Kept out of the component so the URL
// sequences observed on real sign-ins can be unit-tested.

import { IG_APP_ID } from '../extraction/instagramApi';
import { THREADS_APP_ID, THREADS_ORIGIN } from '../extraction/threadsApi';
import type { SessionPlatform } from '../services/mediaSession';
import type { BlockReason } from '../services/sessionThrottle';

/**
 * `X-ASBD-ID` the instagram.com / threads.com web clients send on every api call.
 * A constant baked into Meta's JS bundle (yt-dlp tracks the same value); requests
 * without it don't match what a browser session produces.
 */
export const ASBD_ID = '359341';

export interface SessionConfig {
  platform: SessionPlatform;
  /** Shown in the login modal title: "Sign in to <label>". */
  label: string;
  /** Page the hidden WebView sits on; also the origin the fetch runs from. */
  homeUrl: string;
  /** Page the login modal opens. */
  loginUrl: string;
  /**
   * Page the hidden WebView is sent to in order to drop the session. WebView has
   * no cookie-clearing API, so signing out means asking the site to expire the
   * cookie itself.
   */
  logoutUrl: string;
  origin: string;
  appId: string;
  /**
   * True when a navigation is part of an external auth hop rather than the end of
   * sign-in. Threads' OAuth runs through instagram.com, so those URLs must never be
   * mistaken for success.
   */
  isAuthHop: (url: string) => boolean;
  /**
   * Whether the navigation means the session is now authenticated. `sawAuthHop` is true
   * once isAuthHop has matched during this login attempt.
   */
  isLoggedIn: (url: string, sawAuthHop: boolean) => boolean;
  /**
   * Watch the *hidden* WebView's navigations too, not just the login modal's. Instagram
   * does (its login redirects can land there); Threads does not — its post-OAuth
   * redirect always arrives in the modal.
   */
  watchHiddenNavigation: boolean;
  /**
   * Reload the hidden WebView before retrying after login. Needed when it may have
   * drifted off-origin (the injected fetch would then be cross-origin and die on CORS).
   */
  reloadBeforeRetry: boolean;
}

/**
 * The session cookie is set the moment credentials are accepted, before Instagram lands
 * on the feed. Treat the home feed and the "save login info" (onetap) screen as
 * logged-in so the modal can close immediately — and skip the onetap prompt.
 */
function instagramIsLoggedIn(url: string): boolean {
  if (url.includes('/accounts/login')) return false;
  return (
    /^https:\/\/www\.instagram\.com\/(\?|#|$)/.test(url) ||
    url.includes('/accounts/onetap') ||
    url.includes('/feed')
  );
}

/**
 * Threads sign-in is an OAuth round trip *through instagram.com*:
 *
 *   threads.com/login
 *     -> instagram.com/accounts/login/?...&next=instagram.com/oauth/oidc/?redirect_uri=threads.com/login/oidc/
 *     -> threads.com/login/oidc/?code=...
 *     -> threads.com/
 *
 * So this must never match an instagram.com URL: closing the modal mid-OAuth would retry
 * the fetch against a still-unauthenticated threads.com origin, get the HTML shell back,
 * and re-open the modal in a loop.
 *
 * The threads.com OIDC callback always means signed in. Bare threads.com root only counts
 * *before* the OAuth hop starts — that is the "already had a session, /login bounced
 * straight to the feed" case.
 */
function threadsIsLoggedIn(url: string, sawAuthHop: boolean): boolean {
  if (!/^https:\/\/(www\.)?threads\.(com|net)\//.test(url)) return false;
  if (url.includes('/login/oidc')) return true;
  if (url.includes('/login')) return false;
  if (sawAuthHop) return false;
  return /^https:\/\/(www\.)?threads\.(com|net)\/(\?|#|$)/.test(url);
}

export const INSTAGRAM_SESSION: SessionConfig = {
  platform: 'instagram',
  label: 'Instagram',
  homeUrl: 'https://www.instagram.com/',
  loginUrl: 'https://www.instagram.com/accounts/login/',
  logoutUrl: 'https://www.instagram.com/accounts/logout/',
  origin: 'https://www.instagram.com',
  appId: IG_APP_ID,
  isAuthHop: () => false,
  isLoggedIn: instagramIsLoggedIn,
  watchHiddenNavigation: true,
  reloadBeforeRetry: false,
};

export const THREADS_SESSION: SessionConfig = {
  platform: 'threads',
  label: 'Threads',
  homeUrl: `${THREADS_ORIGIN}/`,
  loginUrl: `${THREADS_ORIGIN}/login`,
  logoutUrl: `${THREADS_ORIGIN}/logout`,
  origin: THREADS_ORIGIN,
  appId: THREADS_APP_ID,
  isAuthHop: (url) => url.includes('instagram.com'),
  isLoggedIn: threadsIsLoggedIn,
  watchHiddenNavigation: false,
  reloadBeforeRetry: true,
};

/**
 * Builds the script that runs the media-info fetch inside the WebView so the httpOnly
 * session cookie is attached, then posts the status + body back. mediaId is digits-only
 * and reqId is a number, so neither can break out of the template.
 *
 * The request is shaped like the one the site's own JS makes, because a session whose
 * API calls don't look like the web client's is what earns an "automated behavior"
 * flag: `X-CSRFToken` (the readable `csrftoken` cookie), `X-IG-WWW-Claim` (the value
 * the site stores in sessionStorage and rotates via `x-ig-set-www-claim`), the app id,
 * `X-ASBD-ID`, and `X-Requested-With`. The browser adds Referer, User-Agent and the
 * Sec-Fetch-* set itself, which is the point of fetching from inside the page.
 */
export function buildFetchJs(config: SessionConfig, reqId: number, mediaId: string): string {
  return `(function(){
    function send(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    function cookie(n){
      var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    }
    try {
      var claim = '0';
      try { claim = window.sessionStorage.getItem('www-claim-v2') || '0'; } catch (e) {}
      var headers = {
        'X-IG-App-ID': '${config.appId}',
        'X-ASBD-ID': '${ASBD_ID}',
        'X-IG-WWW-Claim': claim,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*'
      };
      var csrf = cookie('csrftoken');
      if (csrf) headers['X-CSRFToken'] = csrf;
      fetch('${config.origin}/api/v1/media/${mediaId}/info/', {
        headers: headers,
        credentials: 'include'
      })
      .then(function(r){
        var next = r.headers.get('x-ig-set-www-claim');
        if (next) { try { window.sessionStorage.setItem('www-claim-v2', next); } catch (e) {} }
        return r.text().then(function(t){ return { s: r.status, t: t }; });
      })
      .then(function(o){ send({ reqId: ${reqId}, status: o.s, body: o.t }); })
      .catch(function(e){ send({ reqId: ${reqId}, status: 0, body: String(e) }); });
    } catch (e) { send({ reqId: ${reqId}, status: 0, body: String(e) }); }
  })(); true;`;
}

/**
 * Both platforms answer a logged-out media-info request the same way: they 302 the call
 * to a login page and fetch follows it, so the body is an HTML document at status 200.
 */
export function isLoginRequired(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  const head = body.slice(0, 500);
  if (head.includes('login_required') || head.includes('"require_login"')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<');
}

/**
 * Refusals that are *not* a login wall. Showing the sign-in sheet for these would be
 * wrong twice over: the session is valid, and re-authenticating an account Instagram
 * is already watching is exactly the pattern that gets it suspended.
 *
 *   - `checkpoint_required` / `challenge_required`: the account must verify itself in
 *     the real app.
 *   - `feedback_required`: the automation flag ("we suspect automated behavior").
 *   - 429, or the "Please wait a few minutes" body: plain rate limiting.
 */
export function classifyBlock(status: number, body: string): BlockReason | null {
  if (status === 429) return 'rate_limited';
  const head = body.slice(0, 2000);
  if (head.includes('checkpoint_required') || head.includes('challenge_required')) {
    return 'checkpoint';
  }
  if (head.includes('feedback_required')) return 'feedback';
  if (/please wait a few minutes/i.test(head)) return 'rate_limited';
  return null;
}
