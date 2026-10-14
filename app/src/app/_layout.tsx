import { Michroma_400Regular } from '@expo-google-fonts/michroma/400Regular';
import { SchibstedGrotesk_400Regular } from '@expo-google-fonts/schibsted-grotesk/400Regular';
import { SchibstedGrotesk_500Medium } from '@expo-google-fonts/schibsted-grotesk/500Medium';
import { SchibstedGrotesk_600SemiBold } from '@expo-google-fonts/schibsted-grotesk/600SemiBold';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Overlays } from '@/components/Overlays';
import { ThemeProvider, useTheme } from '@/components/theme';
import { getToken } from '@/state/persist';
import { intakeText, useAppLifecycle } from '@/state/lifecycle';
import { hydrate, serversStore, settingsStore } from '@/state/stores';
import '@/state/sync';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Michroma_400Regular,
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
  });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    hydrate(getToken)
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);
  const ready = (fontsLoaded || !!fontError) && hydrated;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>{ready ? <App /> : null}</ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  const { c, scheme } = useTheme();
  const pathname = usePathname();
  useAppLifecycle(true);
  useShareIntake();
  useOnboardingGate();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.ground).catch(() => undefined);
  }, [c.ground]);

  // The deck is yellow in both themes, so status bar icons stay dark on Grab and onboarding.
  const onDeck = pathname === '/' || pathname === '/onboarding';
  const viewer = pathname.startsWith('/viewer') || pathname === '/scan';
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <StatusBar style={viewer ? 'light' : onDeck ? 'dark' : scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground }, animation: 'fade' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="viewer" options={{ animation: 'fade', contentStyle: { backgroundColor: c.viewerBg } }} />
        <Stack.Screen name="scan" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="pair-manual" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="guide" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="licences" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pair" options={{ animation: 'none' }} />
      </Stack>
      <Overlays />
    </View>
  );
}

function useShareIntake() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ disabled: Platform.OS === 'web', resetOnBackground: true });
  useEffect(() => {
    if (!hasShareIntent) return;
    const text = [shareIntent.webUrl, shareIntent.text].filter(Boolean).join('\n');
    if (text) {
      router.navigate('/');
      intakeText(text);
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}

function useOnboardingGate() {
  const onboarded = settingsStore.use((s) => s.onboarded);
  const hasServers = serversStore.use((s) => s.servers.length > 0);
  const pathname = usePathname();
  useEffect(() => {
    if (!onboarded && !hasServers && pathname !== '/onboarding' && !pathname.startsWith('/pair') && pathname !== '/guide' && pathname !== '/scan') {
      router.replace('/onboarding');
    }
  }, [onboarded, hasServers, pathname]);
}
