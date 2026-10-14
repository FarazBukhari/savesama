import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CodeBlock } from '@/components/controls';
import { SmallBar } from '@/components/Screen';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { GUIDE } from '@/lib/copy';
import { EDGE } from '@/lib/theme';
import { canOpenTermux, openTermux } from '@/state/system';

const back = () => (router.canGoBack() ? router.back() : router.replace('/server'));

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 14 }} accessibilityLabel={`Step ${n}`}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.select, alignItems: 'center', justifyContent: 'center' }}>
        <T role="metaStrong" color="onSelect">
          {String(n)}
        </T>
      </View>
      <View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
        <T role="bodyStrong" accessibilityRole="header">
          {title}
        </T>
        {children}
      </View>
    </View>
  );
}

export function GuideScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <SmallBar title="Set up on this phone" onBack={back} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: EDGE, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 28 }}>
        <T role="body" color="ink2">
          About five minutes, once. After that SaveSama starts saving whenever the server is running.
        </T>
        <Step n={1} title="Install Termux">
          <T role="meta" color="ink2">
            {"Get it from F-Droid. The Play Store version is outdated and won't work."}
          </T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="tonal" icon="ArrowSquareOut" label="Open F-Droid" onPress={() => void Linking.openURL('https://f-droid.org/packages/com.termux/')} />
            {canOpenTermux ? <Button variant="text" label="Open Termux" onPress={() => void openTermux()} /> : null}
          </View>
        </Step>
        <Step n={2} title="Install the SaveSama server">
          <T role="meta" color="ink2">
            In Termux, paste this and press Enter. It installs Python, ffmpeg and the server, and takes 3 to 10 minutes.
          </T>
          <CodeBlock code={GUIDE.installPublic} />
          <T role="meta" color="ink2">
            While the repository is private, use this instead. It signs in to GitHub once to read the code; it has nothing to do with Instagram or any other platform.
          </T>
          <CodeBlock code={GUIDE.installPrivate} />
        </Step>
        <Step n={3} title="Start it">
          <CodeBlock code={GUIDE.start} />
          <T role="meta" color="ink2">
            {"It shows a QR code and opens SaveSama to pair. Leave Termux running. If the app doesn't open, run:"}
          </T>
          <CodeBlock code={GUIDE.pair} />
        </Step>
        <Step n={4} title="Keep it awake">
          <T role="meta" color="ink2">
            {"In Android settings, set Termux's battery use to Unrestricted. In the Termux notification, tap Acquire wakelock."}
          </T>
        </Step>
        <View style={{ gap: 4 }}>
          <T role="body" color="ink2">
            Using a PC instead?
          </T>
          <View style={{ marginLeft: -12 }}>
            <Button variant="text" label="Scan its QR code" onPress={() => router.push('/scan')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
