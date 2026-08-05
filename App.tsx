import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner } from './src/components/AdBanner';
import { Tab, TabBar } from './src/components/TabBar';
import { INSTAGRAM_SESSION, THREADS_SESSION } from './src/components/webViewSession';
import { WebViewSessionResolver } from './src/components/WebViewSessionResolver';
import { DownloadScreen } from './src/screens/DownloadScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { colors } from './src/theme';

function Main() {
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('download');
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

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={[styles.screen, tab !== 'download' && styles.hidden]}>
        <DownloadScreen onSaved={refreshLibrary} />
      </View>
      {libraryMounted ? (
        <View style={[styles.screen, tab !== 'saved' && styles.hidden]}>
          <LibraryScreen refreshToken={libraryRefresh} />
        </View>
      ) : null}

      <AdBanner bottomInset={0} />
      <View style={[styles.tabBarInset, { paddingBottom: insets.bottom }]}>
        <TabBar active={tab} onChange={handleTabChange} />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
      <WebViewSessionResolver config={INSTAGRAM_SESSION} />
      <WebViewSessionResolver config={THREADS_SESSION} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  tabBarInset: {
    backgroundColor: colors.card,
  },
});
