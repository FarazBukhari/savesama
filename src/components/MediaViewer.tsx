import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { MediaType } from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SavedAsset } from '../services/library';
import { useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';
import { formatDuration } from './SavedFileTile';
import { kindLabel, prettyName } from './savedName';

type FeatherName = keyof typeof Feather.glyphMap;

interface MediaViewerProps {
  assets: SavedAsset[];
  /** Index into `assets` to open on, or null to keep the viewer closed. */
  index: number | null;
  onClose: () => void;
  onShare: (asset: SavedAsset) => void;
  onRename: (asset: SavedAsset) => void;
  onDelete: (asset: SavedAsset) => void;
}

/**
 * Full-screen viewer for saved files: photos zoom, videos play with the native
 * controls, audio gets a transport. Swipe sideways to move through the current list.
 * Sharing lives on the toolbar here rather than being what a tap does — opening a
 * file and sending it somewhere are different intents.
 */
export function MediaViewer({ assets, index, onClose, onShare, onRename, onDelete }: MediaViewerProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(index ?? 0);
  const listRef = useRef<FlatList<SavedAsset>>(null);

  useEffect(() => {
    if (index != null) setCurrent(index);
  }, [index]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((token) => token.isViewable);
    if (first && typeof first.index === 'number') setCurrent(first.index);
  }).current;

  const visible = index != null && assets.length > 0;
  const asset = assets[Math.min(current, assets.length - 1)];

  const renderItem = useCallback(
    ({ item, index: itemIndex }: { item: SavedAsset; index: number }) => (
      <View style={{ width, height }}>
        <Pane asset={item} active={itemIndex === current} width={width} height={height} />
      </View>
    ),
    [current, height, width]
  );

  if (!visible || !asset) return null;

  const name = prettyName(asset.filename, asset.mediaType);
  const facts = [name.kind];
  if (asset.duration && asset.duration > 0) facts.push(formatDuration(asset.duration));
  if (name.code) facts.push(name.code);

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={assets}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_data, itemIndex) => ({
            length: width,
            offset: width * itemIndex,
            index: itemIndex,
          })}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          // Neighbours only: each video/audio pane owns a native player.
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Close viewer"
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {name.title}
            </Text>
            <Text style={styles.facts} numberOfLines={1}>
              {facts.join('  ·  ')}
              {assets.length > 1 ? `  ·  ${current + 1}/${assets.length}` : ''}
            </Text>
          </View>
        </View>

        <View style={[styles.toolbar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <ToolbarButton icon="share-2" label="Share" onPress={() => onShare(asset)} styles={styles} />
          <ToolbarButton icon="edit-3" label="Rename" onPress={() => onRename(asset)} styles={styles} />
          <ToolbarButton
            icon="trash-2"
            label="Delete"
            destructive
            onPress={() => onDelete(asset)}
            styles={styles}
          />
        </View>
      </View>
    </Modal>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function ToolbarButton({
  icon,
  label,
  onPress,
  destructive,
  styles,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toolButton, pressed && styles.toolButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={20} color={destructive ? '#FF7B6B' : '#FFFFFF'} />
      <Text style={[styles.toolLabel, destructive && styles.toolLabelDestructive]}>{label}</Text>
    </Pressable>
  );
}

/** Picks the pane for an asset's media type. */
const Pane = memo(function Pane({
  asset,
  active,
  width,
  height,
}: {
  asset: SavedAsset;
  active: boolean;
  width: number;
  height: number;
}) {
  if (asset.mediaType === MediaType.VIDEO) return <VideoPane asset={asset} active={active} />;
  if (asset.mediaType === MediaType.AUDIO) return <AudioPane asset={asset} active={active} />;
  return <ZoomableImage uri={asset.uri} width={width} height={height} />;
});

const MAX_ZOOM = 4;

/** Pinch to zoom, drag to pan while zoomed, double-tap to toggle. Springs back at 1x. */
function ZoomableImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const clampPan = (value: number, size: number, factor: number) => {
    'worklet';
    const limit = (size * (factor - 1)) / 2;
    return Math.min(limit, Math.max(-limit, value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
      runOnJS(setZoomed)(scale.value > 1.02);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
      translateX.value = clampPan(savedX.value + event.translationX, width, scale.value);
      translateY.value = clampPan(savedY.value + event.translationY, height, scale.value);
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1.02 ? 1 : 2.5;
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
      runOnJS(setZoomed)(next > 1);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <Image
          source={{ uri }}
          style={{ width, height }}
          contentFit="contain"
          transition={120}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </GestureDetector>
  );
}

function VideoPane({ asset, active }: { asset: SavedAsset; active: boolean }) {
  const player = useVideoPlayer(asset.uri, (instance) => {
    instance.loop = true;
  });

  // Only the page on screen plays; a neighbour that pre-rendered stays silent.
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

function AudioPane({ asset, active }: { asset: SavedAsset; active: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const player = useAudioPlayer(asset.uri);
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(1);

  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  const duration = status.duration > 0 ? status.duration : (asset.duration ?? 0) / 1000;
  const fraction = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const name = prettyName(asset.filename, asset.mediaType);

  return (
    <View style={styles.audioPane}>
      <View style={styles.audioArt}>
        <Feather name="music" size={64} color="#FFFFFF" />
      </View>
      <Text style={styles.audioTitle} numberOfLines={2}>
        {name.title}
      </Text>
      <Text style={styles.audioKind}>{kindLabel(asset.mediaType)}</Text>

      <Pressable
        style={styles.track}
        onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        onPress={(event) => {
          if (duration <= 0) return;
          const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
          void player.seekTo(ratio * duration);
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
      >
        <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
      </Pressable>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatDuration(status.currentTime * 1000)}</Text>
        <Text style={styles.time}>{formatDuration(duration * 1000)}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.playButton, pressed && styles.toolButtonPressed]}
        onPress={() => {
          if (status.playing) {
            player.pause();
          } else {
            if (status.didJustFinish || (duration > 0 && status.currentTime >= duration - 0.05)) {
              void player.seekTo(0);
            }
            player.play();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
      >
        <Feather name={status.playing ? 'pause' : 'play'} size={30} color="#111111" />
      </Pressable>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000000',
    },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    iconButton: {
      width: MIN_TAP,
      height: MIN_TAP,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
      paddingRight: spacing.md,
    },
    title: {
      color: '#FFFFFF',
      fontSize: typography.body,
      fontWeight: '700',
    },
    facts: {
      marginTop: 2,
      color: 'rgba(255,255,255,0.72)',
      fontSize: typography.caption,
      fontFamily: fonts.mono,
    },
    toolbar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    toolButton: {
      minWidth: 84,
      minHeight: MIN_TAP + 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: radius.md,
    },
    toolButtonPressed: {
      opacity: 0.6,
    },
    toolLabel: {
      color: '#FFFFFF',
      fontSize: typography.caption,
      fontWeight: '600',
    },
    toolLabelDestructive: {
      color: '#FF7B6B',
    },
    audioPane: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
    },
    audioArt: {
      width: 180,
      height: 180,
      borderRadius: radius.xl,
      backgroundColor: theme.colors.videoBadge,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    audioTitle: {
      color: '#FFFFFF',
      fontSize: typography.headline,
      fontWeight: '700',
      textAlign: 'center',
    },
    audioKind: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: typography.small,
      fontFamily: fonts.mono,
      marginBottom: spacing.lg,
    },
    track: {
      alignSelf: 'stretch',
      height: 28,
      justifyContent: 'center',
    },
    trackFill: {
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: theme.colors.accent,
    },
    timeRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -spacing.sm,
    },
    time: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: typography.caption,
      fontFamily: fonts.mono,
    },
    playButton: {
      marginTop: spacing.lg,
      width: 68,
      height: 68,
      borderRadius: radius.pill,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
