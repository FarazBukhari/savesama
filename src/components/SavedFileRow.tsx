import Feather from '@expo/vector-icons/Feather';
import { MediaType } from 'expo-media-library';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { SavedAsset } from '../services/library';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { formatDuration } from './SavedFileTile';

interface SavedFileRowProps {
  asset: SavedAsset;
  onOpen: (asset: SavedAsset) => void;
  onDelete: (asset: SavedAsset) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Short relative date. Anything older than a week falls back to a numeric date
 * so the column stays the same width and stays scannable.
 */
function formatWhen(timestamp: number | null): string {
  if (timestamp == null) return '—';
  const date = new Date(timestamp);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((startOfToday.getTime() - date.getTime()) / DAY_MS) + 1;
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yest.';
  // Only within the last few days: a bare weekday six days back reads as the
  // *coming* one.
  if (daysAgo < 5) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function typeLabel(mediaType: MediaType): string {
  if (mediaType === MediaType.AUDIO) return 'Audio';
  if (mediaType === MediaType.VIDEO) return 'Video';
  return 'Photo';
}

/**
 * List-view row. Shows what a grid tile can't — name, kind, length, when it was
 * saved. Byte size and resolution aren't in the media-library record, so they
 * aren't shown rather than guessed.
 */
export function SavedFileRow({ asset, onOpen, onDelete }: SavedFileRowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isAudio = asset.mediaType === MediaType.AUDIO;
  const hasDuration = asset.duration != null && asset.duration > 0;

  const facts = [typeLabel(asset.mediaType)];
  if (hasDuration) facts.push(formatDuration(asset.duration as number));

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => onOpen(asset)}
      onLongPress={() => onDelete(asset)}
    >
      {isAudio ? (
        <View style={[styles.thumb, styles.audioThumb]}>
          <Feather name="music" size={16} color={theme.colors.textSecondary} />
        </View>
      ) : (
        <Image
          source={{ uri: asset.uri }}
          style={styles.thumb}
          resizeMode="cover"
          resizeMethod="resize"
        />
      )}

      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {asset.filename ?? typeLabel(asset.mediaType)}
        </Text>
        <Text style={styles.facts}>{facts.join(' · ')}</Text>
      </View>

      <Text style={styles.when}>{formatWhen(asset.modificationTime ?? asset.creationTime)}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md - 1,
      paddingVertical: spacing.sm + 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    pressed: {
      backgroundColor: theme.colors.sunken,
    },
    thumb: {
      width: 44,
      height: 44,
      borderRadius: radius.sm,
      backgroundColor: theme.colors.sunken,
    },
    audioThumb: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: typography.subtitle,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facts: {
      marginTop: 3,
      fontSize: typography.figure,
      fontFamily: fonts.mono,
      color: theme.colors.textSecondary,
    },
    when: {
      fontSize: typography.figure,
      fontFamily: fonts.mono,
      color: theme.colors.textSecondary,
    },
  });
