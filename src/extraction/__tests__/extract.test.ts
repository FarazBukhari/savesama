import {
  SessionFetchResult,
  registerFetcher,
  unregisterFetcher,
} from '../../services/mediaSession';
import { extractMedia } from '../extract';
import { ExtractionError } from '../types';

describe('extractMedia — unsupported links', () => {
  it('throws a song-specific error for Instagram audio pages without touching the network', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const url = 'https://www.instagram.com/reels/audio/1273422726399305?igsh=MW80OTVwZWhwbDUzdw==';
    await expect(extractMedia(url)).rejects.toBeInstanceOf(ExtractionError);
    await expect(extractMedia(url)).rejects.toMatchObject({
      userMessage: expect.stringContaining('Downloading songs isn’t supported'),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('extractMedia — threads share links', () => {
  const CANONICAL =
    'https://www.threads.com/@romisa.khan804/post/Dbm-rE8CDa5?xmt=AQG0zt-U43KQ&slof=1';

  const PAYLOAD = {
    items: [
      {
        media_type: 1,
        image_versions2: { candidates: [{ url: 'https://cdn/photo.jpg', width: 960, height: 1295 }] },
        user: { username: 'romisa.khan804' },
        caption: { text: 'hello' },
      },
    ],
  };

  it('resolves /share/<token> with a crawler UA, then extracts the resolved post', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, url: CANONICAL, text: async () => '' } as Response);

    const seen: string[] = [];
    const fetcher = async (mediaId: string): Promise<SessionFetchResult> => {
      seen.push(mediaId);
      return { ok: true, status: 200, body: JSON.stringify(PAYLOAD) };
    };
    registerFetcher('threads', fetcher);

    try {
      const result = await extractMedia('https://www.threads.com/share/BAsFhl_yx0/');
      expect(result.platform).toBe('threads');
      expect(result.shortcode).toBe('Dbm-rE8CDa5');
      expect(result.items).toHaveLength(1);
      // Threads serves the login shell to a browser UA; only a crawler UA gets the 302.
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['User-Agent']).toContain(
        'facebookexternalhit'
      );
      expect(seen).toEqual(['3956124961814886073']);
    } finally {
      unregisterFetcher('threads', fetcher);
      fetchSpy.mockRestore();
    }
  });
});
