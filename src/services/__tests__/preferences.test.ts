const store: { file: string | null; readGate: Promise<void> | null } = {
  file: null,
  readGate: null,
};

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  readAsStringAsync: jest.fn(async () => {
    // Snapshot at call time so a gated (slow) read resolves with the contents
    // as they were when the read started — like a real disk read would.
    const contents = store.file;
    if (store.readGate) await store.readGate;
    if (contents === null) throw new Error('no file');
    return contents;
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
  resolutionForPlatform,
  savePreferences,
} from '../preferences';

beforeEach(() => {
  store.file = null;
  store.readGate = null;
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
    store.file = JSON.stringify({
      youtubeResolution: 'ultra',
      instagramResolution: '480',
      threadsResolution: '720',
      extra: 1,
    });
    const prefs = await loadPreferences();
    expect(prefs.instagramResolution).toBe('480');
    expect(prefs.threadsResolution).toBe('720');
    expect(prefs.youtubeResolution).toBe('max'); // 'ultra' is invalid → default
  });

  it('falls back to defaults on corrupt JSON', async () => {
    store.file = '{ not valid json';
    const prefs = await loadPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it('loads once: repeated calls return the cached result without re-reading disk', async () => {
    store.file = JSON.stringify({ youtubeResolution: '480' });
    await loadPreferences();
    await savePreferences({ youtubeResolution: '1080' });

    // A later loadPreferences (e.g. from the download path) must not re-read
    // the stale file over the fresh in-memory value.
    const again = await loadPreferences();
    expect(again.youtubeResolution).toBe('1080');
  });

  it('does not clobber a save that lands while the initial disk read is in flight', async () => {
    store.file = JSON.stringify({ instagramResolution: '360' });
    let openGate!: () => void;
    store.readGate = new Promise((resolve) => {
      openGate = resolve;
    });

    const loading = loadPreferences(); // read is now blocked on the gate
    await savePreferences({ instagramResolution: '1080' });
    openGate();
    const loaded = await loading;

    expect(loaded.instagramResolution).toBe('1080');
    expect(getPreferences().instagramResolution).toBe('1080');
  });
});

describe('resolutionForPlatform', () => {
  it('gives each platform its own preference', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      instagramResolution: '480' as const,
      threadsResolution: '720' as const,
      youtubeResolution: '1080' as const,
    };
    expect(resolutionForPlatform(prefs, 'instagram')).toBe('480');
    // Threads must not silently inherit the Instagram cap.
    expect(resolutionForPlatform(prefs, 'threads')).toBe('720');
    expect(resolutionForPlatform(prefs, 'youtube')).toBe('1080');
  });
});
