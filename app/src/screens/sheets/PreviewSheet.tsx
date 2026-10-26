import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Banner, Button, Chip, ListRow, Segmented, Skeleton, SwitchMark, Thumb } from '@/components/controls';
import { Icon, PLATFORM_ICON } from '@/components/Icon';
import { Sheet, useSheet } from '@/components/Sheet';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { ApiError, type Mode, type Resolved } from '@/lib/api';
import { NO_ITEMS, NOT_PAIRED, resolveErrorCopy, type ErrorCopy } from '@/lib/copy';
import { absoluteDate, formatDuration } from '@/lib/format';
import { displayLink, parseLink, PLATFORM_NAMES, type Platform } from '@/lib/links';
import { ctaLabel, postKind, postMeta, splitSound } from '@/lib/preview';
import { hostPort } from '@/lib/pairing';
import { chooseQuality, offeredQualities, qualityLabel, type Quality } from '@/lib/quality';
import { EDGE, radius } from '@/lib/theme';
import { findSavedLink } from '@/state/history';
import { NotPairedError, resolveLink } from '@/state/resolve';
import { activeServer, settingsStore, uiStore } from '@/state/stores';
import { startJobs } from '@/state/sync';
import { canOpenTermux, openTermux } from '@/state/system';
import { closeAllSheets, haptic, openSheet, snack } from '@/state/ui';

type State = { kind: 'loading' } | { kind: 'ready'; data: Resolved } | { kind: 'error'; copy: ErrorCopy };

const FooterCtx = createContext<(n: ReactNode) => void>(() => undefined);

export function PreviewSheet({ url, batch, onClose }: { url: string; batch?: boolean; onClose: () => void }) {
  const [footer, setFooter] = useState<ReactNode>(null);
  return (
    <FooterCtx.Provider value={setFooter}>
      <Sheet onClose={onClose} label="Preview" footer={footer ?? <View style={{ height: 56 }} />}>
        <PreviewBody url={url} batch={batch} />
      </Sheet>
    </FooterCtx.Provider>
  );
}

function PreviewBody({ url, batch }: { url: string; batch?: boolean }) {
  const { close } = useSheet();
  const platform: Platform | null = parseLink(url)?.platform ?? null;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const server = activeServer();

  const load = useCallback(
    (force = false) => {
      setState({ kind: 'loading' });
      resolveLink(url, force)
        .then((data) => {
          settingsStore.set({ lastResolved: url });
          if (!data.items?.length) {
            setState({ kind: 'error', copy: NO_ITEMS });
            haptic.error();
          } else setState({ kind: 'ready', data });
        })
        .catch((e) => {
          haptic.error();
          if (e instanceof NotPairedError) return setState({ kind: 'error', copy: NOT_PAIRED });
          setState({
            kind: 'error',
            copy: resolveErrorCopy(e instanceof ApiError ? e : new ApiError('offline', String(e)), {
              platform,
              serverName: server?.name,
              hostPort: server ? hostPort(server.host, server.port) : undefined,
            }),
          });
        });
    },
    [url, platform, server],
  );

  // Resolving is the external sync this effect exists for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => load(), [load]);

  const name = platform ? PLATFORM_NAMES[platform] : 'Link';
  const author = state.kind === 'ready' ? state.data.author : null;

  return (
    <View>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: EDGE, paddingRight: 8, gap: 8 }}>
        {platform ? <Icon name={PLATFORM_ICON[platform]} size={20} /> : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
          <T role="metaStrong">{name}</T>
          {author ? (
            <T role="meta" color="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>
              · {author.startsWith('@') || author.startsWith('u/') || platform === 'youtube' || platform === 'facebook' ? author : `@${author}`}
            </T>
          ) : null}
        </View>
        <PressClose onPress={close} />
      </View>
      {state.kind === 'loading' ? (
        <Loading />
      ) : state.kind === 'error' ? (
        <ErrorBlock copy={state.copy} url={url} onRetry={() => load(true)} />
      ) : (
        <Animated.View entering={FadeIn.duration(240)}>
          <Ready data={state.data} url={url} batch={batch} />
        </Animated.View>
      )}
    </View>
  );
}

function PressClose({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Close preview" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="X" />
    </Pressable>
  );
}

function Loading() {
  const { width } = useWindowDimensions();
  const setFooter = useContext(FooterCtx);
  useEffect(() => {
    setFooter(<Button label="Reading the post…" disabled big full />);
  }, [setFooter]);
  return (
    <View style={{ paddingHorizontal: EDGE, gap: 12, paddingBottom: 8 }} accessibilityLabel="Reading the post…">
      <Skeleton style={{ width: Math.min(width, 600) - 40, height: Math.min(width, 600) * 0.62, borderRadius: 16 }} />
      <Skeleton style={{ width: '70%', height: 20, borderRadius: 6 }} />
      <Skeleton style={{ width: '40%', height: 14, borderRadius: 6 }} />
    </View>
  );
}

