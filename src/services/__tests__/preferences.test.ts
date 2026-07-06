const store: { file: string | null } = { file: null };

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async () => ({ exists: store.file !== null })),
  readAsStringAsync: jest.fn(async () => {
    if (store.file === null) throw new Error('no file');
    return store.file;
  }),
  writeAsStringAsync: jest.fn(async (_uri: string, contents: string) => {
    store.file = contents;
  }),
}));

import {
  DEFAULT_PREFERENCES,
  getPreferences,
  loadPreferences,
  resetPreferencesForTests,
  savePreferences,
} from '../preferences';

beforeEach(() => {
  store.file = null;
  resetPreferencesForTests();
});

describe('preferences', () => {
  it('returns defaults when no file exists', async () => {
    const prefs = await loadPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips a saved preference', async () => {
    await loadPreferences();
    await savePreferences({ youtubeResolution: '720' });

    resetPreferencesForTests();
    const reloaded = await loadPreferences();
    expect(reloaded.youtubeResolution).toBe('720');
    expect(reloaded.instagramResolution).toBe('max');
  });

  it('updates the synchronous cache immediately on save', async () => {
    await loadPreferences();
    await savePreferences({ instagramResolution: '360' });
    expect(getPreferences().instagramResolution).toBe('360');
  });

  it('merges over defaults, ignoring unknown/invalid values', async () => {
    store.file = JSON.stringify({ youtubeResolution: 'ultra', instagramResolution: '480', extra: 1 });
    const prefs = await loadPreferences();
    expect(prefs.instagramResolution).toBe('480');
    expect(prefs.youtubeResolution).toBe('max'); // 'ultra' is invalid → default
  });

  it('falls back to defaults on corrupt JSON', async () => {
    store.file = '{ not valid json';
    const prefs = await loadPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });
});
