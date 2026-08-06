import * as FileSystem from 'expo-file-system/legacy';

import { SourcePlatform } from '../extraction/types';

/**
 * User-selectable default download quality. `'max'` means "whatever the source
 * serves at its highest". For YouTube that can now include 1080p assembled by
 * muxing adaptive streams (with a fallback to the progressive stream if the mux
 * fails); for everything else it matches the app's pre-feature behaviour. It is
 * the default so users only opt into a cap deliberately.
 */
export type ResolutionPref = 'max' | '1080' | '720' | '480' | '360';

/** 'auto' follows the OS setting; the other two override it. */
export type ThemeMode = 'light' | 'dark' | 'auto';

/** How the Saved tab lays out. Grid is the default — you recognise a clip by its frame. */
export type LibraryView = 'grid' | 'list';

export interface Preferences {
  instagramResolution: ResolutionPref;
  threadsResolution: ResolutionPref;
  youtubeResolution: ResolutionPref;
  themeMode: ThemeMode;
  libraryView: LibraryView;
  /**
   * Last-known sign-in state per platform. A hint, not the truth: the session
   * cookie lives in the WebView and we only learn about it when a request
   * succeeds or the user signs in or out.
   */
  instagramSignedIn: boolean;
  threadsSignedIn: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  instagramResolution: 'max',
  threadsResolution: 'max',
  youtubeResolution: 'max',
  themeMode: 'auto',
  libraryView: 'grid',
  instagramSignedIn: false,
  threadsSignedIn: false,
};

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'auto'];

/** Ordered highest → lowest, for rendering the settings chooser. */
export const RESOLUTION_OPTIONS: ResolutionPref[] = ['max', '1080', '720', '480', '360'];

export function resolutionLabel(pref: ResolutionPref): string {
  switch (pref) {
    case 'max':
      return 'Max (source quality)';
    case '1080':
      return '1080p (Full HD)';
    case '720':
      return '720p (HD)';
    case '480':
      return '480p';
    case '360':
      return '360p';
  }
}

/**
 * Row sublabel for the chooser. `transcodeSupported` reflects whether this
 * platform can downscale on-device (iOS yes, Android not yet) — without it a
 * capped preference can only promise the closest available rendition.
 */
export function resolutionSublabel(pref: ResolutionPref, transcodeSupported: boolean): string {
  if (pref === 'max') return 'Always download the highest available quality';
  return transcodeSupported
    ? 'Larger videos are downscaled to fit'
    : 'Picks the closest available quality';
}

/** Target short-side resolution for a preference, or null for "max" (no cap). */
export function resolutionTargetHeight(pref: ResolutionPref): number | null {
  return pref === 'max' ? null : Number(pref);
}

/** Picks the resolution preference that applies to a given platform. */
export function resolutionForPlatform(
  prefs: Preferences,
  platform: SourcePlatform
): ResolutionPref {
  switch (platform) {
    case 'youtube':
      return prefs.youtubeResolution;
    case 'threads':
      return prefs.threadsResolution;
    case 'instagram':
      return prefs.instagramResolution;
  }
}

const PREFERENCES_FILE = `${FileSystem.documentDirectory}savesama-preferences.json`;

let cache: Preferences = DEFAULT_PREFERENCES;
/** Set once the user changes a value; a slower in-flight disk load must not clobber it. */
let dirty = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<(prefs: Preferences) => void>();

function isResolutionPref(value: unknown): value is ResolutionPref {
  return typeof value === 'string' && (RESOLUTION_OPTIONS as string[]).includes(value);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as string[]).includes(value);
}

function isLibraryView(value: unknown): value is LibraryView {
  return value === 'grid' || value === 'list';
}

/**
 * Merges an unknown parsed blob over the defaults, keeping only recognised
 * values. Forward-compatible: unknown keys are ignored, missing keys fall back.
 */
function normalize(raw: unknown): Preferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFERENCES;
  const record = raw as Record<string, unknown>;
  return {
    instagramResolution: isResolutionPref(record.instagramResolution)
      ? record.instagramResolution
      : DEFAULT_PREFERENCES.instagramResolution,
    threadsResolution: isResolutionPref(record.threadsResolution)
      ? record.threadsResolution
      : DEFAULT_PREFERENCES.threadsResolution,
    youtubeResolution: isResolutionPref(record.youtubeResolution)
      ? record.youtubeResolution
      : DEFAULT_PREFERENCES.youtubeResolution,
    themeMode: isThemeMode(record.themeMode) ? record.themeMode : DEFAULT_PREFERENCES.themeMode,
    libraryView: isLibraryView(record.libraryView)
      ? record.libraryView
      : DEFAULT_PREFERENCES.libraryView,
    instagramSignedIn: record.instagramSignedIn === true,
    threadsSignedIn: record.threadsSignedIn === true,
  };
}

/**
 * Reads preferences from disk into the in-memory cache, once — subsequent calls
 * return the same promise, so callers can `await loadPreferences()` to be sure
 * the saved values are in effect (the download path does this). Any failure
 * (missing/corrupt file) silently falls back to defaults; a save made while the
 * read is still in flight wins over the disk contents.
 */
export async function loadPreferences(): Promise<Preferences> {
  if (!loadPromise) loadPromise = readFromDisk();
  await loadPromise;
  // Return the *current* cache, not a snapshot pinned inside the first load's
  // promise — saves made since then must win.
  return cache;
}

async function readFromDisk(): Promise<void> {
  try {
    const contents = await FileSystem.readAsStringAsync(PREFERENCES_FILE);
    const fromDisk = normalize(JSON.parse(contents));
    if (!dirty) {
      cache = fromDisk;
      notify();
    }
  } catch {
    // Missing or corrupt file — keep the defaults (or any already-saved value).
  }
}

/**
 * Synchronous accessor for React snapshots. Callers that must respect the
 * persisted value (e.g. the download path) should `await loadPreferences()`.
 */
export function getPreferences(): Preferences {
  return cache;
}

/** Merges a patch into the cache, persists it, and notifies subscribers. */
export async function savePreferences(patch: Partial<Preferences>): Promise<void> {
  dirty = true;
  cache = { ...cache, ...patch };
  notify();
  try {
    await FileSystem.writeAsStringAsync(PREFERENCES_FILE, JSON.stringify(cache));
  } catch {
    // In-memory value is updated regardless; a failed write just means the
    // choice won't survive a restart. Not worth surfacing an error for.
  }
}

export function subscribePreferences(listener: (prefs: Preferences) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener(cache);
}

/** Test-only: resets the module singleton between cases. */
export function resetPreferencesForTests(): void {
  cache = DEFAULT_PREFERENCES;
  dirty = false;
  loadPromise = null;
  listeners.clear();
}
