import { MediaType } from 'expo-media-library';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { SavedAsset } from '../services/library';
import { colors, radius, spacing, typography } from '../theme';

interface SavedFileTileProps {
  asset: SavedAsset;
  size: number;
  onOpen: (asset: SavedAsset) => void;
  onDelete: (asset: SavedAsset) => void;
}

/** `duration` arrives in milliseconds; render it as m:ss. */
function formatDuration(durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SavedFileTile({ asset, size, onOpen, onDelete }: SavedFileTileProps) {
  const isAudio = asset.mediaType === MediaType.AUDIO;
  const isVideo = asset.mediaType === MediaType.VIDEO;
  const hasDuration = asset.duration != null && asset.duration > 0;

  return (
    <Pressable
      style={({ pressed }) => [{ width: size, height: size }, pressed && styles.pressed]}
      onPress={() => onOpen(asset)}
      onLongPress={() => onDelete(asset)}
    >
      {isAudio ? (
        <View style={[styles.thumb, styles.audioThumb]}>
          <Text style={styles.audioGlyph}>♪</Text>
        </View>
      ) : (
        <Image
          source={{ uri: asset.uri }}
          style={styles.thumb}
          resizeMode="cover"
          // The source is the full-resolution original but the tile is tiny.
          // `resize` decodes a downsampled bitmap (Android/Fresco) instead of the
          // full image, cutting thumbnail memory and decode cost substantially.
          resizeMethod="resize"
        />
      )}

      {isVideo ? (
        <View style={styles.playBadge}>
          <View style={styles.playChip}>
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        </View>
      ) : null}

      {(isVideo || isAudio) && hasDuration ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationLabel}>{formatDuration(asset.duration as number)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  thumb: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
  },
  audioThumb: {
    backgroundColor: colors.videoBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioGlyph: {
    color: colors.textOnAccent,
    fontSize: 30,
  },
  playBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    color: colors.textOnAccent,
    fontSize: 13,
    marginLeft: 2,
  },
  durationBadge: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 1,
  },
  durationLabel: {
    color: colors.textOnAccent,
    fontSize: typography.caption,
    fontWeight: '700',
  },
});
