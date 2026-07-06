import * as FileSystem from 'expo-file-system/legacy';

import { SourcePlatform } from '../extraction/types';

/**
 * User-selectable default download quality. `'max'` means "whatever the source
 * serves at its highest" — the app's original behaviour, kept as the default so
 * existing users see no change until they opt into a cap.
 */
export type ResolutionPref = 'max' | '1080' | '720' | '480' | '360';

export interface Preferences {
  instagramResolution: ResolutionPref;
  youtubeResolution: ResolutionPref;
}

export const DEFAULT_PREFERENCES: Preferences = {
  instagramResolution: 'max',
  youtubeResolution: 'max',
};

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

export function resolutionSublabel(pref: ResolutionPref): string {
  return pref === 'max'
    ? 'Always download the highest available quality'
    : 'Larger videos are downscaled to fit';
}

/** Target pixel height for a preference, or null for "max" (no cap). */
export function resolutionTargetHeight(pref: ResolutionPref): number | null {
  return pref === 'max' ? null : Number(pref);
}

/** Picks the resolution preference that applies to a given platform. */
export function resolutionForPlatform(
  prefs: Preferences,
  platform: SourcePlatform
): ResolutionPref {
  return platform === 'youtube' ? prefs.youtubeResolution : prefs.instagramResolution;
}

const PREFERENCES_FILE = `${FileSystem.documentDirectory}foxy-preferences.json`;

let cache: Preferences = DEFAULT_PREFERENCES;
let loaded = false;
const listeners = new Set<(prefs: Preferences) => void>();

function isResolutionPref(value: unknown): value is ResolutionPref {
  return typeof value === 'string' && (RESOLUTION_OPTIONS as string[]).includes(value);
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
    youtubeResolution: isResolutionPref(record.youtubeResolution)
      ? record.youtubeResolution
      : DEFAULT_PREFERENCES.youtubeResolution,
  };
}

/**
 * Reads preferences from disk into the in-memory cache. Called once at startup.
 * Any failure (missing/corrupt file) silently falls back to defaults — settings
 * must never block the app.
 */
export async function loadPreferences(): Promise<Preferences> {
  try {
    const info = await FileSystem.getInfoAsync(PREFERENCES_FILE);
    if (info.exists) {
      const contents = await FileSystem.readAsStringAsync(PREFERENCES_FILE);
      cache = normalize(JSON.parse(contents));
    }
  } catch {
    cache = DEFAULT_PREFERENCES;
  } finally {
    loaded = true;
  }
  notify();
  return cache;
}

/**
 * Synchronous accessor for non-React callers (e.g. the download service).
 * Returns the cached value, or defaults until `loadPreferences` has run.
 */
export function getPreferences(): Preferences {
  return cache;
}

/** True once `loadPreferences` has completed (success or fallback). */
export function preferencesLoaded(): boolean {
  return loaded;
}

/** Merges a patch into the cache, persists it, and notifies subscribers. */
export async function savePreferences(patch: Partial<Preferences>): Promise<void> {
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
  loaded = false;
  listeners.clear();
}
