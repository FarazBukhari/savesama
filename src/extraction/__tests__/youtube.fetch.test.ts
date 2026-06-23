import { extractYouTube } from '../youtube';

interface MockCall {
  url: string;
  init: RequestInit | undefined;
}

const PLAYER_FIXTURE = {
  playabilityStatus: { status: 'OK' },
  streamingData: {
    formats: [
      {
        itag: 18,
        mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
        url: 'https://r3.example/videoplayback?itag=18',
        width: 640,
        height: 360,
        bitrate: 568000,
      },
    ],
  },
  videoDetails: { title: 'Sample', author: 'Channel' },
};

const LOGIN_REQUIRED_FIXTURE = {
  playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' },
};

const BOT_CHECK_FIXTURE = {
  playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' },
};

function makeResponse(bodyText: string, url: string): Response {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: () => null },
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  } as unknown as Response;
}

describe('extractYouTube fetch path', () => {
  let calls: MockCall[];

  function mockFetch(bodyFor: (url: string) => string) {
    calls = [];
    globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return Promise.resolve(makeResponse(bodyFor(url), url));
    }) as unknown as typeof fetch;
  }

  it('POSTs to youtubei/v1/player with the ANDROID_VR client and maps the stream', async () => {
    mockFetch(() => JSON.stringify(PLAYER_FIXTURE));

    const result = await extractYouTube('dQw4w9WgXcQ');

    expect(result.platform).toBe('youtube');
    expect(result.items).toEqual([
      {
        id: 'dQw4w9WgXcQ',
        type: 'video',
        url: 'https://r3.example/videoplayback?itag=18',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        width: 640,
        height: 360,
      },
    ]);
    expect(result.username).toBe('Channel');
    expect(result.caption).toBe('Sample');

    const call = calls.find((c) => c.url.includes('/youtubei/v1/player'));
    expect(call).toBeDefined();
    expect(call!.init?.method).toBe('POST');
    const headers = call!.init?.headers as Record<string, string>;
    expect(headers['X-YouTube-Client-Name']).toBe('28');
    expect(String(call!.init?.body)).toContain('"clientName":"ANDROID_VR"');
    expect(String(call!.init?.body)).toContain('"videoId":"dQw4w9WgXcQ"');
  });

  it('surfaces a sign-in message for age-restricted/private videos', async () => {
    mockFetch(() => JSON.stringify(LOGIN_REQUIRED_FIXTURE));

    await expect(extractYouTube('dQw4w9WgXcQ')).rejects.toMatchObject({
      userMessage: expect.stringContaining('sign-in'),
    });
  });

  it('treats a "not a bot" check as a transient, retryable block', async () => {
    mockFetch(() => JSON.stringify(BOT_CHECK_FIXTURE));

    await expect(extractYouTube('dQw4w9WgXcQ')).rejects.toMatchObject({
      userMessage: expect.stringContaining('temporarily blocking'),
    });
  });
});
