import { useEvent, useEventListener } from 'expo';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/controls';
import { Icon } from '@/components/Icon';
import { T } from '@/components/Text';
import { useTheme } from '@/components/theme';
import { formatDuration, relativeTime } from '@/lib/format';
import { PLATFORM_NAMES } from '@/lib/links';
import { shareFile } from '@/state/gallery';
import { deleteItems, libraryStore, typeName, type LibraryItem } from '@/state/library';
import { confirm, openSheet, snack } from '@/state/ui';

import { filterItems, libraryView } from './LibraryScreen';

export function ViewerScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const all = libraryStore.use((s) => s.items);
  const items = useMemo(() => {
    const list = filterItems(all, libraryView.filter, libraryView.query);
    return list.some((i) => i.key === key) ? list : all;
  }, [all, key]);
  const startIndex = Math.max(0, items.findIndex((i) => i.key === key));
  const [index, setIndex] = useState(startIndex);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const item = items[index];

  const dy = useSharedValue(0);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const swipeDown = Gesture.Pan()
    .enabled(!zoomed)
    .activeOffsetY(24)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      dy.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (dy.value > height * 0.25 || e.velocityY > 900) runOnJS(close)();
      else dy.value = withSpring(0, { damping: 26, stiffness: 260 });
    });
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }], opacity: 1 - Math.min(dy.value / height, 0.6) }));

  useEffect(() => {
    if (!items.length) close();
  }, [items.length]);

  // The rest of the app is portrait-only (app.json); the viewer rotates freely.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);

  const listRef = useRef<FlatList<LibraryItem>>(null);
  useEffect(() => {
    listRef.current?.scrollToIndex({ index, animated: false });
    // Only on rotation: keep the current page in view when the page width changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  if (!item) return <View style={{ flex: 1, backgroundColor: c.viewerBg }} />;

  const remove = () =>
    confirm({
      title: `Delete this ${typeName(item.type).toLowerCase()}?`,
      body: "It's removed from your phone and the SaveSama album. This can't be undone.",
      confirm: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteItems([item.key]);
        } catch {
          snack("Couldn't delete this file");
        }
      },
    });

  return (
    <View style={{ flex: 1, backgroundColor: c.viewerBg }}>
      <StatusBar style="light" hidden={!chrome} />
      <GestureDetector gesture={swipeDown}>
        <Animated.View style={[{ flex: 1 }, pageStyle]}>
          <FlatList
            ref={listRef}
            data={items}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            initialScrollIndex={startIndex}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(i) => i.key}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item: it, index: i }) => (
              <View style={{ width, height }}>
                {Math.abs(i - index) <= 1 ? (
                  <Page item={it} active={i === index} chrome={chrome} toggleChrome={() => setChrome((v) => !v)} setChrome={setChrome} onZoom={setZoomed} />
                ) : null}
              </View>
            )}
          />
        </Animated.View>
      </GestureDetector>
      {chrome ? <TopChrome item={item} onBack={close} onDelete={remove} /> : null}
    </View>
  );
}

function TopChrome({ item, onBack, onDelete }: { item: LibraryItem; onBack: () => void; onDelete: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(160)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top, backgroundColor: c.mediaScrim }}
    >
      <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <IconButton name="ArrowLeft" label="Back" tint="#FFFFFF" onPress={onBack} />
        <T role="bodyStrong" color="mediaInk" numberOfLines={1} style={{ flex: 1, marginHorizontal: 4 }}>
          {item.title}
        </T>
        <IconButton
          name="ShareNetwork"
          label="Share"
          tint="#FFFFFF"
          onPress={() => shareFile(item.uri, item.filename, item.type).catch(() => snack("Couldn't share this file"))}
        />
        <IconButton name="Info" label="Info" tint="#FFFFFF" onPress={() => openSheet({ kind: 'info', key: item.key })} />
        <IconButton name="Trash" label="Delete" tint="#FFFFFF" onPress={onDelete} />
      </View>
    </Animated.View>
  );
}

function metaLine(item: LibraryItem) {
  return [item.platform ? PLATFORM_NAMES[item.platform] : null, item.author, `Saved ${relativeTime(item.savedAt)}`].filter(Boolean).join(' · ');
}

function Page(props: {
  item: LibraryItem;
  active: boolean;
  chrome: boolean;
  toggleChrome: () => void;
  setChrome: (v: boolean) => void;
  onZoom: (z: boolean) => void;
}) {
  if (props.item.type === 'image') return <ZoomImage {...props} />;
  if (!props.active) return <Poster item={props.item} />;
  if (props.item.type === 'video') return <VideoPage {...props} />;
  return <AudioPage {...props} />;
}

function Poster({ item }: { item: LibraryItem }) {
  return item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null;
}

