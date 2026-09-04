import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import {
  MediaInfoFetcher,
  SessionFetchResult,
  registerFetcher,
  registerSignOut,
  unregisterFetcher,
  unregisterSignOut,
} from '../services/mediaSession';
import { savePreferences } from '../services/preferences';
import {
  activeCooldown,
  noteBlocked,
  noteSuccess,
  waitForSlot,
} from '../services/sessionThrottle';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { SessionConfig, buildFetchJs, classifyBlock, isLoginRequired } from './webViewSession';

const REQUEST_TIMEOUT_MS = 20000;
/**
 * How long the hidden WebView stays on the site after the last request before it is
 * parked on about:blank. While parked the site's JS isn't running: no feed polling,
 * no realtime connection, no telemetry from a page nobody is looking at.
 */
const IDLE_UNLOAD_MS = 90 * 1000;
const BLANK = 'about:blank';

interface PendingRequest {
  mediaId: string;
  resolve: (result: SessionFetchResult) => void;
  awaitingLogin: boolean;
  /** How many times this request has already been retried after a sign-in. */
  loginRetries: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Holds one platform's authenticated session in an off-screen WebView and runs media-info
 * fetches inside it, revealing a login modal only when a request comes back logged-out.
 * The session then persists across launches via the WebView cookie store.
 *
 * Instagram and Threads serve the same `api/v1/media/{id}/info/` endpoint and payload, so
 * they share this component; everything that differs is in `config` (see webViewSession.ts).
 *
 * Three things here exist to keep the account from being flagged for automation:
 *
 *  - **The site loads on demand, not at launch.** The WebView sits on about:blank until a
 *    request needs it and is parked again after {@link IDLE_UNLOAD_MS}. Two Meta sites
 *    open in the background on every app launch — each running its feed, realtime and
 *    logging JS from a 1x1 viewport — was a session that looked like nothing a person does.
 *  - **The WebView is screen-sized.** Meta's page JS reports the viewport; a 1x1 window is
 *    a headless signature. It is transparent and behind the UI, not tiny.
 *  - **Requests are paced and refusals are respected.** Fetches wait a jittered gap
 *    (`sessionThrottle`), a `checkpoint_required` / `feedback_required` / 429 answer starts a
 *    cooldown and is reported as such, and the login sheet opens at most once per request —
 *    re-authenticating an account that is already being watched is the worst possible move.
 */
export function WebViewSessionResolver({ config }: { config: SessionConfig }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width, height } = useWindowDimensions();
  const webViewRef = useRef<WebView>(null);
  const pending = useRef<Map<number, PendingRequest>>(new Map());
  const counter = useRef(0);
  /** True once the hidden WebView has finished loading a page on `config.origin`. */
  const ready = useRef(false);
  const queue = useRef<number[]>([]);
  // True once this login attempt has hopped to an external auth host (Threads' OAuth
  // goes through instagram.com).
  const sawAuthHop = useRef(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // Set when the hidden WebView has been sent to the logout page.
  const signingOut = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The hidden WebView's address is React state so it can be steered before its
  // first load has finished. Starts parked; `wake` sends it to the site.
  const [hiddenUri, setHiddenUri] = useState(BLANK);
  const hiddenUriRef = useRef(BLANK);

  const steer = useCallback((uri: string) => {
    hiddenUriRef.current = uri;
    ready.current = false;
    setHiddenUri(uri);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  /** Parks the WebView once nothing has needed it for a while. */
  const scheduleIdleUnload = useCallback(() => {
    clearIdleTimer();
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null;
      if (pending.current.size === 0 && !signingOut.current && hiddenUriRef.current !== BLANK) {
        steer(BLANK);
      }
    }, IDLE_UNLOAD_MS);
  }, [clearIdleTimer, steer]);

  /** Loads the site if the WebView is parked, so a queued fetch has an origin to run from. */
  const wake = useCallback(() => {
    clearIdleTimer();
    if (hiddenUriRef.current === BLANK) steer(config.homeUrl);
  }, [clearIdleTimer, config.homeUrl, steer]);

  const runFetch = useCallback(
    (reqId: number) => {
      const req = pending.current.get(reqId);
      if (!req) return;
      if (!ready.current) {
        queue.current.push(reqId);
        wake();
        return;
      }
      // Pace the call like a person tapping through posts, not a loop.
      void waitForSlot(config.platform).then(() => {
        if (!pending.current.has(reqId)) return;
        webViewRef.current?.injectJavaScript(buildFetchJs(config, reqId, req.mediaId));
      });
    },
    [config, wake]
  );

  const settle = useCallback(
    (reqId: number, result: SessionFetchResult) => {
      const req = pending.current.get(reqId);
      if (!req) return;
      clearTimeout(req.timer);
      pending.current.delete(reqId);
      req.resolve(result);
      if (pending.current.size === 0) scheduleIdleUnload();
    },
    [scheduleIdleUnload]
  );

  const fetcher = useCallback<MediaInfoFetcher>(
    (mediaId) =>
      new Promise<SessionFetchResult>((resolve) => {
        // During a cooldown nothing goes to the network: the answer is already known,
        // and every extra call is another data point against the account.
        const cooldown = activeCooldown(config.platform);
        if (cooldown) {
          resolve({
            ok: false,
            status: 0,
            body: '',
            blocked: cooldown.reason,
            cooldownMs: cooldown.remainingMs,
          });
          return;
        }
        const reqId = ++counter.current;
        const timer = setTimeout(() => {
          settle(reqId, { ok: false, status: 0, body: 'timeout' });
        }, REQUEST_TIMEOUT_MS);
        pending.current.set(reqId, {
          mediaId,
          resolve,
          awaitingLogin: false,
          loginRetries: 0,
          timer,
        });
        runFetch(reqId);
      }),
    [config.platform, runFetch, settle]
  );

  useEffect(() => {
    registerFetcher(config.platform, fetcher);
    return () => unregisterFetcher(config.platform, fetcher);
  }, [config.platform, fetcher]);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  /**
   * WebView exposes no cookie API, so signing out means driving the hidden
   * WebView through the site's own logout page and letting it expire the
   * cookie. The saved flag flips only once that page has loaded, and a later
   * successful authed request flips it back — the flag never claims a state we
   * haven't actually observed.
   */
  const signOut = useCallback(() => {
    clearIdleTimer();
    signingOut.current = true;
    // Drive the navigation through `source` rather than injecting a
    // `location.replace`: injection silently no-ops if the WebView hasn't
    // finished its first load, which would leave the flag saying signed-out
    // while the cookie is still alive.
    steer(config.logoutUrl);
  }, [clearIdleTimer, config.logoutUrl, steer]);

  useEffect(() => {
    registerSignOut(config.platform, signOut);
    return () => unregisterSignOut(config.platform, signOut);
  }, [config.platform, signOut]);

  const markSignedIn = useCallback(
    (value: boolean) => {
      void savePreferences(
        config.platform === 'instagram' ? { instagramSignedIn: value } : { threadsSignedIn: value }
      );
    },
    [config.platform]
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { reqId?: number; status?: number; body?: string };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (typeof msg.reqId !== 'number') return;
      const req = pending.current.get(msg.reqId);
      if (!req) return;

      const status = msg.status ?? 0;
      const body = msg.body ?? '';

      // Checked before the login test: a checkpoint often arrives as a 403 or 400,
      // which would otherwise read as "signed out" and pop the sign-in sheet — at an
      // account Instagram has just asked to verify itself.
      const blocked = classifyBlock(status, body);
      if (blocked) {
        noteBlocked(config.platform, blocked);
        const cooldown = activeCooldown(config.platform);
        settle(msg.reqId, {
          ok: false,
          status,
          body,
          blocked,
          cooldownMs: cooldown?.remainingMs,
        });
        return;
      }

      if (isLoginRequired(status, body)) {
        // One sign-in per request. If the session still reads as logged-out after the
        // user signed in, something else is wrong (a checkpoint served as HTML, an
        // origin problem) and looping the sheet would only make it worse.
        if (req.loginRetries >= 1) {
          settle(msg.reqId, { ok: false, status, body });
          return;
        }
        // Keep the request pending, reveal the login screen, and retry after login.
        req.awaitingLogin = true;
        clearTimeout(req.timer);
        sawAuthHop.current = false;
        setSigningIn(false);
        setLoginVisible(true);
        return;
      }

      const ok = status >= 200 && status < 300;
      // A successful authed request is the only real proof of a live session —
      // the saved flag is otherwise just what we last saw the user do.
      if (ok) {
        markSignedIn(true);
        noteSuccess(config.platform);
      }
      settle(msg.reqId, { ok, status, body });
    },
    [config.platform, markSignedIn, settle]
  );

