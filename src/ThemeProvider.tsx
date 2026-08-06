import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferences } from './hooks/usePreferences';
import { loadPreferences } from './services/preferences';
import { Theme, darkTheme, lightTheme } from './theme';

const ThemeContext = createContext<Theme>(darkTheme);

/**
 * Resolves the active theme from the saved preference, falling back to the OS
 * setting when the user has left it on 'auto'. `useColorScheme()` returns null
 * before the platform reports a value, which we read as dark — Foxy's native
 * state — rather than flashing light and then correcting.
 *
 * Nothing renders until the saved preferences are on disk-read. Without that
 * gate the whole app paints with the defaults and then snaps: a user on 'light'
 * would see a dark frame first, and Saved would mount as a grid before jumping
 * to their saved list view.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeMode } = usePreferences();
  const systemScheme = useColorScheme();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPreferences().finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const theme = useMemo(() => {
    const resolved = themeMode === 'auto' ? (systemScheme ?? 'dark') : themeMode;
    return resolved === 'light' ? lightTheme : darkTheme;
  }, [themeMode, systemScheme]);

  if (!loaded) return null;

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds a StyleSheet from the active theme and memoises it, so a re-render
 * doesn't rebuild every style object — only a theme change does.
 *
 *   const styles = useThemedStyles(makeStyles);
 *
 * `makeStyles` must be defined at module scope, not inside the component, or
 * the identity changes every render and the memo never hits.
 */
export function useThemedStyles<T>(makeStyles: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => makeStyles(theme), [makeStyles, theme]);
}
