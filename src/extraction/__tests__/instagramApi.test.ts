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
