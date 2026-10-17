import type { ResolveItem, Resolved } from '../api';
import { ctaLabel, postKind, postMeta, splitSound } from '../preview';

const item = (index: number, type: ResolveItem['type'], extra: Partial<ResolveItem> = {}): ResolveItem => ({
  index, type, thumbnail: null, width: null, height: null, duration: null, qualities: [], has_audio: type !== 'image', ...extra,
});
const post = (items: ResolveItem[], url = 'https://www.instagram.com/p/X/'): Resolved => ({
  url, platform: 'instagram', id: 'X', title: null, author: null, thumbnail: null, duration: null, items,
});

const song = item(3, 'audio', { title: 'Golden Hour · JVKE', duration: 15 });
const photos = [item(0, 'image'), item(1, 'image'), item(2, 'image'), song];

it('pulls a photo post’s soundtrack out of the tiles', () => {
  const { tiles, sound } = splitSound(photos);
  expect(tiles.map((i) => i.index)).toEqual([0, 1, 2]);
  expect(sound).toBe(song);
  // A post that is only audio keeps it as its tile.
  expect(splitSound([item(0, 'audio')])).toEqual({ tiles: [item(0, 'audio')], sound: null });
});

it('describes the post without counting the soundtrack as an item', () => {
  expect(postMeta(post(photos))).toBe('Post · 3 items · 3 photos · with sound');
  const single = post([item(0, 'image'), item(1, 'audio')]);
  expect(postKind(single)).toBe('Photo');
  expect(postMeta(single)).toBe('Photo · with sound');
});

it('labels the save button with the sound', () => {
  expect(ctaLabel(photos.slice(0, 3), 'media', song)).toBe('Save 3 items');
  expect(ctaLabel(photos, 'media', song)).toBe('Save 3 items + sound');
  expect(ctaLabel([photos[0], song], 'media', song)).toBe('Save photo + sound');
  expect(ctaLabel([song], 'media', song)).toBe('Save sound');
  expect(ctaLabel([], 'media', song)).toBe('Select something to save');
});
