import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tab, TabBar } from './src/components/TabBar';
import { INSTAGRAM_SESSION, THREADS_SESSION } from './src/components/webViewSession';
import { WebViewSessionResolver } from './src/components/WebViewSessionResolver';
import { DownloadScreen } from './src/screens/DownloadScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/ThemeProvider';

function Main() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  // The icon set ships its own font and loads it asynchronously. Without this
  // gate every icon renders as a blank box for the first frames.
  const [fontsLoaded] = useFonts(Feather.font);

  const [tab, setTab] = useState<Tab>('download');
  // Preferences are already on disk-read: ThemeProvider gates this subtree on
  // them, so the download path reads the saved resolution, not the default.
  // Mount the library lazily so we don't request full media-read permission at
  // launch — only once the user first opens the Saved tab. Kept mounted after
  // that to preserve scroll/state and avoid re-prompting.
  const [libraryMounted, setLibraryMounted] = useState(false);
  const [libraryRefresh, setLibraryRefresh] = useState(0);

  const refreshLibrary = useCallback(() => setLibraryRefresh((n) => n + 1), []);

  const handleTabChange = useCallback(
    (next: Tab) => {
      if (next === 'saved') {
        setLibraryMounted(true);
        refreshLibrary();
      }
      setTab(next);
    },
    [refreshLibrary]
  );

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <View style={[{ flex: 1 }, tab !== 'download' && hidden]}>
        <DownloadScreen onSaved={refreshLibrary} />
      </View>
      {libraryMounted ? (
        <View style={[{ flex: 1 }, tab !== 'saved' && hidden]}>
          <LibraryScreen refreshToken={libraryRefresh} />
        </View>
      ) : null}
      <View style={[{ flex: 1 }, tab !== 'settings' && hidden]}>
        <SettingsScreen />
      </View>

      <View style={{ backgroundColor: theme.colors.card, paddingBottom: insets.bottom }}>
        <TabBar active={tab} onChange={handleTabChange} />
      </View>
    </View>
  );
}

export default function App() {
  return (
    // Gesture Handler needs a root view above everything that uses its
    // Pressable — which, via PressableScale, is every button in the app.
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Honour the OS "reduce motion" setting for every Reanimated animation. */}
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <SafeAreaProvider>
        <ThemeProvider>
          <Main />
          <WebViewSessionResolver config={INSTAGRAM_SESSION} />
          <WebViewSessionResolver config={THREADS_SESSION} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const hidden = { display: 'none' } as const;
