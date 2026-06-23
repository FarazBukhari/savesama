import { mapPlayerResponse } from '../youtube';

const PLAYER_RESPONSE = {
  playabilityStatus: { status: 'OK' },
  streamingData: {
    formats: [
      {
        itag: 18,
        mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
        url: 'https://r1.example/videoplayback?itag=18',
        width: 640,
        height: 360,
        bitrate: 568000,
      },
      {
        itag: 22,
        mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
        url: 'https://r1.example/videoplayback?itag=22',
        width: 1280,
        height: 720,
        bitrate: 1500000,
      },
    ],
    adaptiveFormats: [
      {
        itag: 137,
        mimeType: 'video/mp4; codecs="avc1.640028"',
        url: 'https://r1.example/videoplayback?itag=137',
        width: 1920,
        height: 1080,
        bitrate: 4000000,
      },
    ],
  },
  videoDetails: {
    title: 'Never Gonna Give You Up',
    author: 'Rick Astley',
    thumbnail: {
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120, height: 90 },
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', width: 1280, height: 720 },
      ],
    },
  },
};

describe('mapPlayerResponse', () => {
  it('picks the highest-resolution progressive MP4 (720p over 360p)', () => {
    const result = mapPlayerResponse(PLAYER_RESPONSE, 'dQw4w9WgXcQ');
    expect(result).toEqual({
      platform: 'youtube',
      shortcode: 'dQw4w9WgXcQ',
      items: [
        {
          id: 'dQw4w9WgXcQ',
          type: 'video',
          url: 'https://r1.example/videoplayback?itag=22',
          thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
          width: 1280,
          height: 720,
        },
      ],
      username: 'Rick Astley',
      caption: 'Never Gonna Give You Up',
    });
  });

  it('ignores adaptive (video-only) formats even when higher resolution', () => {
    const result = mapPlayerResponse(PLAYER_RESPONSE, 'dQw4w9WgXcQ');
    // 1080p itag 137 is adaptive/video-only — must not be selected.
    expect(result?.items[0].height).toBe(720);
  });

  it('returns null when only ciphered formats are available (no direct url)', () => {
    const ciphered = {
      streamingData: {
        formats: [
          {
            itag: 18,
            mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
            signatureCipher: 's=abc&url=https%3A%2F%2Fr1.example',
            width: 640,
            height: 360,
          },
        ],
      },
    };
    expect(mapPlayerResponse(ciphered, 'dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null when there are no progressive formats', () => {
    const adaptiveOnly = {
      streamingData: { formats: [], adaptiveFormats: PLAYER_RESPONSE.streamingData.adaptiveFormats },
    };
    expect(mapPlayerResponse(adaptiveOnly, 'dQw4w9WgXcQ')).toBeNull();
  });

  it('falls back to a generated thumbnail URL when none are provided', () => {
    const noThumb = {
      streamingData: { formats: [PLAYER_RESPONSE.streamingData.formats[0]] },
      videoDetails: { title: 't', author: 'a' },
    };
    expect(mapPlayerResponse(noThumb, 'dQw4w9WgXcQ')?.items[0].thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
  });
});
