import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import { FDROID_TERMUX } from '@/lib/copy';

export const canOpenTermux = Platform.OS === 'android';

/** Launches Termux; when it isn't installed, opens its F-Droid page instead. */
export async function openTermux(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.openApplication('com.termux');
  } catch {
    await Linking.openURL(FDROID_TERMUX).catch(() => undefined);
  }
}
