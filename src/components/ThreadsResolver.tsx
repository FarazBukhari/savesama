import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import { THREADS_APP_ID, THREADS_ORIGIN } from '../extraction/threadsApi';
import {
  ThreadsFetchResult,
  ThreadsMediaInfoFetcher,
  registerThreadsFetcher,
  unregisterThreadsFetcher,
} from '../services/threadsSession';
import { colors, spacing, typography } from '../theme';

const THREADS_HOME = `${THREADS_ORIGIN}/`;
const THREADS_LOGIN = `${THREADS_ORIGIN}/login`;
const REQUEST_TIMEOUT_MS = 20000;

interface PendingRequest {
  mediaId: string;
  resolve: (result: ThreadsFetchResult) => void;
  awaitingLogin: boolean;
  timer: ReturnType<typeof setTimeout>;
}

// Runs the media-info fetch inside the WebView so the httpOnly threads.com session
// cookie is attached, then posts the status + body back. mediaId is digits-only and
// reqId is a number, so neither can break out of the template.
function buildFetchJs(reqId: number, mediaId: string): string {
  return `(function(){
    function send(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    try {
      fetch('${THREADS_ORIGIN}/api/v1/media/${mediaId}/info/', {
        headers: { 'X-IG-App-ID': '${THREADS_APP_ID}', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include'
      })
      .then(function(r){ return r.text().then(function(t){ return { s: r.status, t: t }; }); })
      .then(function(o){ send({ reqId: ${reqId}, status: o.s, body: o.t }); })
      .catch(function(e){ send({ reqId: ${reqId}, status: 0, body: String(e) }); });
    } catch (e) { send({ reqId: ${reqId}, status: 0, body: String(e) }); }
  })(); true;`;
}

function isLoginRequired(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  const head = body.slice(0, 500);
  if (head.includes('login_required') || head.includes('"require_login"')) return true;
  // Logged out, Threads serves its HTML app shell (status 200) instead of JSON.
  const trimmed = body.trimStart();
  return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<');
}

/**
 * Threads sign-in is an OAuth round trip *through instagram.com*:
 *
 *   threads.com/login
 *     -> instagram.com/accounts/login/?...&next=instagram.com/oauth/oidc/?redirect_uri=threads.com/login/oidc/
 *     -> threads.com/login/oidc/?code=...
 *     -> threads.com/
 *
 * So this must never match an instagram.com URL: closing the modal mid-OAuth would
 * retry the fetch against a still-unauthenticated threads.com origin, get the HTML
 * shell back, and re-open the modal in a loop.
 *
 * The threads.com OIDC callback always means signed in. Bare threads.com root only
 * counts *before* the OAuth hop starts — that is the "already had a session, /login
 * bounced straight to the feed" case. Once instagram.com has been visited the sign-in
 * is in flight, and only the callback ends it.
 */
function isLoggedIn(url: string, sawInstagram: boolean): boolean {
  if (!/^https:\/\/(www\.)?threads\.(com|net)\//.test(url)) return false;
  if (url.includes('/login/oidc')) return true;
  if (url.includes('/login')) return false;
  if (sawInstagram) return false;
  return /^https:\/\/(www\.)?threads\.(com|net)\/(\?|#|$)/.test(url);
}

export function ThreadsResolver() {
  const webViewRef = useRef<WebView>(null);
  const pending = useRef<Map<number, PendingRequest>>(new Map());
  const counter = useRef(0);
  const ready = useRef(false);
  const queue = useRef<number[]>([]);
  const [loginVisible, setLoginVisible] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // True once the current login attempt has hopped to instagram.com for OAuth.
  const sawInstagram = useRef(false);

  const runFetch = useCallback((reqId: number) => {
    const req = pending.current.get(reqId);
    if (!req) return;
    if (!ready.current) {
      queue.current.push(reqId);
      return;
    }
    webViewRef.current?.injectJavaScript(buildFetchJs(reqId, req.mediaId));
  }, []);

  const settle = useCallback((reqId: number, result: ThreadsFetchResult) => {
    const req = pending.current.get(reqId);
    if (!req) return;
    clearTimeout(req.timer);
    pending.current.delete(reqId);
    req.resolve(result);
  }, []);

  const fetcher = useCallback<ThreadsMediaInfoFetcher>(
    (mediaId) =>
      new Promise<ThreadsFetchResult>((resolve) => {
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
    registerThreadsFetcher(fetcher);
    return () => unregisterThreadsFetcher(fetcher);
  }, [fetcher]);

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
        sawInstagram.current = false;
        setSigningIn(false);
        setLoginVisible(true);
        return;
      }

      settle(msg.reqId, { ok: status >= 200 && status < 300, status, body });
    },
    [settle]
  );

  const retryAwaiting = useCallback(() => {
    // Reload the hidden WebView first. Not for cookies — those are read at request
    // time — but for origin: if it drifted off threads.com (or is showing the
    // logged-out shell), the injected fetch would be cross-origin and die on CORS.
    webViewRef.current?.reload();
    pending.current.forEach((req, reqId) => {
      if (!req.awaitingLogin) return;
      req.awaitingLogin = false;
      req.timer = setTimeout(() => {
        settle(reqId, { ok: false, status: 0, body: 'timeout' });
      }, REQUEST_TIMEOUT_MS);
      // ready is cleared by the reload; onLoadEnd flushes the queue.
      ready.current = false;
      queue.current.push(reqId);
    });
  }, [settle]);

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (!loginVisible) return;
      if (nav.url.includes('instagram.com')) {
        sawInstagram.current = true;
        return;
      }
      // Fire as soon as the redirect to an authenticated threads.com URL *starts*
      // (not on load end), and cover the WebView with a spinner, so the feed never
      // flashes during the modal's slide-out animation.
      if (isLoggedIn(nav.url, sawInstagram.current)) {
        setSigningIn(true);
        setLoginVisible(false);
        retryAwaiting();
      }
    },
    [loginVisible, retryAwaiting]
  );

  const onCancelLogin = useCallback(() => {
    setLoginVisible(false);
    setSigningIn(false);
    pending.current.forEach((req, reqId) => {
      if (req.awaitingLogin) settle(reqId, { ok: false, status: 0, body: '', cancelled: true });
    });
  }, [settle]);

  const onLoadEnd = useCallback(() => {
    ready.current = true;
    setSigningIn(false);
    const queued = queue.current;
    queue.current = [];
    queued.forEach(runFetch);
  }, [runFetch]);

  return (
    <>
      {/* Off-screen WebView that holds the Threads session and runs the fetches. */}
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ uri: THREADS_HOME }}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
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
              <Text style={styles.modalTitle}>Sign in to Threads</Text>
              <Text style={styles.modalSubtitle}>Required to download · saved for next time</Text>
            </View>
            <Pressable onPress={onCancelLogin} hitSlop={12} style={styles.modalCancel}>
              <Text style={styles.modalClose}>Cancel</Text>
            </Pressable>
          </View>
          {loginVisible ? (
            <WebView
              source={{ uri: THREADS_LOGIN }}
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
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.signingLabel}>Signing you in…</Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  modalHeaderText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  modalTitle: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.text,
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  modalCancel: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
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
    backgroundColor: colors.background,
  },
  signingLabel: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
