import { mapMediaInfo } from '../instagramApi';
import { shortcodeToMediaId } from '../shortcode';

describe('shortcodeToMediaId', () => {
  it('decodes a shortcode to its numeric media id', () => {
    expect(shortcodeToMediaId('DaNl103P4Zz')).toBe('3930964476378973811');
  });

  it('returns null for characters outside the alphabet', () => {
    expect(shortcodeToMediaId('bad*code')).toBeNull();
  });

  it('returns null for an empty shortcode', () => {
    expect(shortcodeToMediaId('')).toBeNull();
  });
});

describe('mapMediaInfo', () => {
  it('maps a single video post', () => {
    const json = {
      items: [
        {
          media_type: 2,
          video_versions: [{ url: 'https://cdn/v.mp4', width: 720, height: 1280 }],
          image_versions2: { candidates: [{ url: 'https://cdn/thumb.jpg', width: 720, height: 1280 }] },
          user: { username: 'alice' },
          caption: { text: 'hi' },
        },
      ],
    };
    const result = mapMediaInfo(json, 'ABC');
    expect(result).toEqual({
      platform: 'instagram',
      shortcode: 'ABC',
      username: 'alice',
      caption: 'hi',
      items: [
        {
          id: 'ABC',
          type: 'video',
          url: 'https://cdn/v.mp4',
          thumbnailUrl: 'https://cdn/thumb.jpg',
          width: 720,
          height: 1280,
          platform: 'instagram',
          formats: [
            {
              url: 'https://cdn/v.mp4',
              width: 720,
              height: 1280,
              bitrate: null,
              hasAudio: true,
            },
          ],
        },
      ],
    });
  });

  it('exposes the full video_versions ladder as formats (highest-first)', () => {
    const json = {
      items: [
        {
          media_type: 2,
          video_versions: [
            { url: 'https://cdn/1080.mp4', width: 1080, height: 1920 },
            { url: 'https://cdn/720.mp4', width: 720, height: 1280 },
            { url: 'https://cdn/480.mp4', width: 480, height: 854 },
          ],
          image_versions2: { candidates: [{ url: 'https://cdn/thumb.jpg' }] },
          user: { username: 'alice' },
        },
      ],
    };
    const item = mapMediaInfo(json, 'ABC')?.items[0];
    expect(item?.url).toBe('https://cdn/1080.mp4');
    expect(item?.formats?.map((f) => f.height)).toEqual([1920, 1280, 854]);
    expect(item?.formats?.every((f) => f.hasAudio)).toBe(true);
  });

  it('maps a single image post', () => {
    const json = {
      items: [
        {
          media_type: 1,
          image_versions2: { candidates: [{ url: 'https://cdn/i.jpg', width: 1080, height: 1080 }] },
          user: { username: 'bob' },
        },
      ],
    };
    const result = mapMediaInfo(json, 'IMG');
    expect(result?.items).toEqual([
      {
        id: 'IMG',
        type: 'image',
        url: 'https://cdn/i.jpg',
        thumbnailUrl: 'https://cdn/i.jpg',
        width: 1080,
        height: 1080,
        platform: 'instagram',
      },
    ]);
    expect(result?.caption).toBeNull();
  });

  it('maps a carousel with mixed children', () => {
    const json = {
      items: [
        {
          media_type: 8,
          user: { username: 'carol' },
          carousel_media: [
            {
              media_type: 1,
              image_versions2: { candidates: [{ url: 'https://cdn/1.jpg' }] },
            },
            {
              media_type: 2,
              video_versions: [{ url: 'https://cdn/2.mp4' }],
              image_versions2: { candidates: [{ url: 'https://cdn/2thumb.jpg' }] },
            },
          ],
        },
      ],
    };
    const result = mapMediaInfo(json, 'CAR');
    expect(result?.items.map((i) => ({ id: i.id, type: i.type, url: i.url }))).toEqual([
      { id: 'CAR-0', type: 'image', url: 'https://cdn/1.jpg' },
      { id: 'CAR-1', type: 'video', url: 'https://cdn/2.mp4' },
    ]);
  });

  it('returns null when there is no media', () => {
    expect(mapMediaInfo({ items: [] }, 'X')).toBeNull();
    expect(mapMediaInfo({}, 'X')).toBeNull();
  });
});

