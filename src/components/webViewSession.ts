// Pure logic behind <WebViewSessionResolver>: the per-platform config, the injected
// fetch script, and the two predicates that decide "is this response logged out?" and
// "is this navigation the end of sign-in?". Kept out of the component so the URL
// sequences observed on real sign-ins can be unit-tested.

import { IG_APP_ID } from '../extraction/instagramApi';
import { THREADS_APP_ID, THREADS_ORIGIN } from '../extraction/threadsApi';
import type { SessionPlatform } from '../services/mediaSession';

export interface SessionConfig {
  platform: SessionPlatform;
  /** Shown in the login modal title: "Sign in to <label>". */
  label: string;
  /** Page the hidden WebView sits on; also the origin the fetch runs from. */
  homeUrl: string;
  /** Page the login modal opens. */
  loginUrl: string;
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
 */
export function buildFetchJs(config: SessionConfig, reqId: number, mediaId: string): string {
  return `(function(){
    function send(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    try {
      fetch('${config.origin}/api/v1/media/${mediaId}/info/', {
        headers: { 'X-IG-App-ID': '${config.appId}', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include'
      })
      .then(function(r){ return r.text().then(function(t){ return { s: r.status, t: t }; }); })
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
