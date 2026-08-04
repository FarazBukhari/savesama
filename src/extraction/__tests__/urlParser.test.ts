import { extractUrl, parseLink } from '../urlParser';

describe('extractUrl', () => {
  it('returns the URL from plain link text', () => {
    expect(extractUrl('https://www.instagram.com/p/DA1b2C3dEfG/')).toBe(
      'https://www.instagram.com/p/DA1b2C3dEfG/'
    );
  });

  it('pulls the URL out of surrounding share text', () => {
    expect(extractUrl('Check this out! https://www.instagram.com/reel/Cabc123/ so good')).toBe(
      'https://www.instagram.com/reel/Cabc123/'
    );
  });

  it('strips trailing punctuation', () => {
    expect(extractUrl('look (https://www.instagram.com/p/Cxyz789/).')).toBe(
      'https://www.instagram.com/p/Cxyz789/'
    );
  });

  it('returns null when there is no URL', () => {
    expect(extractUrl('no link here')).toBeNull();
  });
});

describe('parseLink — Instagram', () => {
  it.each([
    ['https://www.instagram.com/p/DA1b2C3dEfG/', 'DA1b2C3dEfG'],
    ['https://instagram.com/reel/Cabc-_123/', 'Cabc-_123'],
    ['https://www.instagram.com/reels/Cabc123/', 'Cabc123'],
    ['https://www.instagram.com/tv/Cdef456/', 'Cdef456'],
    ['https://www.instagram.com/p/DA1b2C3dEfG/?igsh=abc&utm_source=x', 'DA1b2C3dEfG'],
    ['https://www.instagram.com/someuser/p/DA1b2C3dEfG/', 'DA1b2C3dEfG'],
    ['https://www.instagram.com/someuser/reel/DA1b2C3dEfG/', 'DA1b2C3dEfG'],
    ['https://instagr.am/p/Cshort1/', 'Cshort1'],
  ])('parses %s', (url, shortcode) => {
    const link = parseLink(url);
    expect(link).toEqual({
      platform: 'instagram',
      shortcode,
      canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
      needsResolution: false,
    });
  });

  it('flags /share/ links for redirect resolution', () => {
    const link = parseLink('https://www.instagram.com/share/p/AbCdEf123/');
    expect(link).toMatchObject({
      platform: 'instagram',
      shortcode: null,
      needsResolution: true,
    });
  });

  it('rejects profile pages', () => {
    expect(parseLink('https://www.instagram.com/someuser/')).toBeNull();
  });

  it.each([
    'https://www.instagram.com/reels/audio/1273422726399305?igsh=MW80OTVwZWhwbDUzdw==',
    'https://www.instagram.com/reels/audio/1273422726399305/',
    'https://instagram.com/reel/audio/987654321/',
  ])('flags song/audio page %s as unsupported', (url) => {
    expect(parseLink(url)).toMatchObject({
      platform: 'instagram',
      shortcode: null,
      needsResolution: false,
      unsupported: 'audio',
    });
  });
});

describe('parseLink — YouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=AbCd1234', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=10s', 'dQw4w9WgXcQ'],
  ])('parses %s', (url, videoId) => {
    expect(parseLink(url)).toEqual({
      platform: 'youtube',
      shortcode: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      needsResolution: false,
    });
  });

  it.each([
    'https://www.youtube.com/watch?v=abc', // id too short
    'https://www.youtube.com/', // no video
    'https://www.youtube.com/@somechannel', // channel page
  ])('rejects %s', (url) => {
    expect(parseLink(url)).toBeNull();
  });
});

describe('parseLink — other domains', () => {
  it.each([
    'https://example.com/p/Cabc123/',
    'https://notinstagram.com/p/Cabc123/',
    'https://notthreads.com/@someone/post/Cxyz789',
  ])('rejects %s', (url) => {
    expect(parseLink(url)).toBeNull();
  });
});

describe('parseLink — threads', () => {
  // All three link forms carry the post code; Threads redirects /post/ and /t/ to
  // the canonical /@user/post/ URL, so none of them needs share resolution.
  it.each([
    ['https://www.threads.com/@someone/post/DbnQECjGl4X', 'DbnQECjGl4X'],
    ['https://www.threads.com/@someone/post/DbnQECjGl4X/media', 'DbnQECjGl4X'],
    ['https://threads.com/post/DbnQECjGl4X', 'DbnQECjGl4X'],
    ['https://www.threads.net/@someone/post/DbnQECjGl4X', 'DbnQECjGl4X'],
    ['https://www.threads.net/t/DbnQECjGl4X', 'DbnQECjGl4X'],
  ])('parses %s', (url, shortcode) => {
    expect(parseLink(url)).toEqual({
      platform: 'threads',
      shortcode,
      canonicalUrl: `https://www.threads.com/post/${shortcode}`,
      needsResolution: false,
    });
  });

  it.each([
    'https://www.threads.com/',
    'https://www.threads.com/@someone',
    'https://www.threads.com/search?q=hi',
  ])('rejects non-post %s', (url) => {
    expect(parseLink(url)).toBeNull();
  });
});
