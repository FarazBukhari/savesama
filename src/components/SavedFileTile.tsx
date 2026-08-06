import Feather from '@expo/vector-icons/Feather';
import { MediaType } from 'expo-media-library';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { SavedAsset } from '../services/library';
import { useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';

interface SavedFileTileProps {
  asset: SavedAsset;
  size: number;
  onOpen: (asset: SavedAsset) => void;
  onDelete: (asset: SavedAsset) => void;
}

/** `duration` arrives in milliseconds; render it as m:ss. */
export function formatDuration(durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SavedFileTile({ asset, size, onOpen, onDelete }: SavedFileTileProps) {
  const styles = useThemedStyles(makeStyles);
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
          <Feather name="music" size={26} color="#FFFFFF" />
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

      <View style={styles.chip}>
        <Feather name={isAudio ? 'music' : isVideo ? 'play' : 'image'} size={9} color="#FFFFFF" />
        {(isVideo || isAudio) && hasDuration ? (
          <Text style={styles.chipLabel}>{formatDuration(asset.duration as number)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    pressed: {
      opacity: 0.7,
    },
    thumb: {
      flex: 1,
      borderRadius: radius.md,
      backgroundColor: theme.colors.sunken,
    },
    audioThumb: {
      backgroundColor: theme.colors.videoBadge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chip: {
      position: 'absolute',
      right: spacing.sm - 2,
      bottom: spacing.sm - 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: theme.colors.videoBadge,
      borderRadius: radius.sm - 3,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    chipLabel: {
      color: '#FFFFFF',
      fontSize: typography.figure - 1,
      fontFamily: fonts.mono,
      fontWeight: '700',
    },
  });
