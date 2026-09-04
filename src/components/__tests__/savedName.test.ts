// expo-media-library's native side isn't available under jest; only the enum is needed.
jest.mock('expo-media-library', () => ({
  MediaType: { AUDIO: 'audio', IMAGE: 'photo', VIDEO: 'video', UNKNOWN: 'unknown' },
}));

import { MediaType } from 'expo-media-library';

import { buildSavedFilename, prettyName, sanitizePoster, splitExtension } from '../savedName';

describe('buildSavedFilename', () => {
  it('names a single post after its poster and code', () => {
    expect(
      buildSavedFilename(
        { id: 'DblSWtPD9-n', username: 'natgeo', postCode: 'DblSWtPD9-n', platform: 'instagram' },
        'video',
        'mp4'
      )
    ).toBe('natgeo - DblSWtPD9-n.mp4');
  });

  it('keeps the carousel position and marks audio saves', () => {
    const item = {
      id: 'DblSWtPD9-n-2',
      username: 'natgeo',
      postCode: 'DblSWtPD9-n',
      position: 3,
      platform: 'threads' as const,
    };
    expect(buildSavedFilename(item, 'image', 'jpg')).toBe('natgeo - DblSWtPD9-n - 3.jpg');
    expect(buildSavedFilename(item, 'audio', 'm4a')).toBe('natgeo - DblSWtPD9-n - 3 - audio.m4a');
  });

  it('falls back to the platform when the poster is unknown', () => {
    expect(
      buildSavedFilename(
        { id: 'dQw4w9WgXcQ', username: null, postCode: 'dQw4w9WgXcQ', platform: 'youtube' },
        'video',
        'mp4'
      )
    ).toBe('youtube - dQw4w9WgXcQ.mp4');
  });

  it('never puts the caption or unsafe characters in the name', () => {
    expect(sanitizePoster('Rick Astley / Official <VEVO>')).toBe('Rick Astley Official VEVO');
    expect(sanitizePoster('a - b')).toBe('a b');
    expect(sanitizePoster('   ')).toBeNull();
  });
});

describe('prettyName', () => {
  it('reads the current scheme back, including MediaStore de-duplication', () => {
    expect(prettyName('natgeo - DblSWtPD9-n - 3.jpg', MediaType.IMAGE)).toEqual({
      title: 'natgeo',
      kind: 'Photo 3',
      code: 'DblSWtPD9-n',
    });
    expect(prettyName('natgeo - DblSWtPD9-n (1).mp4', MediaType.VIDEO)).toEqual({
      title: 'natgeo',
      kind: 'Video',
      code: 'DblSWtPD9-n',
    });
    expect(prettyName('Rick Astley - dQw4w9WgXcQ - audio.m4a', MediaType.AUDIO)).toEqual({
      title: 'Rick Astley',
      kind: 'Audio',
      code: 'dQw4w9WgXcQ',
    });
  });

  it('still reads files saved under the legacy timestamped scheme', () => {
    expect(prettyName('savesama_DboX9Zakaiz-11_1785936336888_dl.jpg', MediaType.IMAGE)).toEqual({
      title: 'Photo',
      kind: 'Photo 11',
      code: 'DboX9Zakaiz',
    });
  });

  it('shows a user-renamed file as-is', () => {
    expect(prettyName('holiday clip.mp4', MediaType.VIDEO)).toEqual({
      title: 'holiday clip',
      kind: 'Video',
      code: null,
    });
  });

  it('splits extensions case-insensitively', () => {
    expect(splitExtension('Name - Abc12.MP4')).toEqual({ stem: 'Name - Abc12', extension: 'mp4' });
    expect(splitExtension('noext')).toEqual({ stem: 'noext', extension: null });
  });
});