  const retryAwaiting = useCallback(() => {
    // Reload first when configured: not for cookies — those are read at request time —
    // but for origin. If the hidden WebView drifted off-origin, the injected fetch would
    // be cross-origin and die on CORS.
    if (config.reloadBeforeRetry) {
      ready.current = false;
      webViewRef.current?.reload();
    }
    // Give each waiting request a fresh timeout, then re-issue the fetch now that the
    // session should be authenticated. runFetch queues it if the reload is still in
    // flight; onLoadEnd flushes the queue.
    pending.current.forEach((req, reqId) => {
      if (!req.awaitingLogin) return;
      req.awaitingLogin = false;
      req.loginRetries += 1;
      req.timer = setTimeout(() => {
        settle(reqId, { ok: false, status: 0, body: 'timeout' });
      }, REQUEST_TIMEOUT_MS);
      runFetch(reqId);
    });
  }, [config.reloadBeforeRetry, runFetch, settle]);

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (!loginVisible) return;
      if (config.isAuthHop(nav.url)) {
        sawAuthHop.current = true;
        return;
      }
      // Fire as soon as the redirect to an authenticated URL *starts* (not on load end),
      // and cover the WebView with a spinner, so the feed never flashes during the
      // modal's slide-out animation.
      if (config.isLoggedIn(nav.url, sawAuthHop.current)) {
        markSignedIn(true);
        setSigningIn(true);
        setLoginVisible(false);
        retryAwaiting();
      }
    },
    [config, loginVisible, markSignedIn, retryAwaiting]
  );

  const onCancelLogin = useCallback(() => {
    setLoginVisible(false);
    setSigningIn(false);
    pending.current.forEach((req, reqId) => {
      if (req.awaitingLogin) settle(reqId, { ok: false, status: 0, body: '', cancelled: true });
    });
  }, [settle]);

  const onLoadEnd = useCallback(() => {
    // Parked: nothing to run fetches from, nothing to flush.
    if (hiddenUriRef.current === BLANK) {
      ready.current = false;
      return;
    }
    // The logout page has loaded and dropped the cookie. Only now is the cookie
    // actually gone, so this is when the flag flips. Park afterwards — the next
    // request wakes the WebView on the home origin as usual.
    if (signingOut.current) {
      signingOut.current = false;
      markSignedIn(false);
      steer(BLANK);
      return;
    }
    ready.current = true;
    setSigningIn(false);
    const queued = queue.current;
    queue.current = [];
    queued.forEach(runFetch);
    if (pending.current.size === 0) scheduleIdleUnload();
  }, [markSignedIn, runFetch, scheduleIdleUnload, steer]);

  return (
    <>
      {/*
        Off-screen WebView that holds the session and runs the fetches. Sized to the
        real window (see the component comment) and invisible rather than tiny.
      */}
      <View style={[styles.hidden, { width, height }]} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ uri: hiddenUri }}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={config.watchHiddenNavigation ? onNavChange : undefined}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          originWhitelist={['https://*', 'about:*']}
          style={styles.hiddenWeb}
        />
      </View>

      <Modal visible={loginVisible} animationType="slide" onRequestClose={onCancelLogin}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>Sign in to {config.label}</Text>
              <Text style={styles.modalSubtitle}>Required to download · saved for next time</Text>
            </View>
            <Pressable
              onPress={onCancelLogin}
              hitSlop={12}
              style={styles.modalCancel}
              accessibilityRole="button"
              accessibilityLabel={`Cancel signing in to ${config.label}`}
            >
              <Text style={styles.modalClose}>Cancel</Text>
            </Pressable>
          </View>
          {loginVisible ? (
            <WebView
              source={{ uri: config.loginUrl }}
              onNavigationStateChange={onNavChange}
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              domStorageEnabled
              javaScriptEnabled
              originWhitelist={['https://*']}
              style={styles.loginWeb}
            />
          ) : null}
          {signingIn ? (
            <View style={styles.signingOverlay}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
              <Text style={styles.signingLabel}>Signing you in…</Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    hidden: {
      position: 'absolute',
      top: 0,
      left: 0,
      opacity: 0,
      zIndex: -1,
    },
    hiddenWeb: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    modalRoot: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    modalHeaderText: {
      flex: 1,
      paddingRight: spacing.md,
    },
    modalTitle: {
      fontSize: typography.title,
      fontWeight: '700',
      color: theme.colors.text,
    },
    modalSubtitle: {
      marginTop: 2,
      fontSize: typography.small,
      color: theme.colors.textSecondary,
    },
    modalCancel: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    modalClose: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.accent,
    },
    loginWeb: {
      flex: 1,
    },
    signingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      backgroundColor: theme.colors.background,
    },
    signingLabel: {
      fontSize: typography.body,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      fontFamily: fonts.mono,
    },
  });
