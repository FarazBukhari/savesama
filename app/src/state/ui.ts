import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { settingsStore, uiStore, type Dialog, type Sheet } from './stores';

export function openSheet(sheet: Sheet): void {
  uiStore.set((s) => ({ sheets: [...s.sheets, sheet] }));
}

export function replaceSheets(sheet: Sheet): void {
  uiStore.set({ sheets: [sheet] });
}

export function closeSheet(): void {
  uiStore.set((s) => ({ sheets: s.sheets.slice(0, -1) }));
}

export function closeAllSheets(): void {
  uiStore.set({ sheets: [] });
}

let snackId = 0;
export function snack(text: string, action?: { label: string; onPress: () => void }): void {
  snackId += 1;
  uiStore.set({ snack: { id: snackId, text, action } });
}

export function hideSnack(id: number): void {
  if (uiStore.get().snack?.id === id) uiStore.set({ snack: null });
}

export function confirm(dialog: Dialog): void {
  uiStore.set({ dialog });
}

export function closeDialog(): void {
  uiStore.set({ dialog: null });
}

/** Android back: topmost overlay first. Returns true when something was closed. */
export function handleBack(): boolean {
  const s = uiStore.get();
  if (s.dialog) {
    closeDialog();
    return true;
  }
  if (s.sheets.length) {
    closeSheet();
    return true;
  }
  return false;
}

// ---------- haptics (DESIGN.md §9), gated by Settings → Vibration ----------

const on = () => settingsStore.get().haptics && Platform.OS !== 'web';
let lastSuccess = 0;

export const haptic = {
  select: () => on() && Haptics.selectionAsync().catch(() => undefined),
  light: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  medium: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined),
  success: () => {
    const now = Date.now();
    if (!on() || now - lastSuccess < 1500) return;
    lastSuccess = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  error: () => on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
