import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Banner, Button, CodeBlock, EmptyState, IconButton } from '@/components/controls';
import { Icon } from '@/components/Icon';
import { LargeTitleScreen } from '@/components/Screen';
import { useServerState } from '@/components/StatusPill';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { GUIDE } from '@/lib/copy';
import { lastSeen } from '@/lib/format';
import { hostPort } from '@/lib/pairing';
import { EDGE, radius } from '@/lib/theme';
import { useJobRows } from '@/state/rows';
import { activate, checkServer, discoverLocal, findServer, LOCAL, updateExtractor } from '@/state/servers';
import { serversStore, type SavedServer, type ServerStatus } from '@/state/stores';
import { syncJobs } from '@/state/sync';
import { canOpenTermux, openTermux } from '@/state/system';
import { openSheet, snack } from '@/state/ui';

const isLocalHost = (h: string) => h === '127.0.0.1' || h === 'localhost' || h === '::1';

export function ServerScreen() {
  const { server, status, info } = useServerState();
  const servers = serversStore.use((s) => s.servers);
  const discovered = serversStore.use((s) => s.discovered);
  const rows = useJobRows();
  const running = rows.some((r) => r.stage === 'queued' || r.stage === 'running' || r.stage === 'processing');
  const [updating, setUpdating] = useState(false);
  const [updateTimedOut, setUpdateTimedOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void serversStore.get().servers.forEach((s) => void checkServer(s, s.id === serversStore.get().activeId));
      if (!findServer(LOCAL.host, LOCAL.port)) void discoverLocal();
    }, []),
  );

  const update = async () => {
    setUpdating(true);
    setUpdateTimedOut(false);
    const r = await updateExtractor();
    setUpdating(false);
    if (r.kind === 'updated') snack(`Extractor updated to ${r.version}`);
    else if (r.kind === 'same') snack(`Already up to date (${r.version})`);
    else if (r.kind === 'timeout') setUpdateTimedOut(true);
    else snack('The server hit a problem');
  };

  const retry = async () => {
    if (server && (await checkServer(server)) === 'online') void syncJobs();
  };

  return (
    <LargeTitleScreen
      title="Server"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([retry(), discoverLocal()]);
        setRefreshing(false);
      }}
    >
      <View style={{ gap: 12 }}>
        {server ? (
          <View style={{ marginHorizontal: 8 }}>
            <StatusCard
              server={server}
              status={status ?? 'checking'}
              info={info}
              updating={updating || status === 'updating'}
              running={running}
              onUpdate={update}
              onRetry={retry}
            />
          </View>
        ) : null}
        {updateTimedOut ? (
          <Banner
            tone="err"
            icon="WarningCircle"
            title="The server didn't come back"
            body="It was updating the extractor and hasn't answered for a minute. Open Termux to check on it."
            style={{ marginHorizontal: 8 }}
          >
            {canOpenTermux ? <Button variant="text" label="Open Termux" onPress={() => void openTermux()} /> : null}
            <Button
              variant="text"
              label="Try again"
              onPress={async () => {
                setUpdateTimedOut(false);
                await retry();
              }}
            />
          </Banner>
        ) : null}
        {server && status === 'offline' ? (
          <Banner tone="info" icon="DeviceMobile" title="First time on this phone?" body="The setup guide walks through installing Termux and the server." style={{ marginHorizontal: 8 }}>
            <Button variant="text" label="Setup guide" onPress={() => router.push('/guide')} />
          </Banner>
        ) : null}
        {discovered ? (
          <Banner tone="info" icon="PlugsConnected" title="Found a server on this phone" body={`SaveSama ${discovered.version} is running at 127.0.0.1:8765 but isn't paired yet.`} style={{ marginHorizontal: 8 }}>
            <Button variant="text" label="Pair it" onPress={() => openSheet({ kind: 'restart' })} />
          </Banner>
        ) : null}
      </View>

      {servers.length ? (
        <View>
          <T role="metaStrong" color="ink2" accessibilityRole="header" style={{ paddingHorizontal: EDGE, marginTop: 24, marginBottom: 8 }}>
            Servers
          </T>
          <ServerList servers={servers} />
        </View>
      ) : (
        <View style={{ marginTop: discovered ? 32 : 96 }}>
          <EmptyState
            icon="HardDrives"
            title="No servers yet"
            body="Pair the server running on this phone or on your PC."
            action={<Button variant="tonal" label="Add a server" icon="Plus" onPress={() => openSheet({ kind: 'pair' })} />}
          />
        </View>
      )}
    </LargeTitleScreen>
  );
}

function Pill({ status }: { status: ServerStatus }) {
  const { c } = useTheme();
  const online = status === 'online';
  const label = status === 'checking' ? 'Checking' : status === 'updating' ? 'Updating' : online || status === 'unauthorized' ? 'Online' : 'Offline';
  return (
    <View style={{ height: 32, borderRadius: radius.pill, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: online ? c.okSoft : c.sunk }}>
      {status === 'checking' || status === 'updating' ? (
        <ActivityIndicator size={12} color={c.ink} />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? c.ok : c.ink3 }} />
      )}
      <T role="metaStrong">{label}</T>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <T role="meta" color="ink2">
        {label}
      </T>
      <T role="metaStrong" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

function Rule() {
  const { c } = useTheme();
  return <View style={{ height: 2, backgroundColor: c.ground }} />;
}

