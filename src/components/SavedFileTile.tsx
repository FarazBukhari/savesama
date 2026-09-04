import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaType } from 'expo-media-library';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SavedAsset } from '../services/library';
import { useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { PressableScale } from './PressableScale';

interface SavedFileTileProps {
  asset: SavedAsset;
  size: number;
  /** Tap: open in the viewer. */
  onOpen: (asset: SavedAsset) => void;
  /** Long-press: the actions sheet (share, rename, delete). */
  onMore: (asset: SavedAsset) => void;
}

/** `duration` arrives in milliseconds; render it as m:ss. */
export function formatDuration(durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Grid cell. Memoised because the list re-renders whenever the filter or a single
 * asset changes, and decoding a thumbnail again for every unchanged tile is what made
 * scrolling stutter.
 */
export const SavedFileTile = memo(function SavedFileTile({
  asset,
  size,
  onOpen,
  onMore,
}: SavedFileTileProps) {
  const styles = useThemedStyles(makeStyles);
  const isAudio = asset.mediaType === MediaType.AUDIO;
  const isVideo = asset.mediaType === MediaType.VIDEO;
  const hasDuration = asset.duration != null && asset.duration > 0;

  return (
    <PressableScale
      style={[styles.tile, { width: size, height: size }]}
      onPress={() => onOpen(asset)}
      onLongPress={() => onMore(asset)}
      accessibilityRole="imagebutton"
      accessibilityHint="Opens the file. Long-press for more actions."
    >
      {isAudio ? (
        <View style={[styles.thumb, styles.audioThumb]}>
          <Feather name="music" size={28} color="#FFFFFF" />
        </View>
      ) : (
        <Image
          source={{ uri: asset.uri }}
          style={styles.thumb}
          contentFit="cover"
          // The source is a full-resolution original; expo-image decodes a bitmap
          // sized to the view and keeps it in its memory/disk cache, so a scroll
          // back up costs nothing and the tile never holds a 4K decode.
          cachePolicy="memory-disk"
          recyclingKey={asset.id}
          transition={0}
          allowDownscaling
        />
      )}

      {/*
        Media is user-supplied, so a badge sitting straight on the artwork is
        legible or not depending on the photo. The scrim makes it always
        legible without dimming the whole tile.
      */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.badges} pointerEvents="none">
        <Feather
          name={isAudio ? 'music' : isVideo ? 'play' : 'image'}
          size={13}
          color="#FFFFFF"
        />
        {(isVideo || isAudio) && hasDuration ? (
          <Text style={styles.duration}>{formatDuration(asset.duration as number)}</Text>
        ) : null}
      </View>
    </PressableScale>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tile: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: theme.colors.sunken,
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    audioThumb: {
      backgroundColor: theme.colors.videoBadge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '38%',
    },
    badges: {
      position: 'absolute',
      left: spacing.sm + 2,
      right: spacing.sm + 2,
      bottom: spacing.sm + 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    duration: {
      color: '#FFFFFF',
      fontSize: typography.caption,
      fontFamily: fonts.mono,
      fontWeight: '700',
    },
  });
