import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, ListGroup, ListRow } from '@/components/controls';
import { Icon, PLATFORM_ICON } from '@/components/Icon';
import { TapeLine } from '@/components/TapeLine';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import type { Tape } from '@/lib/jobState';
import { PLATFORM_NAMES, PLATFORMS } from '@/lib/links';
import { EDGE, fonts } from '@/lib/theme';
import { galleryAccess } from '@/state/gallery';
import { discoverLocal } from '@/state/servers';
import { activeServer, serversStore, settingsStore } from '@/state/stores';
import { canOpenTermux, openTermux } from '@/state/system';

import { FoundInstructions } from './sheets/PairSheets';

const LEGEND: [string, string, string] = ['Welcome', 'Server', 'Gallery'];

function tape(step: number): Tape {
  const spans: [number, number, number] = step === 0 ? [1, 0, 0] : step === 1 ? [1, 0.5, 0] : [1, 1, 0.5];
  return { spans, current: step, breathing: -1, failed: false, cancelled: false, value: Math.round((spans[0] + spans[1] + spans[2]) * 33) };
}

const finish = () => {
  settingsStore.set({ onboarded: true });
  router.replace('/');
};

export function OnboardingScreen() {
  const paired = serversStore.use((s) => s.servers.length > 0);
  const [step, setStep] = useState(paired ? 2 : 0);
  useEffect(() => {
    if (paired && step === 1) setStep(2);
  }, [paired, step]);
  if (step === 0) return <Welcome onNext={() => setStep(paired ? 2 : 1)} />;
  if (step === 1) return <ServerStep />;
  return <GalleryStep />;
}

function Welcome({ onNext }: { onNext: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: c.deck, paddingTop: insets.top + 56, paddingHorizontal: EDGE, paddingBottom: 28, minHeight: 360 + insets.top, justifyContent: 'space-between' }}>
          <T role="display" color="onDeck" style={{ fontSize: 34, lineHeight: 40 }} accessibilityRole="header">
            SaveSama
          </T>
          <T role="headline" color="onDeck" style={{ fontSize: 30, lineHeight: 36, maxWidth: 330, fontFamily: fonts.bold, marginTop: 32 }}>
            Save posts to your phone, without an account
          </T>
        </View>
        <View style={{ paddingHorizontal: EDGE, paddingTop: 20, gap: 24 }}>
          <TapeLine tape={tape(0)} text="Step 1 of 3" labels={LEGEND} equal />
          <T role="body" color="ink2" style={{ fontSize: 17, lineHeight: 24 }}>
            Video, photos and audio at the best quality each app offers. No ads, no cloud, nothing to sign in to.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
            {PLATFORMS.map((p) => (
              <View key={p} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name={PLATFORM_ICON[p]} />
                <T role="bodyStrong" style={{ fontFamily: fonts.regular, fontSize: 17 }}>
                  {PLATFORM_NAMES[p]}
                </T>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: EDGE, paddingBottom: insets.bottom + 16, paddingTop: 12 }}>
        <Button label="Get started" big full onPress={onNext} />
      </View>
    </View>
  );
}

function ServerStep() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [probe, setProbe] = useState<'checking' | 'found' | 'none'>('checking');
  const found = serversStore.use((s) => s.discovered);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const info = await discoverLocal();
      if (alive) setProbe(info ? 'found' : 'none');
    };
    void run();
    timer.current = setInterval(run, 3000);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const go = (href: '/guide' | '/scan' | '/pair-manual') => router.push(href);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingTop: 32, paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: EDGE, gap: 20 }}>
          <TapeLine tape={tape(1)} text="Step 2 of 3" labels={LEGEND} equal />
          <T role="headline" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, marginTop: 16 }}>
            SaveSama works with a server you run
          </T>
          <T role="body" color="ink2" style={{ fontSize: 17 }}>
            The server does the downloading. It runs in Termux on this phone, or on your PC. Your files never pass through anyone else.
          </T>
        </View>
        <View style={{ marginTop: 24 }}>
          {probe === 'checking' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: EDGE }}>
              <ActivityIndicator size={16} color={c.ink2} />
              <T role="body" color="ink2">
                Looking for a server on this phone…
              </T>
            </View>
          ) : probe === 'found' && found ? (
            <Animated.View entering={FadeIn.duration(240)} style={{ paddingHorizontal: EDGE, gap: 16 }}>
              <FoundInstructions version={found.version} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size={12} color={c.ink2} />
                <T role="meta" color="ink2">
                  Waiting for the pairing link…
                </T>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(240)}>
              <ListGroup>
                <ListRow icon="DeviceMobile" title="Set up on this phone" subtitle="Install Termux and the SaveSama server, step by step." onPress={() => go('/guide')} chevron />
                <ListRow icon="QrCode" title="Scan a QR code" subtitle="For a server on your PC." onPress={() => go('/scan')} chevron />
                <ListRow icon="Keyboard" title="Enter details" subtitle="Type the address and key by hand." onPress={() => go('/pair-manual')} chevron />
              </ListGroup>
            </Animated.View>
          )}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: EDGE, paddingBottom: insets.bottom + 8, paddingTop: 12, alignItems: 'center', gap: 4 }}>
        {probe === 'found' && canOpenTermux ? <Button variant="tonal" icon="ArrowSquareOut" label="Open Termux" big full onPress={() => void openTermux()} /> : null}
        <Button variant="text" label="Do this later" onPress={finish} />
      </View>
    </View>
  );
}

function GalleryStep() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const server = activeServer();
  const [denied, setDenied] = useState(false);
  const allow = async () => {
    const a = await galleryAccess(true);
    if (a === 'granted' || a === 'limited') finish();
    else setDenied(true);
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingTop: 32, paddingHorizontal: EDGE, gap: 20 }}>
        <TapeLine tape={tape(2)} text="Step 3 of 3" labels={LEGEND} equal />
        {server ? <Banner tone="ok" icon="CheckCircle" title={`Paired with ${server.name}`} style={{ marginHorizontal: -12, marginTop: 8 }} /> : null}
        <T role="headline" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34 }}>
          One last thing
        </T>
        <T role="body" color="ink2" style={{ fontSize: 17 }} accessibilityLiveRegion="polite">
          {denied
            ? 'Without access, files can’t reach your gallery. You can allow it later from the Library.'
            : 'SaveSama puts what you save in a SaveSama album in your gallery. Allow access to photos, videos and audio so it can.'}
        </T>
      </ScrollView>
      <View style={{ paddingHorizontal: EDGE, paddingBottom: insets.bottom + 8, paddingTop: 12, alignItems: 'center', gap: 4 }}>
        {denied ? (
          <Button label="Continue" big full onPress={finish} />
        ) : (
          <>
            <Button label="Allow access" big full onPress={allow} />
            <Button variant="text" label="Continue" onPress={finish} />
          </>
        )}
        {denied ? <Button variant="text" label="Open settings" onPress={() => void Linking.openSettings()} /> : null}
      </View>
    </View>
  );
}