function StatusCard({
  server,
  status,
  info,
  updating,
  running,
  onUpdate,
  onRetry,
}: {
  server: SavedServer;
  status: ServerStatus;
  info: ReturnType<typeof useServerState>['info'];
  updating: boolean;
  running: boolean;
  onUpdate: () => void;
  onRetry: () => void;
}) {
  const { c } = useTheme();
  const offline = status === 'offline';
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T role="headline" numberOfLines={2} style={{ flex: 1 }}>
          {server.name}
        </T>
        <Pill status={updating ? 'updating' : status} />
      </View>
      {status === 'unauthorized' ? (
        <Banner tone="warn" icon="Lock" title="This server doesn't accept SaveSama's key any more" body="It may have been reset. Pair again to keep using it." style={{ marginTop: 8 }}>
          <Button variant="text" label="Pair again" onPress={() => openSheet({ kind: 'pair' })} />
        </Banner>
      ) : null}
      {offline ? (
        <Banner tone="err" icon="Plugs" title="Server isn't answering" style={{ marginTop: 8 }} body={<OfflineSteps />}>
          {canOpenTermux ? <Button variant="text" label="Open Termux" onPress={() => void openTermux()} /> : null}
          <Button variant="text" label="Try again" onPress={onRetry} />
        </Banner>
      ) : null}
      <View style={{ marginTop: 8 }}>
        <InfoRow label="Address" value={hostPort(server.host, server.port)} />
        {offline ? (
          server.lastSeen ? (
            <>
              <Rule />
              <InfoRow label="Last seen" value={lastSeen(server.lastSeen)} />
            </>
          ) : null
        ) : info ? (
          <>
            <Rule />
            <InfoRow label="Extractor" value={`yt-dlp ${info.extractor_version}`} />
            <Rule />
            <InfoRow label="ffmpeg" value={info.ffmpeg ? 'Ready' : 'Missing'} />
            <Rule />
            <InfoRow label="Server" value={`SaveSama ${info.version} · API ${info.api}`} />
          </>
        ) : null}
      </View>
      {info && !info.ffmpeg && !offline ? (
        <Banner
          tone="warn"
          icon="WarningCircle"
          title="ffmpeg is missing"
          body="Without it, some videos save without sound and audio-only saves fail. In Termux run: pkg install ffmpeg"
        >
          <View style={{ marginLeft: 12, marginTop: 4, flex: 1 }}>
            <CodeBlock code={GUIDE.ffmpeg} />
          </View>
        </Banner>
      ) : null}
      {!offline ? (
        <View style={{ gap: 4, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Button
              variant="tonal"
              icon="ArrowsClockwise"
              label="Update extractor"
              loading={updating}
              loadingLabel="Updating…"
              disabled={running || status !== 'online'}
              onPress={onUpdate}
            />
            <Button variant="text" label="Setup guide" onPress={() => router.push('/guide')} />
          </View>
          {running ? (
            <T role="meta" color="ink2">
              Finish or cancel running downloads first.
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function OfflineSteps() {
  const steps = ['Open Termux.', 'Run savesama.', 'Come back here. SaveSama checks again by itself.'];
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      {steps.map((s, i) => (
        <View key={s} style={{ flexDirection: 'row', gap: 8 }}>
          <T role="meta" style={{ width: 16 }}>{`${i + 1}.`}</T>
          <T role="meta" style={{ flex: 1 }}>
            {s}
          </T>
        </View>
      ))}
    </View>
  );
}

function ServerList({ servers }: { servers: SavedServer[] }) {
  const { c } = useTheme();
  const activeId = serversStore.use((s) => s.activeId);
  const statuses = serversStore.use((s) => s.status);
  return (
    <View style={{ marginHorizontal: 8, borderRadius: radius.lg, overflow: 'hidden', gap: 2, backgroundColor: c.ground }}>
      {servers.map((s) => {
        const on = s.id === activeId;
        const st = statuses[s.id];
        const stLabel = st === 'online' || st === 'unauthorized' ? 'Online' : st === 'offline' ? 'Offline' : 'Checking';
        return (
          <Pressable
            key={s.id}
            onPress={() => activate(s.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${s.name}, ${stLabel}`}
            android_ripple={{ color: c.ripple }}
            style={({ pressed }) => ({ backgroundColor: pressed ? c.pressed : c.surface, minHeight: 64, paddingLeft: 12, paddingRight: 4, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 16 })}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? c.ink : c.ink2, alignItems: 'center', justifyContent: 'center' }}>
              {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.ink }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <T role="body" numberOfLines={1}>
                {s.name}
              </T>
              <T role="meta" color="ink2" numberOfLines={1}>
                {hostPort(s.host, s.port) + (isLocalHost(s.host) ? ' · This phone' : '')}
              </T>
            </View>
            <T role="meta" color={stLabel === 'Online' ? 'ok' : 'ink2'}>
              {stLabel}
            </T>
            <IconButton name="DotsThreeVertical" label={`More options for ${s.name}`} onPress={() => openSheet({ kind: 'serverMenu', id: s.id })} />
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => openSheet({ kind: 'pair' })}
        accessibilityRole="button"
        android_ripple={{ color: c.ripple }}
        style={({ pressed }) => ({ backgroundColor: pressed ? c.pressed : c.surface, minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 16 })}
      >
        <Icon name="Plus" />
        <T role="body">Add a server</T>
      </Pressable>
    </View>
  );
}
