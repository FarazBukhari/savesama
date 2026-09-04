import { extractInstagram } from '../instagram';
import { resetCsrfTokenCache } from '../http';

interface MockCall {
  url: string;
  init: RequestInit | undefined;
}

const CSRF = 'TESTCSRF1234567890';

const GRAPHQL_FIXTURE = {
  data: {
    xdt_shortcode_media: {
      __typename: 'XDTGraphImage',
      is_video: false,
      display_url: 'https://cdn.example/photo.jpg',
      dimensions: { width: 1080, height: 1080 },
      owner: { username: 'tester' },
      edge_media_to_caption: { edges: [{ node: { text: 'hi' } }] },
    },
  },
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

describe('extractInstagram fetch path', () => {
  let calls: MockCall[];

  beforeEach(() => {
    resetCsrfTokenCache();
    calls = [];
    globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === 'https://www.instagram.com/') {
        return Promise.resolve(
          makeResponse(`<html>...,"csrf_token":"${CSRF}",...</html>`, url)
        );
      }
      if (url.startsWith('https://www.instagram.com/graphql/query')) {
        return Promise.resolve(makeResponse(JSON.stringify(GRAPHQL_FIXTURE), url));
      }
      // Any other URL (e.g. the dead /api/graphql, embed, og) returns an empty shell.
      return Promise.resolve(makeResponse('<html>shell</html>', url));
    }) as unknown as typeof fetch;
  });

  it('fetches a CSRF token then queries /graphql/query and extracts media', async () => {
    const result = await extractInstagram('ABC123');

    expect(result.items).toEqual([
      {
        id: 'ABC123',
        type: 'image',
        url: 'https://cdn.example/photo.jpg',
        thumbnailUrl: 'https://cdn.example/photo.jpg',
        width: 1080,
        height: 1080,
        platform: 'instagram',
        username: 'tester',
        postCode: 'ABC123',
      },
    ]);
    expect(result.username).toBe('tester');

    const graphqlCall = calls.find((c) => c.url.startsWith('https://www.instagram.com/graphql/query'));
    expect(graphqlCall).toBeDefined();
    const headers = graphqlCall!.init?.headers as Record<string, string>;
    expect(headers['X-CSRFToken']).toBe(CSRF);
    expect(headers['Cookie']).toBe(`csrftoken=${CSRF}`);
  });

  it('never calls the walled /api/graphql endpoint', async () => {
    await extractInstagram('ABC123');
    expect(calls.some((c) => c.url.includes('/api/graphql'))).toBe(false);
  });

  it('GETs the token before POSTing the query', async () => {
    await extractInstagram('ABC123');
    const tokenIndex = calls.findIndex((c) => c.url === 'https://www.instagram.com/');
    const queryIndex = calls.findIndex((c) =>
      c.url.startsWith('https://www.instagram.com/graphql/query')
    );
    expect(tokenIndex).toBeGreaterThanOrEqual(0);
    expect(queryIndex).toBeGreaterThan(tokenIndex);
  });
});
