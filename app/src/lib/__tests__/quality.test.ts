import { chooseQuality, offeredQualities, qualityLabel } from '../quality';

describe('quality choice', () => {
  it('merges and sorts offered qualities', () => {
    expect(offeredQualities([[1080, 720], [720, 480], []])).toEqual([1080, 720, 480]);
  });
  it('keeps max', () => expect(chooseQuality('max', [1080, 720])).toBe('max'));
  it('uses the preference when offered', () => expect(chooseQuality(720, [1080, 720, 480])).toBe(720));
  it('falls to the highest value below the preference', () => expect(chooseQuality(1440, [2160, 1080, 720])).toBe(1080));
  it('falls to the lowest offered when nothing is below', () => expect(chooseQuality(360, [1080, 720])).toBe(720));
  it('sends the preference as-is when the post lists no qualities', () => expect(chooseQuality(720, [])).toBe(720));
  it('labels', () => {
    expect(qualityLabel('max')).toBe('Best');
    expect(qualityLabel(1080)).toBe('1080p');
  });
});
