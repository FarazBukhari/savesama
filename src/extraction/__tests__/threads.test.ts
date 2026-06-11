import { mapThreadsPost, parseThreadsHtml } from '../threads';

function sjsScript(payload: unknown): string {
  return `<script type="application/json" data-content-len="1" data-sjs>${JSON.stringify(
    payload
  )}</script>`;
}

describe('parseThreadsHtml', () => {
  it('finds a video post inside data-sjs JSON', () => {
    const payload = {
      require: [
        {
          data: {
            post: {
              code: 'THR123',
              user: { username: 'threadsuser' },
              caption: { text: 'a caption' },
              original_width: 720,
              original_height: 1280,
              video_versions: [{ url: 'https://cdn.example/t.mp4', type: 101 }],
              image_versions2: {
                candidates: [{ url: 'https://cdn.example/t-poster.jpg', width: 720 }],
              },
            },
          },
        },
      ],
    };
    const html = `<html><body>${sjsScript(payload)}</body></html>`;

    const result = parseThreadsHtml(html, 'THR123');
    expect(result).toEqual({
      platform: 'threads',
      shortcode: 'THR123',
      items: [
        {
          id: 'THR123',
          type: 'video',
          url: 'https://cdn.example/t.mp4',
          thumbnailUrl: 'https://cdn.example/t-poster.jpg',
          width: 720,
          height: 1280,
        },
      ],
      username: 'threadsuser',
      caption: 'a caption',
    });
  });

  it('ignores posts with a different code', () => {
    const payload = {
      post: {
        code: 'OTHER',
        image_versions2: { candidates: [{ url: 'https://cdn.example/x.jpg' }] },
      },
    };
    const html = sjsScript(payload);
    expect(parseThreadsHtml(html, 'THR123')).toBeNull();
  });

  it('skips malformed JSON blocks without crashing', () => {
    const html =
      '<script type="application/json" data-sjs>{"code":"THR123","image_versions2":broken</script>';
    expect(parseThreadsHtml(html, 'THR123')).toBeNull();
  });
});

describe('mapThreadsPost', () => {
  it('maps an image post', () => {
    const post = {
      code: 'IMG1',
      image_versions2: { candidates: [{ url: 'https://cdn.example/big.jpg' }] },
      original_width: 1440,
      original_height: 1800,
    };

    const result = mapThreadsPost(post, 'IMG1');
    expect(result?.items).toEqual([
      {
        id: 'IMG1',
        type: 'image',
        url: 'https://cdn.example/big.jpg',
        thumbnailUrl: 'https://cdn.example/big.jpg',
        width: 1440,
        height: 1800,
      },
    ]);
  });

  it('maps a carousel post into one item per slide', () => {
    const post = {
      code: 'CAR1',
      carousel_media: [
        {
          image_versions2: { candidates: [{ url: 'https://cdn.example/a.jpg' }] },
        },
        {
          video_versions: [{ url: 'https://cdn.example/b.mp4' }],
          image_versions2: { candidates: [{ url: 'https://cdn.example/b-poster.jpg' }] },
        },
      ],
    };

    const result = mapThreadsPost(post, 'CAR1');
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]).toMatchObject({ id: 'CAR1-0', type: 'image' });
    expect(result?.items[1]).toMatchObject({
      id: 'CAR1-1',
      type: 'video',
      url: 'https://cdn.example/b.mp4',
    });
  });

  it('returns null for text-only posts', () => {
    const post = { code: 'TXT1', image_versions2: { candidates: [] } };
    expect(mapThreadsPost(post, 'TXT1')).toBeNull();
  });
});