function ErrorBlock({ copy, url, onRetry }: { copy: ErrorCopy; url: string; onRetry: () => void }) {
  const { close } = useSheet();
  const setFooter = useContext(FooterCtx);
  useEffect(() => {
    const buttons = copy.actions
      .filter((a) => a !== 'termux' || canOpenTermux)
      .map((a, i, arr) => {
        const primary = i === arr.length - 1;
        const variant = primary ? 'primary' : 'tonal';
        const common = { key: a, big: true, variant, style: { flex: 1 } } as const;
        switch (a) {
          case 'close':
            return <Button {...common} label="Close" onPress={close} />;
          case 'retry':
            return <Button {...common} label="Try again" onPress={onRetry} />;
          case 'termux':
            return <Button {...common} label="Open Termux" onPress={() => void openTermux()} />;
          case 'pair':
          case 'pairAgain':
            return (
              <Button
                {...common}
                label={a === 'pair' ? 'Pair a server' : 'Pair again'}
                onPress={() => {
                  closeAllSheets();
                  router.navigate('/server');
                  openSheet({ kind: 'pair' });
                }}
              />
            );
        }
      });
    setFooter(<View style={{ flexDirection: 'row', gap: 12 }}>{buttons}</View>);
  }, [copy, close, onRetry, setFooter]);
  return (
    <View style={{ paddingHorizontal: EDGE, paddingTop: 16, paddingBottom: 8, gap: 8 }} accessibilityLiveRegion="polite">
      <View style={{ marginBottom: 4 }}>
        <Icon name={copy.icon} size={32} color={copy.tone} />
      </View>
      <T role="headline">{copy.title}</T>
      <T role="body" color="ink">
        {copy.body}
      </T>
      <T role="meta" color="ink2" numberOfLines={1} ellipsizeMode="middle" style={{ marginTop: 8 }}>
        {displayLink(url)}
      </T>
    </View>
  );
}

