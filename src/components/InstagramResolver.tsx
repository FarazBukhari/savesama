import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import { IG_APP_ID } from '../extraction/instagramApi';
import {
  IgFetchResult,
  IgMediaInfoFetcher,
  registerIgFetcher,
  unregisterIgFetcher,
} from '../services/instagramSession';
import { colors, spacing, typography } from '../theme';

const IG_HOME = 'https://www.instagram.com/';
const IG_LOGIN = 'https://www.instagram.com/accounts/login/';
const REQUEST_TIMEOUT_MS = 20000;

interface PendingRequest {
  mediaId: string;
  resolve: (result: IgFetchResult) => void;
  awaitingLogin: boolean;
  timer: ReturnType<typeof setTimeout>;
}

// Runs a same-origin fetch inside the WebView so the authenticated session cookie
// is attached, then posts the status + body back. mediaId is digits-only and reqId
// is a number, so neither can break out of the template.
function buildFetchJs(reqId: number, mediaId: string): string {
  return `(function(){
    function send(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    try {
      fetch('https://www.instagram.com/api/v1/media/${mediaId}/info/', {
        headers: { 'X-IG-App-ID': '${IG_APP_ID}', 'X-Requested-With': 'XMLHttpRequest' },
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
  // When logged out, Instagram 302-redirects the api/v1 call to the login page and
  // fetch follows it, returning an HTML document (status 200) instead of JSON.
  const trimmed = body.trimStart();
  return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<');
}

// The session cookie is set the moment credentials are accepted, before Instagram
// lands on the feed. Treat the home feed and the "save login info" (onetap) screen
// as logged-in so we can close the modal immediately — and skip the onetap prompt.
function isLoggedIn(url: string): boolean {
  if (url.includes('/accounts/login')) return false;
  return (
    /^https:\/\/www\.instagram\.com\/(\?|#|$)/.test(url) ||
    url.includes('/accounts/onetap') ||
    url.includes('/feed')
  );
}

export function InstagramResolver() {
  const webViewRef = useRef<WebView>(null);
  const pending = useRef<Map<number, PendingRequest>>(new Map());
  const counter = useRef(0);
  const ready = useRef(false);
  const queue = useRef<number[]>([]);
  const [loginVisible, setLoginVisible] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const runFetch = useCallback((reqId: number) => {
    const req = pending.current.get(reqId);
    if (!req) return;
    if (!ready.current) {
      queue.current.push(reqId);
      return;
    }
    webViewRef.current?.injectJavaScript(buildFetchJs(reqId, req.mediaId));
  }, []);

  const settle = useCallback((reqId: number, result: IgFetchResult) => {
    const req = pending.current.get(reqId);
    if (!req) return;
    clearTimeout(req.timer);
    pending.current.delete(reqId);
    req.resolve(result);
  }, []);

  const fetcher = useCallback<IgMediaInfoFetcher>(
    (mediaId) =>
      new Promise<IgFetchResult>((resolve) => {
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
    registerIgFetcher(fetcher);
    return () => unregisterIgFetcher(fetcher);
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
        setSigningIn(false);
        setLoginVisible(true);
        return;
      }

      settle(msg.reqId, { ok: status >= 200 && status < 300, status, body });
    },
    [settle]
  );

  const retryAwaiting = useCallback(() => {
    // Give each waiting request a fresh timeout, then re-issue the fetch now that
    // the session should be authenticated.
    pending.current.forEach((req, reqId) => {
      if (!req.awaitingLogin) return;
      req.awaitingLogin = false;
      req.timer = setTimeout(() => {
        settle(reqId, { ok: false, status: 0, body: 'timeout' });
      }, REQUEST_TIMEOUT_MS);
      runFetch(reqId);
    });
  }, [runFetch, settle]);

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (!loginVisible) return;
      // Fire as soon as the redirect to an authenticated URL *starts* (not on load
      // end), and cover the WebView with a spinner, so the feed never flashes during
      // the modal's slide-out animation.
      if (isLoggedIn(nav.url)) {
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
    const queued = queue.current;
    queue.current = [];
    queued.forEach(runFetch);
  }, [runFetch]);

  return (
    <>
      {/* Off-screen WebView that holds the Instagram session and runs the fetches. */}
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ uri: IG_HOME }}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={onNavChange}
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
              <Text style={styles.modalTitle}>Sign in to Instagram</Text>
              <Text style={styles.modalSubtitle}>Required to download · saved for next time</Text>
            </View>
            <Pressable onPress={onCancelLogin} hitSlop={12} style={styles.modalCancel}>
              <Text style={styles.modalClose}>Cancel</Text>
            </Pressable>
          </View>
          {loginVisible ? (
            <WebView
              source={{ uri: IG_LOGIN }}
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
