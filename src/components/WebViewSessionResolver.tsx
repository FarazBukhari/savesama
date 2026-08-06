import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { SessionConfig, buildFetchJs, isLoginRequired } from './webViewSession';

const REQUEST_TIMEOUT_MS = 20000;

interface PendingRequest {
  mediaId: string;
  resolve: (result: SessionFetchResult) => void;
  awaitingLogin: boolean;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Holds one platform's authenticated session in an off-screen WebView and runs media-info
 * fetches inside it, revealing a login modal only when a request comes back logged-out.
 * The session then persists across launches via the WebView cookie store.
 *
 * Instagram and Threads serve the same `api/v1/media/{id}/info/` endpoint and payload, so
 * they share this component; everything that differs is in `config` (see webViewSession.ts).
 */
export function WebViewSessionResolver({ config }: { config: SessionConfig }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const webViewRef = useRef<WebView>(null);
  const pending = useRef<Map<number, PendingRequest>>(new Map());
  const counter = useRef(0);
  const ready = useRef(false);
  const queue = useRef<number[]>([]);
  // True once this login attempt has hopped to an external auth host (Threads' OAuth
  // goes through instagram.com).
  const sawAuthHop = useRef(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // Set when the hidden WebView has been sent to the logout page, so the next
  // load lands back on the home origin the injected fetch needs.
  const signingOut = useRef(false);
  // The hidden WebView's address is React state so sign-out can steer it even
  // before its first load has finished.
  const [hiddenUri, setHiddenUri] = useState(config.homeUrl);

  const runFetch = useCallback(
    (reqId: number) => {
      const req = pending.current.get(reqId);
      if (!req) return;
      if (!ready.current) {
        queue.current.push(reqId);
        return;
      }
      webViewRef.current?.injectJavaScript(buildFetchJs(config, reqId, req.mediaId));
    },
    [config]
  );

  const settle = useCallback((reqId: number, result: SessionFetchResult) => {
    const req = pending.current.get(reqId);
    if (!req) return;
    clearTimeout(req.timer);
    pending.current.delete(reqId);
    req.resolve(result);
  }, []);

  const fetcher = useCallback<MediaInfoFetcher>(
    (mediaId) =>
      new Promise<SessionFetchResult>((resolve) => {
        const reqId = ++counter.current;
        const timer = setTimeout(() => {
          settle(reqId, { ok: false, status: 0, body: 'timeout' });
        }, REQUEST_TIMEOUT_MS);
        pending.current.set(reqId, { mediaId, resolve, awaitingLogin: false, timer });
        runFetch(reqId);
      }),
    [runFetch, settle]
  );

  useEffect(() => {
    registerFetcher(config.platform, fetcher);
    return () => unregisterFetcher(config.platform, fetcher);
  }, [config.platform, fetcher]);

  /**
   * WebView exposes no cookie API, so signing out means driving the hidden
   * WebView through the site's own logout page and letting it expire the
   * cookie. The saved flag flips only once that page has loaded, and a later
   * successful authed request flips it back — the flag never claims a state we
   * haven't actually observed.
   */
  const signOut = useCallback(() => {
    ready.current = false;
    signingOut.current = true;
    // Drive the navigation through `source` rather than injecting a
    // `location.replace`: injection silently no-ops if the WebView hasn't
    // finished its first load, which would leave the flag saying signed-out
    // while the cookie is still alive.
    setHiddenUri(config.logoutUrl);
  }, [config.logoutUrl]);

  useEffect(() => {
    registerSignOut(config.platform, signOut);
    return () => unregisterSignOut(config.platform, signOut);
  }, [config.platform, signOut]);

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

      if (isLoginRequired(status, body)) {
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
        void savePreferences(
          config.platform === 'instagram' ? { instagramSignedIn: true } : { threadsSignedIn: true }
        );
      }
      settle(msg.reqId, { ok, status, body });
    },
    [config.platform, settle]
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
        void savePreferences(
          config.platform === 'instagram' ? { instagramSignedIn: true } : { threadsSignedIn: true }
        );
        setSigningIn(true);
        setLoginVisible(false);
        retryAwaiting();
      }
    },
    [config, loginVisible, retryAwaiting]
  );

  const onCancelLogin = useCallback(() => {
    setLoginVisible(false);
    setSigningIn(false);
    pending.current.forEach((req, reqId) => {
      if (req.awaitingLogin) settle(reqId, { ok: false, status: 0, body: '', cancelled: true });
    });
  }, [settle]);

  const onLoadEnd = useCallback(() => {
    // The logout page has loaded and dropped the cookie; send the WebView home
    // so the next injected fetch runs from the origin it expects.
    if (signingOut.current) {
      signingOut.current = false;
      // Only now is the cookie actually gone, so this is when the flag flips.
      void savePreferences(
        config.platform === 'instagram' ? { instagramSignedIn: false } : { threadsSignedIn: false }
      );
      setHiddenUri(config.homeUrl);
      return;
    }
    ready.current = true;
    setSigningIn(false);
    const queued = queue.current;
    queue.current = [];
    queued.forEach(runFetch);
  }, [config.homeUrl, config.platform, runFetch]);

  return (
    <>
      {/* Off-screen WebView that holds the session and runs the fetches. */}
      <View style={styles.hidden} pointerEvents="none">
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
          originWhitelist={['https://*']}
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
    width: 1,
    height: 1,
    opacity: 0,
    top: -10,
    left: -10,
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
  },
});
