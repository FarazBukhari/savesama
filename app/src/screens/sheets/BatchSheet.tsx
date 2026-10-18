import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Button, Chip, Segmented, Thumb } from '@/components/controls';
import { Icon } from '@/components/Icon';
import { Sheet, useSheet } from '@/components/Sheet';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import type { Mode, Resolved } from '@/lib/api';
import { shortError } from '@/lib/copy';
import { displayLink, parseLink } from '@/lib/links';
import { qualityLabel, type Quality } from '@/lib/quality';
import { EDGE } from '@/lib/theme';
import { findSavedLink } from '@/state/history';
import { resolveLink } from '@/state/resolve';
import { settingsStore, uiStore } from '@/state/stores';
import { startJobs } from '@/state/sync';
import { haptic, openSheet, snack } from '@/state/ui';

import { postMeta } from '@/lib/preview';

type RowState = { kind: 'loading' } | { kind: 'ok'; data: Resolved } | { kind: 'error'; text: string };

const BATCH_QUALITIES: Quality[] = ['max', 1080, 720, 480, 360];

export function BatchSheet({ urls, onClose }: { urls: string[]; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label={`Save ${urls.length} links`} footer={<BatchFooter urls={urls} />}>
      <BatchBody urls={urls} />
    </Sheet>
  );
}

const rowsStore: { listeners: Set<() => void>; rows: Record<string, RowState> } = { listeners: new Set(), rows: {} };
function setRow(url: string, st: RowState) {
  rowsStore.rows = { ...rowsStore.rows, [url]: st };
  rowsStore.listeners.forEach((l) => l());
}
function useRows(): Record<string, RowState> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    rowsStore.listeners.add(l);
    return () => {
      rowsStore.listeners.delete(l);
    };
  }, []);
  return rowsStore.rows;
}

// The footer reads the batch-wide format/quality chosen in the body.
const batchChoice: { mode: Mode; quality: Quality } = { mode: 'media', quality: 'max' };

function BatchBody({ urls }: { urls: string[] }) {
  const { close } = useSheet();
  const rows = useRows();
  const [mode, setMode] = useState<Mode>(settingsStore.get().defaultMode);
  const [quality, setQuality] = useState<Quality>('max');
  useEffect(() => {
    batchChoice.mode = mode;
    batchChoice.quality = quality;
  }, [mode, quality]);
  const warn = settingsStore.use((s) => s.warnDuplicate);

  useEffect(() => {
    rowsStore.rows = {};
    uiStore.set({ batchEdits: {} });
    let i = 0;
    const next = (): Promise<void> | undefined => {
      const url = urls[i++];
      if (!url) return;
      setRow(url, { kind: 'loading' });
      return resolveLink(url)
        .then((data) => setRow(url, data.items?.length ? { kind: 'ok', data } : { kind: 'error', text: 'Nothing to save here' }))
        .catch((e) => setRow(url, { kind: 'error', text: shortError(e) }))
        .then(next);
    };
    urls.forEach((u) => setRow(u, { kind: 'loading' }));
    void Promise.all([next(), next(), next()]);
  }, [urls]);

  return (
    <View style={{ paddingBottom: 8 }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: EDGE, paddingRight: 8 }}>
        <T role="title" style={{ flex: 1 }} accessibilityRole="header">
          {`Save ${urls.length} links`}
        </T>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="X" />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: EDGE, gap: 8 }}>
        <T role="metaStrong" color="ink2">
          Format
        </T>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'media', label: 'Video' },
            { value: 'audio', label: 'Audio only' },
          ]}
        />
      </View>
      {mode === 'media' ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          <T role="metaStrong" color="ink2" style={{ paddingHorizontal: EDGE }}>
            Quality
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: EDGE, gap: 8, paddingVertical: 6 }}>
            {BATCH_QUALITIES.map((q) => (
              <Chip key={String(q)} label={qualityLabel(q)} selected={quality === q} onPress={() => setQuality(q)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={{ marginTop: 16 }}>
        {urls.map((url) => (
          <BatchRow key={url} url={url} st={rows[url] ?? { kind: 'loading' }} dup={warn && !!findSavedLink(url)} />
        ))}
      </View>
    </View>
  );
}

function BatchRow({ url, st, dup }: { url: string; st: RowState; dup: boolean }) {
  const { c } = useTheme();
  const platform = parseLink(url)?.platform;
  const content = (
    <View style={{ minHeight: 64, paddingHorizontal: EDGE, paddingVertical: 10, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
      <Thumb uri={st.kind === 'ok' ? st.data.thumbnail : null} platform={platform} size={56} />
      <View style={{ flex: 1 }}>
        <T role="body" numberOfLines={1} ellipsizeMode={st.kind === 'ok' ? 'tail' : 'middle'}>
          {st.kind === 'ok' && st.data.title ? st.data.title : displayLink(url)}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {st.kind === 'loading' ? <ActivityIndicator size={12} color={c.ink2} /> : null}
          {dup && st.kind === 'ok' ? <Icon name="ClockCounterClockwise" size={16} color="warn" /> : null}
          <T role="meta" color={st.kind === 'error' ? 'err' : 'ink2'} numberOfLines={1} style={{ flex: 1 }}>
            {st.kind === 'loading' ? 'Reading…' : st.kind === 'error' ? st.text : [dup ? 'Saved before' : '', postMeta(st.data)].filter(Boolean).join(' · ')}
          </T>
        </View>
      </View>
      {st.kind === 'ok' ? <Icon name="CaretRight" size={20} color="ink2" /> : null}
    </View>
  );
  if (st.kind !== 'ok') return content;
  return (
    <Pressable onPress={() => openSheet({ kind: 'preview', url, batch: true })} android_ripple={{ color: c.ripple }} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

function BatchFooter({ urls }: { urls: string[] }) {
  const { close } = useSheet();
  const rows = useRows();
  const [busy, setBusy] = useState(false);
  const ok = urls.filter((u) => rows[u]?.kind === 'ok');
  const failed = urls.filter((u) => rows[u]?.kind === 'error').length;
  const save = async () => {
    haptic.light();
    setBusy(true);
    const edits = uiStore.get().batchEdits;
    let started = 0;
    for (const url of ok) {
      const e = edits[url];
      try {
        const jobs = await startJobs({
          url,
          items: e?.items ?? null,
          mode: e?.mode ?? batchChoice.mode,
          quality: e?.quality ?? (batchChoice.mode === 'media' ? batchChoice.quality : 'max'),
        });
        started += jobs.length;
      } catch {
        // counted as skipped below
      }
    }
    setBusy(false);
    if (started) uiStore.set({ fieldText: '' });
    close();
    snack(`Saving ${started} ${started === 1 ? 'item' : 'items'}`, { label: 'View', onPress: () => router.navigate('/activity') });
  };
  return (
    <View style={{ gap: 8 }}>
      {failed ? (
        <T role="meta" color="ink2">
          {`${failed} ${failed === 1 ? 'link' : 'links'} couldn't be read and will be skipped.`}
        </T>
      ) : null}
      <Button
        label={ok.length ? `Save ${ok.length} ${ok.length === 1 ? 'link' : 'links'}` : 'Select something to save'}
        rec
        big
        full
        disabled={ok.length === 0}
        loading={busy}
        loadingLabel="Starting…"
        onPress={save}
      />
    </View>
  );
}
