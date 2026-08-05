import {
  SessionFetchResult,
  registerFetcher,
  unregisterFetcher,
} from '../../services/mediaSession';
import { extractThreads } from '../threads';
import { ExtractionError } from '../types';

// Payload shapes captured from live threads.com api/v1/media/{id}/info/ responses
// (August 2026); CDN query strings stripped, candidate lists trimmed.
const VIDEO_PAYLOAD = {
  num_results: 1,
  items: [
    {
      media_type: 2,
      image_versions2: {
        candidates: [
          { url: 'https://instagram.fna.fbcdn.net/v/t51.71878-15/thumb.jpg', width: 640, height: 800 },
        ],
      },
      video_versions: [
        { url: 'https://instagram.fna.fbcdn.net/o1/v/t16/f2/m84/clip.mp4', width: 480, height: 600, type: 101 },
      ],
      code: 'Dbnv00dEeUn',
      pk: '3956341135589369127',
      user: { username: 'izadailylife78' },
      caption: { text: 'a caption' },
    },
  ],
};

const CAROUSEL_PAYLOAD = {
  num_results: 1,
  items: [
    {
      media_type: 8,
      image_versions2: {
        candidates: [{ url: 'https://cdn/first.jpg', width: 1206, height: 815 }],
      },
      carousel_media: [
        {
          media_type: 1,
          image_versions2: { candidates: [{ url: 'https://cdn/first.jpg', width: 1206, height: 815 }] },
        },
        {
          media_type: 1,
          image_versions2: { candidates: [{ url: 'https://cdn/second.jpg', width: 1245, height: 1357 }] },
        },
      ],
      code: 'DbnQECjGl4X',
      user: { username: 'ajit.xplore' },
      caption: { text: 'two photos' },
    },
  ],
};

// Threads text-only posts use media_type 19 and carry no image/video versions.
const TEXT_ONLY_PAYLOAD = {
  num_results: 1,
  items: [{ media_type: 19, code: 'DbldCmDgXFE', user: { username: 'joy.hsueh' }, caption: { text: 'words' } }],
};

function withFetcher<T>(
  result: SessionFetchResult | ((mediaId: string) => SessionFetchResult),
  run: (calls: string[]) => Promise<T>
): Promise<T> {
  const calls: string[] = [];
  const fetcher = async (mediaId: string) => {
    calls.push(mediaId);
    return typeof result === 'function' ? result(mediaId) : result;
  };
  registerFetcher('threads', fetcher);
  return run(calls).finally(() => unregisterFetcher('threads', fetcher));
}

function ok(payload: unknown): SessionFetchResult {
  return { ok: true, status: 200, body: JSON.stringify(payload) };
}

describe('extractThreads', () => {
  it('maps a video post and decodes the post code to the media id', async () => {
    await withFetcher(ok(VIDEO_PAYLOAD), async (calls) => {
      const result = await extractThreads('Dbnv00dEeUn');
      expect(calls).toEqual(['3956341135589369127']);
      expect(result).toEqual({
        platform: 'threads',
        shortcode: 'Dbnv00dEeUn',
        username: 'izadailylife78',
        caption: 'a caption',
        items: [
          {
            id: 'Dbnv00dEeUn',
            type: 'video',
            url: 'https://instagram.fna.fbcdn.net/o1/v/t16/f2/m84/clip.mp4',
            thumbnailUrl: 'https://instagram.fna.fbcdn.net/v/t51.71878-15/thumb.jpg',
            width: 480,
            height: 600,
            // The item must claim 'threads' so the download layer reads the Threads
            // resolution preference, not Instagram's.
            platform: 'threads',
            formats: [
              {
                url: 'https://instagram.fna.fbcdn.net/o1/v/t16/f2/m84/clip.mp4',
                width: 480,
                height: 600,
                bitrate: null,
                hasAudio: true,
              },
            ],
          },
        ],
      });
    });
  });

  it('maps every child of a carousel post', async () => {
    await withFetcher(ok(CAROUSEL_PAYLOAD), async () => {
      const result = await extractThreads('DbnQECjGl4X');
      expect(result.platform).toBe('threads');
      expect(result.items.map((item) => [item.id, item.type, item.url])).toEqual([
        ['DbnQECjGl4X-0', 'image', 'https://cdn/first.jpg'],
        ['DbnQECjGl4X-1', 'image', 'https://cdn/second.jpg'],
      ]);
    });
  });

  it('reports text-only posts as having nothing to download', async () => {
    await withFetcher(ok(TEXT_ONLY_PAYLOAD), async () => {
      await expect(extractThreads('DbldCmDgXFE')).rejects.toThrow(
        expect.objectContaining({
          userMessage: 'This Threads post has no photo or video to download.',
        }) as Error
      );
    });
  });

  it('asks the user to sign in when the login screen was dismissed', async () => {
    await withFetcher({ ok: false, status: 0, body: '', cancelled: true }, async () => {
      await expect(extractThreads('DbnQECjGl4X')).rejects.toThrow(
        expect.objectContaining({
          userMessage: 'Threads requires a login to download. Sign in to save this post.',
        }) as Error
      );
    });
  });

  it('fails clearly when the fetch did not succeed', async () => {
    await withFetcher({ ok: false, status: 404, body: '{}' }, async () => {
      await expect(extractThreads('DbnQECjGl4X')).rejects.toBeInstanceOf(ExtractionError);
    });
  });

  it('fails clearly when no resolver is mounted', async () => {
    await expect(extractThreads('DbnQECjGl4X')).rejects.toThrow(
      expect.objectContaining({
        userMessage: 'Threads downloads need the app’s sign-in view, which isn’t available here.',
      }) as Error
    );
  });

  it('rejects a post code outside the shortcode alphabet', async () => {
    await withFetcher(ok(VIDEO_PAYLOAD), async () => {
      await expect(extractThreads('bad*code')).rejects.toBeInstanceOf(ExtractionError);
    });
  });
});
