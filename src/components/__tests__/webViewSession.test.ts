import {
  ASBD_ID,
  INSTAGRAM_SESSION,
  THREADS_SESSION,
  buildFetchJs,
  classifyBlock,
  isLoginRequired,
} from '../webViewSession';

// The real URL Instagram's OAuth login lands on when Threads sign-in starts, captured
// from a live sign-in attempt (truncated state token).
const IG_OAUTH_URL =
  'https://www.instagram.com/accounts/login/?force_authentication&platform_app_id=1289884158313322&enable_fb_login&next=https%3A%2F%2Fwww.instagram.com%2Foauth%2Foidc%2F%3Fapp_id%3D1289884158313322%26redirect_uri%3Dhttps%253A%252F%252Fwww.threads.com%252Flogin%252Foidc%252F%26response_type%3Dcode';

describe('isLoginRequired', () => {
  it('treats the HTML app shell served to logged-out clients as a login wall', () => {
    // Both platforms 302 a logged-out media-info call to a login page; fetch follows it,
    // so the body is a document at status 200.
    expect(isLoginRequired(200, '<!DOCTYPE html><html>…')).toBe(true);
    expect(isLoginRequired(200, '  <html lang="en">')).toBe(true);
  });

  it('treats explicit auth failures as a login wall', () => {
    expect(isLoginRequired(401, '')).toBe(true);
    expect(isLoginRequired(403, '')).toBe(true);
    expect(isLoginRequired(200, '{"message":"login_required","status":"fail"}')).toBe(true);
  });

  it('passes a real media-info payload through', () => {
    expect(isLoginRequired(200, '{"num_results":1,"items":[{"media_type":2}]}')).toBe(false);
  });
});

describe('INSTAGRAM_SESSION.isLoggedIn', () => {
  const loggedIn = (url: string) => INSTAGRAM_SESSION.isLoggedIn(url, false);

  it.each([
    'https://www.instagram.com/',
    'https://www.instagram.com/?variant=x',
    // The session cookie exists by the time onetap is shown, so don't wait for the feed.
    'https://www.instagram.com/accounts/onetap/?next=%2F',
    'https://www.instagram.com/feed/',
  ])('accepts %s', (url) => {
    expect(loggedIn(url)).toBe(true);
  });

  it.each([
    'https://www.instagram.com/accounts/login/',
    'https://www.instagram.com/accounts/login/?next=%2F',
    'https://www.instagram.com/p/DaNl103P4Zz/',
  ])('rejects %s', (url) => {
    expect(loggedIn(url)).toBe(false);
  });
});

describe('THREADS_SESSION.isLoggedIn', () => {
  it('accepts the threads.com OIDC callback that ends the OAuth round trip', () => {
    const url = 'https://www.threads.com/login/oidc/?code=AQD123&state=xyz';
    expect(THREADS_SESSION.isLoggedIn(url, true)).toBe(true);
    expect(THREADS_SESSION.isLoggedIn(url, false)).toBe(true);
  });

  it('never accepts an instagram.com URL, so the modal cannot close mid-OAuth', () => {
    // Firing here would retry against an unauthenticated threads.com origin, get the
    // HTML shell, and re-open the login modal in a loop.
    expect(THREADS_SESSION.isAuthHop(IG_OAUTH_URL)).toBe(true);
    expect(THREADS_SESSION.isLoggedIn(IG_OAUTH_URL, true)).toBe(false);
    expect(THREADS_SESSION.isLoggedIn('https://www.instagram.com/', true)).toBe(false);
    expect(THREADS_SESSION.isLoggedIn('https://www.instagram.com/', false)).toBe(false);
    expect(
      THREADS_SESSION.isLoggedIn('https://www.instagram.com/oauth/oidc/?app_id=1', false)
    ).toBe(false);
  });

  it('rejects the login page itself', () => {
    expect(THREADS_SESSION.isLoggedIn('https://www.threads.com/login', false)).toBe(false);
  });

  it('accepts bare threads.com only before the OAuth hop (the already-signed-in bounce)', () => {
    expect(THREADS_SESSION.isLoggedIn('https://www.threads.com/', false)).toBe(true);
    expect(THREADS_SESSION.isLoggedIn('https://www.threads.com/', true)).toBe(false);
  });

  it('rejects an ordinary threads.com post page', () => {
    expect(
      THREADS_SESSION.isLoggedIn('https://www.threads.com/@someone/post/DbnQECjGl4X', false)
    ).toBe(false);
  });

  it('does not treat threads.com navigations as an auth hop', () => {
    expect(THREADS_SESSION.isAuthHop('https://www.threads.com/login/oidc/?code=A')).toBe(false);
  });
});

describe('buildFetchJs', () => {
  it('targets each platform’s own origin and app id', () => {
    const ig = buildFetchJs(INSTAGRAM_SESSION, 1, '3930964476378973811');
    expect(ig).toContain(
      "fetch('https://www.instagram.com/api/v1/media/3930964476378973811/info/'"
    );
    expect(ig).toContain("'X-IG-App-ID': '936619743392459'");

    const threads = buildFetchJs(THREADS_SESSION, 2, '3956341135589369127');
    expect(threads).toContain(
      "fetch('https://www.threads.com/api/v1/media/3956341135589369127/info/'"
    );
    // Instagram's app id here would 400 with "Media not found or unavailable".
    expect(threads).toContain("'X-IG-App-ID': '238260118697367'");
  });

  it('sends the session cookie and reports the request id back', () => {
    const js = buildFetchJs(THREADS_SESSION, 7, '123');
    expect(js).toContain("credentials: 'include'");
    expect(js).toContain('reqId: 7');
  });
});

describe('classifyBlock', () => {
  it('recognises the refusals that must not open the login sheet', () => {
    expect(classifyBlock(400, '{"message":"checkpoint_required","checkpoint_url":"/challenge/"}')).toBe(
      'checkpoint'
    );
    expect(classifyBlock(403, '{"message":"challenge_required","status":"fail"}')).toBe('checkpoint');
    expect(classifyBlock(400, '{"message":"feedback_required","feedback_title":"Try Again Later"}')).toBe(
      'feedback'
    );
    expect(classifyBlock(429, '')).toBe('rate_limited');
    expect(classifyBlock(400, '{"message":"Please wait a few minutes before you try again."}')).toBe(
      'rate_limited'
    );
  });

  it('leaves login walls and real payloads alone', () => {
    expect(classifyBlock(200, '<!DOCTYPE html>')).toBeNull();
    expect(classifyBlock(403, '')).toBeNull();
    expect(classifyBlock(200, '{"items":[{"media_type":2}]}')).toBeNull();
  });
});

describe('buildFetchJs', () => {
  it('sends the web client header set from inside the page', () => {
    const js = buildFetchJs(INSTAGRAM_SESSION, 7, '123');
    expect(js).toContain("'X-IG-App-ID': '" + INSTAGRAM_SESSION.appId + "'");
    expect(js).toContain("'X-ASBD-ID': '" + ASBD_ID + "'");
    expect(js).toContain("'X-IG-WWW-Claim': claim");
    expect(js).toContain("headers['X-CSRFToken'] = csrf");
    expect(js).toContain('x-ig-set-www-claim');
    expect(js).toContain('https://www.instagram.com/api/v1/media/123/info/');
    expect(js).toContain('reqId: 7');
  });
});