function ZoomImage({ item, toggleChrome, onZoom }: { item: LibraryItem; toggleChrome: () => void; onZoom: (z: boolean) => void }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stx = useSharedValue(0);
  const sty = useSharedValue(0);
  const { width, height } = useWindowDimensions();

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.01) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        stx.value = 0;
        sty.value = 0;
      }
      runOnJS(onZoom)(scale.value > 1.01);
    });
  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      tx.value = Math.max(-maxX, Math.min(maxX, stx.value + e.translationX));
      ty.value = Math.max(-maxY, Math.min(maxY, sty.value + e.translationY));
    })
    .onEnd(() => {
      stx.value = tx.value;
      sty.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        saved.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        stx.value = 0;
        sty.value = 0;
        runOnJS(onZoom)(false);
      } else {
        const s = 2.5;
        const nx = (width / 2 - e.x) * (s - 1);
        const ny = (height / 2 - e.y) * (s - 1);
        scale.value = withTiming(s);
        saved.value = s;
        tx.value = withTiming(nx);
        ty.value = withTiming(ny);
        stx.value = nx;
        sty.value = ny;
        runOnJS(onZoom)(true);
      }
    });
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => runOnJS(toggleChrome)());
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  const zoomActive = Gesture.Simultaneous(pinch, pan);
  return (
    <GestureDetector gesture={Gesture.Exclusive(Gesture.Race(doubleTap, singleTap), zoomActive)}>
      <Animated.View style={[StyleSheet.absoluteFill, style]} accessible accessibilityRole="image" accessibilityLabel={item.title}>
        <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

function SeekBar({ position, duration, onSeek, fill }: { position: number; duration: number; onSeek: (t: number) => void; fill: string }) {
  const [w, setW] = useState(1);
  const frac = duration > 0 ? Math.min(1, position / duration) : 0;
  const seekAt = (x: number) => duration > 0 && onSeek(Math.max(0, Math.min(1, x / w)) * duration);
  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => runOnJS(seekAt)(e.x))
    .onUpdate((e) => runOnJS(seekAt)(e.x));
  return (
    <View style={{ gap: 6 }}>
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          style={{ height: 32, justifyContent: 'center' }}
          accessible
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position), text: `${formatDuration(position)} of ${formatDuration(duration)}` }}
        >
          <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)' }}>
            <View style={{ height: 4, borderRadius: 2, width: `${frac * 100}%`, backgroundColor: fill }} />
          </View>
          <View style={{ position: 'absolute', left: frac * w - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: fill }} />
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T role="caption" color="mediaInk">
          {formatDuration(position) || '0:00'}
        </T>
        <T role="caption" color="mediaInk">
          {formatDuration(duration) || '0:00'}
        </T>
      </View>
    </View>
  );
}

function PlayDisc({ playing, onPress }: { playing: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}
    >
      <Icon name={playing ? 'Pause' : 'Play'} size={28} tint="#15140F" weight="fill" />
    </Pressable>
  );
}

function VideoPage({ item, chrome, toggleChrome, setChrome }: { item: LibraryItem; chrome: boolean; toggleChrome: () => void; setChrome: (v: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(item.uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.duration ?? 0);
  useEventListener(player, 'timeUpdate', (e) => {
    setTime(e.currentTime);
    if (player.duration) setDuration(player.duration);
  });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (chrome && isPlaying) hideTimer.current = setTimeout(() => setChrome(false), 3000);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [chrome, isPlaying, setChrome]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={toggleChrome} accessibilityLabel={item.title}>
        <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" />
      </Pressable>
      {chrome ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 16, paddingHorizontal: 20, gap: 12 }}>
          <PlayDisc playing={isPlaying} onPress={() => (isPlaying ? player.pause() : player.play())} />
          <T role="meta" color="mediaInk" numberOfLines={1}>
            {metaLine(item)}
          </T>
          <SeekBar position={time} duration={duration} fill="#FFD12E" onSeek={(t) => player.seekBy(t - player.currentTime)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function AudioPage({ item }: { item: LibraryItem }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const player = useAudioPlayer(item.uri);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    player.play();
  }, [player]);
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 96, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, justifyContent: 'center', gap: 20 }}>
      <View style={{ width: 280, height: 280, borderRadius: 20, overflow: 'hidden', alignSelf: 'center', backgroundColor: '#262624', alignItems: 'center', justifyContent: 'center' }}>
        {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="MusicNotes" size={64} tint="#FFFFFF" />}
      </View>
      <View style={{ gap: 4 }}>
        <T role="title" color="mediaInk" numberOfLines={2}>
          {item.title}
        </T>
        <T role="meta" color="mediaInk" numberOfLines={1}>
          {metaLine(item)}
        </T>
      </View>
      <SeekBar position={status.currentTime} duration={status.duration || item.duration || 0} fill={c.select} onSeek={(t) => void player.seekTo(t)} />
      <PlayDisc
        playing={status.playing}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish || (status.duration && status.currentTime >= status.duration - 0.2)) void player.seekTo(0);
            player.play();
          }
        }}
      />
    </View>
  );
}
