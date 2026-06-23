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
