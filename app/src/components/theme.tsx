import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { palettes, type Colors, type Scheme } from '@/lib/theme';
import { settingsStore } from '@/state/stores';

interface ThemeValue {
  c: Colors;
  scheme: Scheme;
  reduced: boolean;
}

const ThemeContext = createContext<ThemeValue>({ c: palettes.light, scheme: 'light', reduced: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pref = settingsStore.use((s) => s.theme);
  const system = useColorScheme();
  const reduced = useReducedMotion();
  const scheme: Scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ c: palettes[scheme], scheme, reduced }), [scheme, reduced]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
