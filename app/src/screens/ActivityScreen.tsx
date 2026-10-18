import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Banner, Button, EmptyState, GroupLabel } from '@/components/controls';
import { JobRow } from '@/components/JobRow';
import { LargeTitleScreen } from '@/components/Screen';
import { useServerState } from '@/components/StatusPill';
import { useTheme } from '@/components/theme';
import { galleryAccess } from '@/state/gallery';
import { useJobRows, type JobRowModel } from '@/state/rows';
import { checkServer } from '@/state/servers';
import { cancelJob, clearFinished, retryJob, retryPermissionBlocked, syncJobs } from '@/state/sync';
import { canOpenTermux, openTermux } from '@/state/system';
import { libraryStore, loadLibrary } from '@/state/library';

export function ActivityScreen() {
  const { reduced } = useTheme();
  const rows = useJobRows();
  const { server, status } = useServerState();
  const [refreshing, setRefreshing] = useState(false);
  const progress = rows.filter((r) => r.section === 'progress');
  const failed = rows.filter((r) => r.section === 'failed');
  const done = rows.filter((r) => r.section === 'done').sort((a, b) => b.sortAt - a.sortAt);
  const permissionBlocked = failed.some((r) => r.errorCode === 'transfer:permission');
  const storageFull = failed.some((r) => r.errorCode === 'transfer:storage');

  const open = (r: JobRowModel) => {
    const key = r.save?.assetId ?? `job:${r.jobId}`;
    void loadLibrary().then(() => {
      if (libraryStore.get().items.some((i) => i.key === key)) router.push({ pathname: '/viewer', params: { key } });
    });
  };

  const renderSection = (title: string, list: JobRowModel[]) =>
    list.length ? (
      <View>
        <GroupLabel title={title} />
        <View style={{ marginHorizontal: 8, borderRadius: 20, overflow: 'hidden', gap: 2 }}>
          {list.map((r) => (
            <Animated.View key={r.key} layout={reduced ? undefined : LinearTransition.duration(240)}>
              <JobRow
                row={r}
                onCancel={() => void cancelJob(r.jobId, () => void retryJob(r.jobId))}
                onRetry={() => void retryJob(r.jobId)}
                onOpen={() => open(r)}
              />
            </Animated.View>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <LargeTitleScreen
      title="Activity"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await syncJobs();
        setRefreshing(false);
      }}
      trailing={failed.length || done.length ? <Button variant="text" label="Clear finished" onPress={clearFinished} /> : null}
    >
      <View style={{ gap: 8, marginHorizontal: 8 }}>
        {server && status === 'offline' ? (
          <Banner tone="err" icon="Plugs" title="Server isn't answering" body="Open Termux and run savesama, then come back. SaveSama checks again by itself.">
            {canOpenTermux ? <Button variant="text" label="Open Termux" onPress={() => void openTermux()} /> : null}
            <Button
              variant="text"
              label="Try again"
              onPress={async () => {
                if ((await checkServer(server)) === 'online') void syncJobs();
              }}
            />
          </Banner>
        ) : null}
        {permissionBlocked ? (
          <Banner tone="warn" icon="ImageSquare" title="Gallery access is off" body="Allow it so finished files can move into your gallery.">
            <Button
              variant="text"
              label="Allow access"
              onPress={async () => {
                const a = await galleryAccess(true);
                if (a === 'granted' || a === 'limited') retryPermissionBlocked();
              }}
            />
          </Banner>
        ) : null}
        {storageFull ? <Banner tone="err" icon="WarningCircle" title="Your phone is out of space" body="Free up some space, then retry the failed transfers." /> : null}
      </View>
      {renderSection('In progress', progress)}
      {renderSection('Failed', failed)}
      {renderSection('Done', done)}
      {!rows.length ? (
        <View style={{ marginTop: 120 }}>
          <EmptyState
            icon="Pulse"
            title="Nothing saving"
            body="Links you save show up here while your server works on them."
            action={<Button variant="tonal" label="Grab a link" onPress={() => router.navigate('/')} />}
          />
        </View>
      ) : null}
    </LargeTitleScreen>
  );
}
