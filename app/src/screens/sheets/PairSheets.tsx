import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Banner, Button, CodeBlock, ListGroup, ListRow } from '@/components/controls';
import { Icon } from '@/components/Icon';
import { Sheet, useSheet } from '@/components/Sheet';
import { T } from '@/components/Text';
import { pairErrorCopy, GUIDE } from '@/lib/copy';
import { hostPort, type PairInfo } from '@/lib/pairing';
import { EDGE } from '@/lib/theme';
import { pairServer } from '@/state/servers';
import { serversStore } from '@/state/stores';
import { canOpenTermux, openTermux } from '@/state/system';

function Header({ title }: { title: string }) {
  const { close } = useSheet();
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: EDGE, paddingRight: 8 }}>
      <T role="title" style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </T>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="X" />
      </Pressable>
    </View>
  );
}

/** "Add a server": scan, enter details, or set up Termux on this phone. */
export function PairSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Add a server">
      <PairOptions />
    </Sheet>
  );
}

function PairOptions() {
  const { close } = useSheet();
  const go = (href: '/scan' | '/pair-manual' | '/guide') => {
    close();
    router.push(href);
  };
  return (
    <View style={{ paddingBottom: 8 }}>
      <Header title="Add a server" />
      <ListGroup>
        <ListRow icon="QrCode" title="Scan a QR code" subtitle="Point the camera at the code the server prints." onPress={() => go('/scan')} chevron />
        <ListRow icon="Keyboard" title="Enter details" subtitle="Type the address and key by hand." onPress={() => go('/pair-manual')} chevron />
        <ListRow icon="DeviceMobile" title="Server on this phone" subtitle="Set it up in Termux, step by step." onPress={() => go('/guide')} chevron />
      </ListGroup>
    </View>
  );
}

/** Deep link / QR confirmation: "Pair with {name}?" */
export function PairConfirmSheet({ info, onClose }: { info: PairInfo; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Pair">
      <PairConfirm info={info} />
    </Sheet>
  );
}

function PairConfirm({ info }: { info: PairInfo }) {
  const { close } = useSheet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hp = hostPort(info.host, info.port);
  const pair = async () => {
    setBusy(true);
    setError(null);
    try {
      await pairServer(info);
      close();
    } catch (e) {
      setBusy(false);
      setError(pairErrorCopy(e, hp));
    }
  };
  return (
    <View style={{ paddingHorizontal: EDGE, paddingTop: 8, gap: 8 }}>
      <Icon name="PlugsConnected" size={32} color="ink2" />
      <T role="headline" style={{ marginTop: 4 }}>{`Pair with ${info.name ?? hp}?`}</T>
      <T role="meta" color="ink2">
        {hp}
      </T>
      {error ? <Banner tone="err" icon="WarningCircle" title={error} style={{ marginTop: 8, marginHorizontal: -12 }} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16, alignItems: 'center' }}>
        <Button variant="text" label="Cancel" onPress={close} />
        <Button label="Pair" loading={busy} loadingLabel="Checking…" onPress={pair} />
      </View>
    </View>
  );
}

/** Found an unpaired server on 127.0.0.1: ask Termux to send the pairing link again. */
export function RestartSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Found a server on this phone">
      <RestartBody />
    </Sheet>
  );
}

export function FoundInstructions({ version }: { version?: string }) {
  return (
    <View style={{ gap: 12 }}>
      <Banner
        tone="ok"
        icon="PlugsConnected"
        title={`Found SaveSama ${version ?? ''} on this phone`.replace('  ', ' ')}
        body="In Termux, run the command below. It opens this app and pairs by itself."
      >
        <View style={{ marginLeft: 12, marginTop: 8, flex: 1 }}>
          <CodeBlock code={GUIDE.pair} fill="surface" />
        </View>
      </Banner>
    </View>
  );
}

function RestartBody() {
  const found = serversStore.use((s) => s.discovered);
  return (
    <View style={{ paddingBottom: 8 }}>
      <Header title="Found a server on this phone" />
      <View style={{ paddingHorizontal: 8, gap: 12 }}>
        <FoundInstructions version={found?.version} />
        {canOpenTermux ? <Button variant="tonal" label="Open Termux" icon="Terminal" onPress={() => void openTermux()} style={{ marginLeft: 12 }} /> : null}
      </View>
    </View>
  );
}
