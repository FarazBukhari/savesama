import { extractYouTube, resetYouTubeVisitorDataCache } from '../youtube';

interface MockCall {
  url: string;
  init: RequestInit | undefined;
}

const VISITOR_FIXTURE = { responseContext: { visitorData: 'VISITOR123' } };

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

  beforeEach(() => {
    resetYouTubeVisitorDataCache();
  });

  // `playerBody` may vary per call to simulate a retry after a bot-check.
  function mockFetch(playerBody: (callIndex: number) => string) {
    calls = [];
    let playerCalls = 0;
    globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('/youtubei/v1/visitor_id')) {
        return Promise.resolve(makeResponse(JSON.stringify(VISITOR_FIXTURE), url));
      }
      return Promise.resolve(makeResponse(playerBody(playerCalls++), url));
    }) as unknown as typeof fetch;
  }

  it('fetches visitorData, then POSTs to youtubei/v1/player and maps the stream', async () => {
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
        platform: 'youtube',
        formats: [
          {
            url: 'https://r3.example/videoplayback?itag=18',
            width: 640,
            height: 360,
            bitrate: 568000,
            hasAudio: true,
          },
        ],
      },
    ]);
    expect(result.username).toBe('Channel');
    expect(result.caption).toBe('Sample');

    // visitorData is requested before the player call and threaded into it.
    const visitorIndex = calls.findIndex((c) => c.url.includes('/youtubei/v1/visitor_id'));
    const playerIndex = calls.findIndex((c) => c.url.includes('/youtubei/v1/player'));
    expect(visitorIndex).toBeGreaterThanOrEqual(0);
    expect(playerIndex).toBeGreaterThan(visitorIndex);

    const playerCall = calls[playerIndex];
    const headers = playerCall.init?.headers as Record<string, string>;
    expect(headers['X-YouTube-Client-Name']).toBe('28');
    expect(headers['X-Goog-Visitor-Id']).toBe('VISITOR123');
    expect(String(playerCall.init?.body)).toContain('"clientName":"ANDROID_VR"');
    expect(String(playerCall.init?.body)).toContain('"visitorData":"VISITOR123"');
    expect(String(playerCall.init?.body)).toContain('"videoId":"dQw4w9WgXcQ"');
  });

  it('retries with fresh visitorData after a bot-check, then succeeds', async () => {
    // First player call is bot-checked; second (after refresh) succeeds.
    mockFetch((i) => JSON.stringify(i === 0 ? BOT_CHECK_FIXTURE : PLAYER_FIXTURE));

    const result = await extractYouTube('dQw4w9WgXcQ');
    expect(result.items[0].url).toBe('https://r3.example/videoplayback?itag=18');

    const playerCalls = calls.filter((c) => c.url.includes('/youtubei/v1/player'));
    expect(playerCalls).toHaveLength(2);
  });

  it('surfaces a sign-in message for age-restricted/private videos', async () => {
    mockFetch(() => JSON.stringify(LOGIN_REQUIRED_FIXTURE));

    await expect(extractYouTube('dQw4w9WgXcQ')).rejects.toMatchObject({
      userMessage: expect.stringContaining('sign-in'),
    });
  });

  it('reports a persistent "not a bot" check as a transient, retryable block', async () => {
    mockFetch(() => JSON.stringify(BOT_CHECK_FIXTURE));

    await expect(extractYouTube('dQw4w9WgXcQ')).rejects.toMatchObject({
      userMessage: expect.stringContaining('temporarily blocking'),
    });
  });
});
