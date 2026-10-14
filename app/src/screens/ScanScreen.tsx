import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState } from '@/components/controls';
import { SmallBar } from '@/components/Screen';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { parsePairLink } from '@/lib/pairing';
import { EDGE } from '@/lib/theme';
import { openSheet, snack } from '@/state/ui';

const back = () => (router.canGoBack() ? router.back() : router.replace('/server'));

function Corners() {
  const arm = 36;
  const s = { position: 'absolute' as const, width: arm, height: arm, borderColor: '#FFFFFF' };
  return (
    <View style={{ width: 240, height: 240 }}>
      <View style={[s, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 20 }]} />
      <View style={[s, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 20 }]} />
      <View style={[s, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 20 }]} />
      <View style={[s, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 20 }]} />
    </View>
  );
}

export function ScanScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const handled = useRef(false);
  const lastBad = useRef('');

  if (permission && !permission.granted && permission.status !== 'undetermined') {
    return (
      <View style={{ flex: 1, backgroundColor: c.ground }}>
        <SmallBar title="Scan the pairing code" onBack={back} />
        <View style={{ marginTop: 96 }}>
          <EmptyState
            icon="Camera"
            title="Camera access is off"
            body="Allow it to scan the pairing code, or type the details instead."
            action={
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  variant="tonal"
                  label="Allow camera"
                  onPress={() => (permission.canAskAgain ? void request() : void Linking.openSettings())}
                />
                <Button variant="text" label="Enter details" onPress={() => router.replace('/pair-manual')} />
              </View>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (handled.current) return;
            const info = parsePairLink(data);
            if (!info) {
              if (lastBad.current !== data) {
                lastBad.current = data;
                snack("That isn't a SaveSama pairing code.");
              }
              return;
            }
            handled.current = true;
            back();
            openSheet({ kind: 'pairConfirm', info });
          }}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <Corners />
        <T role="body" color="mediaInk" style={{ textAlign: 'center', marginTop: 24, paddingHorizontal: EDGE + 20, maxWidth: 360 }}>
          Run savesama on your PC or in Termux. The code appears in the terminal.
        </T>
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: c.mediaScrim }}>
        <SmallBar title="Scan the pairing code" onBack={back} tint="#FFFFFF" />
      </View>
      <View style={{ position: 'absolute', bottom: insets.bottom + 24, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ backgroundColor: c.mediaScrim, borderRadius: 999 }}>
          <Button variant="text" ink="mediaInk" label="Enter details instead" onPress={() => router.replace('/pair-manual')} />
        </View>
      </View>
      {!permission || permission.status === 'undetermined' ? <PermissionAsk request={request} /> : null}
    </View>
  );
}

function PermissionAsk({ request }: { request: () => Promise<unknown> }) {
  // First open: ask once; the screen re-renders with the answer.
  useEffect(() => {
    void request();
  }, [request]);
  return null;
}
