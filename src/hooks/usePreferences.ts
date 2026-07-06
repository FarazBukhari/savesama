import { useSyncExternalStore } from 'react';

import { getPreferences, Preferences, subscribePreferences } from '../services/preferences';

/**
 * Subscribes a component to the preferences module singleton. Re-renders when
 * `savePreferences` / `loadPreferences` update the cached value.
 */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
}
