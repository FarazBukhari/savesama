import { mapGraphqlMedia, parseEmbedHtml } from '../instagram';

describe('mapGraphqlMedia', () => {
  it('maps a single image post', () => {
    const media = {
      __typename: 'XDTGraphImage',
      is_video: false,
      display_url: 'https://cdn.example/image.jpg',
      dimensions: { width: 1080, height: 1350 },
      owner: { username: 'someuser' },
      edge_media_to_caption: { edges: [{ node: { text: 'hello world' } }] },
    };

    const result = mapGraphqlMedia(media, 'ABC123');
    expect(result).toEqual({
      platform: 'instagram',
      shortcode: 'ABC123',
      items: [
        {
          id: 'ABC123',
          type: 'image',
          url: 'https://cdn.example/image.jpg',
          thumbnailUrl: 'https://cdn.example/image.jpg',
          width: 1080,
          height: 1350,
          platform: 'instagram',
        },
      ],
      username: 'someuser',
      caption: 'hello world',
    });
  });

  it('maps a video post with the video URL and image thumbnail', () => {
    const media = {
      is_video: true,
      video_url: 'https://cdn.example/clip.mp4',
      display_url: 'https://cdn.example/poster.jpg',
      dimensions: { width: 720, height: 1280 },
    };

    const result = mapGraphqlMedia(media, 'VID999');
    expect(result?.items).toEqual([
      {
        id: 'VID999',
        type: 'video',
        url: 'https://cdn.example/clip.mp4',
        thumbnailUrl: 'https://cdn.example/poster.jpg',
        width: 720,
        height: 1280,
        platform: 'instagram',
      },
    ]);
  });

  it('maps a carousel into one item per child', () => {
    const media = {
      edge_sidecar_to_children: {
        edges: [
          {
            node: {
              is_video: false,
              display_url: 'https://cdn.example/one.jpg',
              dimensions: { width: 1080, height: 1080 },
            },
          },
          {
            node: {
              is_video: true,
              video_url: 'https://cdn.example/two.mp4',
              display_url: 'https://cdn.example/two-poster.jpg',
            },
          },
        ],
      },
    };

    const result = mapGraphqlMedia(media, 'CAR000');
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]).toMatchObject({ id: 'CAR000-0', type: 'image' });
    expect(result?.items[1]).toMatchObject({
      id: 'CAR000-1',
      type: 'video',
      url: 'https://cdn.example/two.mp4',
    });
  });

  it('returns null when no media can be mapped', () => {
    expect(mapGraphqlMedia({ is_video: false }, 'EMPTY')).toBeNull();
  });
});

describe('parseEmbedHtml', () => {
  it('extracts a video URL from embedded JSON', () => {
    const html = `
      <html><body>
      <script>{"username":"creator","video_url":"https:\\/\\/cdn.example\\/v.mp4?sig=a\\u0026b=c","display_url":"https:\\/\\/cdn.example\\/p.jpg"}</script>
      </body></html>`;

    const result = parseEmbedHtml(html, 'EMB111');
    expect(result?.items[0]).toMatchObject({
      type: 'video',
      url: 'https://cdn.example/v.mp4?sig=a&b=c',
      thumbnailUrl: 'https://cdn.example/p.jpg',
    });
    expect(result?.username).toBe('creator');
  });

  it('extracts an image from the EmbeddedMediaImage tag', () => {
    const html = `
      <html><body>
      <img class="EmbeddedMediaImage" sizes="100vw" src="https://cdn.example/photo.jpg?a=1&amp;b=2" />
      </body></html>`;

    const result = parseEmbedHtml(html, 'EMB222');
    expect(result?.items[0]).toMatchObject({
      type: 'image',
      url: 'https://cdn.example/photo.jpg?a=1&b=2',
    });
  });

  it('returns null when nothing is found', () => {
    expect(parseEmbedHtml('<html><body>nothing</body></html>', 'X')).toBeNull();
  });
});
