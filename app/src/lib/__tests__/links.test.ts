import { displayLink, linkKey, parseLink, parseLinks, platformOfHost } from '../links';

describe('platformOfHost', () => {
  it.each([
    ['youtube.com', 'youtube'],
    ['www.youtube.com', 'youtube'],
    ['m.youtube.com', 'youtube'],
    ['music.youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
    ['instagram.com', 'instagram'],
    ['www.instagram.com', 'instagram'],
    ['vm.tiktok.com', 'tiktok'],
    ['www.tiktok.com', 'tiktok'],
    ['facebook.com', 'facebook'],
    ['m.facebook.com', 'facebook'],
    ['fb.watch', 'facebook'],
    ['threads.net', 'threads'],
    ['www.threads.com', 'threads'],
  ])('%s → %s', (host, platform) => expect(platformOfHost(host)).toBe(platform));

  it.each(['notyoutube.com', 'youtube.com.evil.io', 'l.facebook.com', 'l.instagram.com', 'example.com', ''])(
    'rejects %s',
    (host) => expect(platformOfHost(host)).toBeNull(),
  );
});

describe('parseLink', () => {
  it('normalises scheme, case and fragment', () => {
    expect(parseLink('HTTP://WWW.Instagram.com/reel/C9xT2abc/#x')).toEqual({
      url: 'https://www.instagram.com/reel/C9xT2abc/',
      platform: 'instagram',
    });
  });
  it('adds https to bare links', () => {
    expect(parseLink('youtu.be/dQw4w9WgXcQ')?.url).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(parseLink('tiktok.com/@a/video/123')?.platform).toBe('tiktok');
  });
  it('strips trailing punctuation from shared text', () => {
    expect(parseLink('https://www.threads.com/@zuck/post/C8abc).')?.url).toBe('https://www.threads.com/@zuck/post/C8abc');
  });
  it('keeps query strings the server needs', () => {
    expect(parseLink('https://www.youtube.com/watch?v=abc123&t=4')?.url).toBe('https://www.youtube.com/watch?v=abc123&t=4');
    expect(parseLink('https://www.facebook.com/watch/?v=987')?.platform).toBe('facebook');
  });
  it('rejects other hosts, credentials, odd ports and schemes', () => {
    expect(parseLink('https://example.com/p/abc')).toBeNull();
    expect(parseLink('https://user:pw@instagram.com/p/abc')).toBeNull();
    expect(parseLink('https://instagram.com:8443/p/abc')).toBeNull();
    expect(parseLink('ftp://instagram.com/p/abc')).toBeNull();
    expect(parseLink('hello')).toBeNull();
  });
});

describe('parseLinks', () => {
  it('splits lines, dedupes and counts skipped lines', () => {
    const r = parseLinks(
      'https://www.instagram.com/p/AAA/\n\nnot a link\nhttps://youtu.be/xyz\nhttps://www.instagram.com/p/AAA/\nhttps://example.com/x',
    );
    expect(r.links.map((l) => l.platform)).toEqual(['instagram', 'youtube']);
    expect(r.skipped).toBe(2);
  });
  it('finds a link inside share-sheet text', () => {
    const r = parseLinks('Check out this video! https://vm.tiktok.com/ZMabc/ via TikTok');
    expect(r.links).toEqual([{ url: 'https://vm.tiktok.com/ZMabc/', platform: 'tiktok' }]);
    expect(r.skipped).toBe(0);
  });
  it('returns nothing for empty text', () => {
    expect(parseLinks('  \n ')).toEqual({ links: [], skipped: 0 });
  });
});

describe('linkKey', () => {
  it('treats youtube variants of one video as the same link', () => {
    const a = linkKey('https://www.youtube.com/watch?v=abc123&si=x');
    expect(linkKey('https://youtu.be/abc123')).toBe(a);
    expect(linkKey('https://m.youtube.com/watch?v=abc123')).toBe(a);
    expect(linkKey('https://www.youtube.com/shorts/abc123')).toBe(a);
  });
  it('ignores www, trailing slash and tracking on instagram/threads', () => {
    expect(linkKey('https://www.instagram.com/reel/C9x/?igsh=123')).toBe(linkKey('https://instagram.com/reel/C9x'));
    expect(linkKey('https://www.threads.com/@a/post/X?xmt=1')).toBe(linkKey('https://threads.com/@a/post/X/'));
  });
  it('keeps facebook ids from the query', () => {
    expect(linkKey('https://www.facebook.com/watch/?v=1')).not.toBe(linkKey('https://www.facebook.com/watch/?v=2'));
  });
});

it('displayLink drops scheme and www', () => {
  expect(displayLink('https://www.instagram.com/reel/C9xT2/')).toBe('instagram.com/reel/C9xT2');
});