describe('mapMediaInfo — photo quality ladder', () => {
  // Shape captured from a live api/v1 media-info response: `candidates` mixes
  // full-frame renditions with square centre-crops at the SAME short-side sizes.
  const PHOTO = {
    items: [
      {
        media_type: 1,
        original_width: 1206,
        original_height: 2145,
        image_versions2: {
          candidates: [
            { url: 'https://cdn/640x1138.jpg', width: 640, height: 1138 },
            { url: 'https://cdn/480x854.jpg', width: 480, height: 854 },
            { url: 'https://cdn/320x569.jpg', width: 320, height: 569 },
            { url: 'https://cdn/240x427.jpg', width: 240, height: 427 },
            { url: 'https://cdn/crop-640.jpg', width: 640, height: 640 },
            { url: 'https://cdn/crop-480.jpg', width: 480, height: 480 },
            { url: 'https://cdn/crop-320.jpg', width: 320, height: 320 },
            { url: 'https://cdn/crop-150.jpg', width: 150, height: 150 },
          ],
        },
        user: { username: 'alice' },
        caption: { text: 'hi' },
      },
    ],
  };

  it('exposes the full-frame renditions as a ladder', () => {
    const result = mapMediaInfo(PHOTO, 'ABC');
    expect(result?.items[0].formats?.map((f) => [f.width, f.height])).toEqual([
      [640, 1138],
      [480, 854],
      [320, 569],
      [240, 427],
    ]);
  });

  it('excludes square centre-crops, so a capped photo is never cropped', () => {
    // Ranking by size alone would tie 480x854 with 480x480 for a 480 target and
    // could silently save a cropped photo.
    const urls = mapMediaInfo(PHOTO, 'ABC')?.items[0].formats?.map((f) => f.url) ?? [];
    expect(urls.some((url) => url.includes('crop'))).toBe(false);
  });

  it('keeps every rendition for a genuinely square post', () => {
    const square = {
      items: [
        {
          media_type: 1,
          original_width: 1080,
          original_height: 1080,
          image_versions2: {
            candidates: [
              { url: 'https://cdn/1080.jpg', width: 1080, height: 1080 },
              { url: 'https://cdn/640.jpg', width: 640, height: 640 },
              { url: 'https://cdn/320.jpg', width: 320, height: 320 },
            ],
          },
          user: { username: 'alice' },
          caption: null,
        },
      ],
    };
    expect(mapMediaInfo(square, 'SQ')?.items[0].formats).toHaveLength(3);
  });

  it('omits the ladder when only one rendition survives filtering', () => {
    const single = {
      items: [
        {
          media_type: 1,
          image_versions2: { candidates: [{ url: 'https://cdn/one.jpg', width: 640, height: 800 }] },
          user: { username: 'alice' },
          caption: null,
        },
      ],
    };
    expect(mapMediaInfo(single, 'ONE')?.items[0].formats).toBeUndefined();
  });
});

describe('mapMediaInfo — DASH audio stream', () => {
  const withManifest = (manifest?: string) => ({
    items: [
      {
        media_type: 2,
        video_versions: [{ url: 'https://cdn/v.mp4', width: 716, height: 1274 }],
        image_versions2: { candidates: [{ url: 'https://cdn/thumb.jpg', width: 640, height: 1138 }] },
        ...(manifest ? { video_dash_manifest: manifest } : {}),
        user: { username: 'alice' },
        caption: { text: 'hi' },
      },
    ],
  });

  const MANIFEST =
    '<MPD><Period><AdaptationSet contentType="video">' +
    '<Representation bandwidth="2612000" codecs="vp09.00.40.08" mimeType="video/mp4" width="1088" height="1936">' +
    '<BaseURL>https://cdn/dash-video.mp4</BaseURL></Representation></AdaptationSet>' +
    '<AdaptationSet contentType="audio">' +
    '<Representation bandwidth="62303" codecs="mp4a.40.5" mimeType="audio/mp4">' +
    '<BaseURL>https://cdn/dash-audio.m4a</BaseURL></Representation></AdaptationSet></Period></MPD>';

  it('exposes the manifest audio stream for audio-only downloads', () => {
    const item = mapMediaInfo(withManifest(MANIFEST), 'ABC')?.items[0];
    expect(item?.audioOnlyUrl).toBe('https://cdn/dash-audio.m4a');
  });

  it('keeps video coming from video_versions, not the VP9 DASH ladder', () => {
    // The DASH manifest advertises the full 1088x1936 original, but it is VP9 —
    // unmuxable on iOS and unevenly supported by Android's MediaMuxer — so video
    // must still come from the muxed video_versions entry.
    const item = mapMediaInfo(withManifest(MANIFEST), 'ABC')?.items[0];
    expect(item?.url).toBe('https://cdn/v.mp4');
    expect(item?.formats?.map((f) => f.url)).toEqual(['https://cdn/v.mp4']);
  });

  it('omits audioOnlyUrl when the post carries no manifest (is_dash_eligible = 0)', () => {
    const item = mapMediaInfo(withManifest(), 'ABC')?.items[0];
    expect(item?.audioOnlyUrl).toBeUndefined();
  });
});
