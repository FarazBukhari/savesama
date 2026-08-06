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
      {
        itag: 140,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        url: 'https://r1.example/videoplayback?itag=140',
        bitrate: 128000,
      },
      {
        itag: 251,
        mimeType: 'audio/webm; codecs="opus"',
        url: 'https://r1.example/videoplayback?itag=251',
        bitrate: 130000,
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
  it('sets the default url to the highest-resolution progressive MP4 (720p over 360p)', () => {
    const result = mapPlayerResponse(PLAYER_RESPONSE, 'dQw4w9WgXcQ');
    const item = result?.items[0];
    expect(item?.url).toBe('https://r1.example/videoplayback?itag=22');
    expect(item?.width).toBe(1280);
    expect(item?.height).toBe(720);
    expect(item?.platform).toBe('youtube');
    expect(result?.username).toBe('Rick Astley');
    expect(result?.caption).toBe('Never Gonna Give You Up');
    expect(item?.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
  });

  it('keeps the default single url progressive (≤720p), not the 1080p adaptive stream', () => {
    const result = mapPlayerResponse(PLAYER_RESPONSE, 'dQw4w9WgXcQ');
    // 1080p itag 137 is adaptive/video-only — must not be the default url.
    expect(result?.items[0].height).toBe(720);
  });

  it('exposes progressive + adaptive-H.264 formats, pairing HD with the AAC (m4a) audio', () => {
    const result = mapPlayerResponse(PLAYER_RESPONSE, 'dQw4w9WgXcQ');
    const formats = result?.items[0].formats ?? [];

    const progressive = formats.filter((f) => f.hasAudio);
    expect(progressive.map((f) => f.height).sort()).toEqual([360, 720]);

    const hd = formats.find((f) => f.height === 1080);
    expect(hd?.hasAudio).toBe(false);
    // Paired with the AAC/m4a adaptive audio (itag 140), NOT the Opus/webm (itag 251).
    expect(hd?.audioUrl).toBe('https://r1.example/videoplayback?itag=140');
    expect(hd?.url).toBe('https://r1.example/videoplayback?itag=137');
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

describe('mapPlayerResponse — audio-only stream', () => {
  it('exposes the adaptive AAC stream so audio saves skip the video download', () => {
    const player = {
      streamingData: {
        formats: [
          {
            itag: 18,
            mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
            url: 'https://yt/progressive.mp4',
            width: 640,
            height: 360,
            bitrate: 568000,
          },
        ],
        adaptiveFormats: [
          {
            itag: 140,
            mimeType: 'audio/mp4; codecs="mp4a.40.2"',
            url: 'https://yt/audio-128k.m4a',
            bitrate: 128000,
          },
          {
            itag: 139,
            mimeType: 'audio/mp4; codecs="mp4a.40.5"',
            url: 'https://yt/audio-48k.m4a',
            bitrate: 48000,
          },
        ],
      },
      videoDetails: { author: 'chan', title: 'vid' },
    };
    const result = mapPlayerResponse(player, 'abcdefghijk');
    // Highest-bitrate AAC wins.
    expect(result?.items[0].audioOnlyUrl).toBe('https://yt/audio-128k.m4a');
  });

  it('omits audioOnlyUrl when no adaptive AAC stream is offered', () => {
    const player = {
      streamingData: {
        formats: [
          {
            itag: 18,
            mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
            url: 'https://yt/progressive.mp4',
            width: 640,
            height: 360,
            bitrate: 568000,
          },
        ],
        // Opus/WebM only — unusable for a passthrough M4A.
        adaptiveFormats: [
          { itag: 251, mimeType: 'audio/webm; codecs="opus"', url: 'https://yt/a.webm', bitrate: 130000 },
        ],
      },
      videoDetails: { author: 'chan', title: 'vid' },
    };
    expect(mapPlayerResponse(player, 'abcdefghijk')?.items[0].audioOnlyUrl).toBeUndefined();
  });
});
