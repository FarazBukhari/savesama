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

describe('parseLink — other domains', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://example.com/p/Cabc123/',
    'https://notinstagram.com/p/Cabc123/',
    'https://www.threads.com/@someone/post/Cxyz789',
  ])('rejects %s', (url) => {
    expect(parseLink(url)).toBeNull();
  });
});
