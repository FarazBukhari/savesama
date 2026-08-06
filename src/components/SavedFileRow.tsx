import Feather from '@expo/vector-icons/Feather';
import { MediaType } from 'expo-media-library';
import { Image, StyleSheet, Text, View } from 'react-native';

import { SavedAsset } from '../services/library';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';
import { PressableScale } from './PressableScale';
import { formatDuration } from './SavedFileTile';
import { kindLabel, prettyName } from './savedName';

interface SavedFileRowProps {
  asset: SavedAsset;
  onOpen: (asset: SavedAsset) => void;
  onDelete: (asset: SavedAsset) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Short relative date. Anything past the last few days falls back to a numeric
 * date — a bare weekday six days back reads as the *coming* one.
 */
function formatWhen(timestamp: number | null): string {
  if (timestamp == null) return '—';
  const date = new Date(timestamp);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((startOfToday.getTime() - date.getTime()) / DAY_MS) + 1;
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 5) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * List-view row. Byte size and resolution aren't in the media-library record,
 * so they aren't shown rather than guessed.
 */
export function SavedFileRow({ asset, onOpen, onDelete }: SavedFileRowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isAudio = asset.mediaType === MediaType.AUDIO;
  const hasDuration = asset.duration != null && asset.duration > 0;
  const { title, code } = prettyName(asset.filename, asset.mediaType);

  const facts = [formatWhen(asset.modificationTime ?? asset.creationTime)];
  if (hasDuration) facts.push(formatDuration(asset.duration as number));
  if (code) facts.push(code);

  return (
    <PressableScale
      style={styles.row}
      onPress={() => onOpen(asset)}
      onLongPress={() => onDelete(asset)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${kindLabel(asset.mediaType)}`}
    >
      {isAudio ? (
        <View style={[styles.thumb, styles.audioThumb]}>
          <Feather name="music" size={20} color={theme.colors.textSecondary} />
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
          {title}
        </Text>
        <Text style={styles.facts} numberOfLines={1}>
          {facts.join('  ·  ')}
        </Text>
      </View>

      <Feather name="chevron-right" size={18} color={theme.colors.placeholder} />
    </PressableScale>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: MIN_TAP + 16,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    thumb: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
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
      fontSize: typography.body,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facts: {
      marginTop: 3,
      fontSize: typography.figure,
      fontFamily: fonts.mono,
      color: theme.colors.textSecondary,
    },
  });