function Ready({ data, url, batch }: { data: Resolved; url: string; batch?: boolean }) {
  const { c } = useTheme();
  const setFooter = useContext(FooterCtx);
  const { close } = useSheet();
  const { width: winW } = useWindowDimensions();
  const settings = settingsStore.use((s) => s);
  const edit = uiStore.use((s) => s.batchEdits[url]);
  const items = data.items;
  const { tiles, sound } = useMemo(() => splitSound(items), [items]);
  const many = tiles.length > 1;

  // The soundtrack is opt-in; every picture/video starts selected.
  const [selected, setSelected] = useState<Set<number>>(() => new Set(edit?.items ?? tiles.map((i) => i.index)));
  const sel = useMemo(() => items.filter((i) => selected.has(i.index)), [items, selected]);
  const selTiles = useMemo(() => tiles.filter((i) => selected.has(i.index)), [tiles, selected]);
  const soundOn = !!sound && selected.has(sound.index);
  const hasVideo = sel.some((i) => i.type === 'video');
  const hasPhoto = sel.some((i) => i.type === 'image');
  const [mode, setMode] = useState<Mode>(edit?.mode ?? settings.defaultMode);
  // Video or audio only applies to videos; photos and a soundtrack are saved as they are.
  const effectiveMode: Mode = hasVideo ? mode : 'media';
  const offered = useMemo(() => offeredQualities(sel.filter((i) => i.type === 'video').map((i) => i.qualities)), [sel]);
  const [quality, setQuality] = useState<Quality>(() => edit?.quality ?? chooseQuality(settings.quality[data.platform], offered));
  const [starting, setStarting] = useState(false);
  const dup = settings.warnDuplicate ? findSavedLink(url) : null;

  const toggle = (i: number) => {
    haptic.select();
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const save = useCallback(async () => {
    const body = {
      url,
      items: sel.length === items.length ? null : sel.map((i) => i.index),
      mode: effectiveMode,
      quality: effectiveMode === 'media' && hasVideo ? quality : 'max',
    } as const;
    if (batch) {
      uiStore.set((s) => ({ batchEdits: { ...s.batchEdits, [url]: { items: body.items, mode: body.mode, quality: body.quality } } }));
      close();
      return;
    }
    haptic.light();
    setStarting(true);
    try {
      const jobs = await startJobs(body);
      uiStore.set({ fieldText: '' });
      close();
      snack(`Saving ${jobs.length} ${jobs.length === 1 ? 'item' : 'items'}`, { label: 'View', onPress: () => router.navigate('/activity') });
    } catch (e) {
      setStarting(false);
      haptic.error();
      const server = activeServer();
      const copy = resolveErrorCopy(e, { platform: data.platform, serverName: server?.name, hostPort: server ? hostPort(server.host, server.port) : undefined });
      snack(copy.title);
    }
  }, [url, sel, items.length, effectiveMode, hasVideo, quality, batch, close, data.platform]);

  useEffect(() => {
    setFooter(
      <Button
        label={batch ? 'Done' : ctaLabel(sel, effectiveMode, sound)}
        rec={!batch}
        big
        full
        disabled={sel.length === 0}
        loading={starting}
        loadingLabel="Starting…"
        onPress={save}
      />,
    );
  }, [sel, effectiveMode, starting, save, batch, setFooter, sound]);

  const one = tiles[0];
  const mediaW = Math.min(winW, 640) - 40;
  const ratio = one?.width && one?.height ? Math.min(16 / 9, Math.max(4 / 5, one.width / one.height)) : 16 / 9;
  const kind = postKind(data, one);

  return (
    <View style={{ gap: 0, paddingBottom: 8 }}>
      {many ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: EDGE, paddingRight: 8, marginTop: 8 }}>
            <T role="metaStrong" style={{ flex: 1 }}>
              {`${tiles.length} items`}
              {selTiles.length !== tiles.length ? ` · ${selTiles.length} selected` : ''}
            </T>
            <Button
              variant="text"
              label={selTiles.length === tiles.length ? 'Clear' : 'Select all'}
              onPress={() => {
                haptic.select();
                const keep = soundOn && sound ? [sound.index] : [];
                setSelected(new Set(selTiles.length === tiles.length ? keep : [...tiles.map((i) => i.index), ...keep]));
              }}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={112}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: EDGE, gap: 8, paddingVertical: 8 }}
          >
            {tiles.map((it, n) => {
              const on = selected.has(it.index);
              const typeName = it.type === 'image' ? 'Photo' : it.type === 'audio' ? 'Audio' : 'Video';
              return (
                <Pressable
                  key={it.index}
                  onPress={() => toggle(it.index)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${typeName} ${n + 1} of ${tiles.length}, ${on ? 'selected' : 'not selected'}`}
                  style={{ opacity: on ? 1 : 0.55 }}
                >
                  <Thumb uri={it.thumbnail ?? data.thumbnail} platform={data.platform} width={104} height={130} rounded={radius.sm} duration={it.type === 'video' ? it.duration : null} />
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? c.select : c.mediaScrim,
                      borderWidth: on ? 0 : 2,
                      borderColor: '#FFFFFF',
                    }}
                  >
                    {on ? <Icon name="Check" size={16} color="onSelect" weight="bold" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={{ paddingHorizontal: EDGE, marginTop: 4 }}>
          <Thumb
            uri={one?.thumbnail ?? data.thumbnail}
            platform={data.platform}
            width={mediaW}
            height={mediaW / ratio}
            rounded={16}
            iconSize={32}
            duration={one?.type !== 'image' ? (one?.duration ?? data.duration) : null}
            pill={one?.type === 'image' ? 'Photo' : undefined}
            label={data.title ?? kind}
          />
        </View>
      )}

      <View style={{ paddingHorizontal: EDGE, marginTop: 16, gap: 4 }}>
        {data.title ? (
          <T role="title" numberOfLines={2}>
            {data.title}
          </T>
        ) : null}
        <T role="meta" color="ink2">
          {postMeta(data)}
        </T>
      </View>

      {sound ? (
        <View style={{ marginHorizontal: 8, marginTop: 16, borderRadius: radius.md, overflow: 'hidden' }}>
          <ListRow
            role="switch"
            checked={soundOn}
            onPress={() => toggle(sound.index)}
            iconNode={
              sound.thumbnail ? (
                <Thumb uri={sound.thumbnail} platform={data.platform} size={40} rounded={radius.sm} />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: c.sunk, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="MusicNotes" size={20} color="ink2" />
                </View>
              )
            }
            title="Also save the sound"
            subtitle={[sound.title ?? 'The song playing on this post', sound.duration ? formatDuration(sound.duration) : ''].filter(Boolean).join(' · ')}
            trailing={<SwitchMark on={soundOn} />}
            accessibilityLabel={`Also save the sound${sound.title ? `: ${sound.title}` : ''}`}
          />
        </View>
      ) : null}

      {dup ? (
        <Banner
          tone="warn"
          icon="ClockCounterClockwise"
          title={`You saved this on ${absoluteDate(dup.savedAt)}`}
          body="Saving it again makes a second copy."
          style={{ marginHorizontal: 8, marginTop: 16 }}
        />
      ) : null}

      {hasVideo ? (
        <View style={{ paddingHorizontal: EDGE, marginTop: 24, gap: 8 }}>
          <T role="metaStrong" color="ink2">
            Format
          </T>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'media', label: hasPhoto ? 'Video & photos' : 'Video' },
              { value: 'audio', label: 'Audio only' },
            ]}
          />
          {hasPhoto && mode === 'media' ? (
            <T role="meta" color="ink2">
              Photos are saved as they are.
            </T>
          ) : null}
        </View>
      ) : null}

      {effectiveMode === 'media' && hasVideo && offered.length > 0 ? (
        <View style={{ marginTop: 24, gap: 8 }}>
          <T role="metaStrong" color="ink2" style={{ paddingHorizontal: EDGE }}>
            Quality
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: EDGE, gap: 8, paddingVertical: 6 }}>
            {(['max', ...offered] as Quality[]).map((q) => (
              <Chip key={String(q)} label={qualityLabel(q)} selected={quality === q} onPress={() => setQuality(q)} />
            ))}
          </ScrollView>
          {quality === 'max' ? (
            <T role="meta" color="ink2" style={{ paddingHorizontal: EDGE }}>
              {`Best is ${offered[0]}p for this post.`}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
