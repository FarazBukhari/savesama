import Feather from '@expo/vector-icons/Feather';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { MediaItem } from '../extraction/types';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { PressableScale } from './PressableScale';

export type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'done' | 'error';

export interface ItemDownloadState {
  status: DownloadStatus;
  progress: number;
}

interface MediaCardProps {
  item: MediaItem;
  state: ItemDownloadState;
  onDownload: (item: MediaItem) => void;
  /** Removes a still-queued download. Absent for cards that can't be cancelled. */
  onCancel?: (item: MediaItem) => void;
  /** Last row in its group — drops the divider. */
  last?: boolean;
}

/**
 * One row of the queue. Everything the machine knows about the transfer is on
 * the row: kind, dimensions, progress, and where it ended up. The states that
 * used to fail silently now have somewhere to be seen.
 */
export function MediaCard({ item, state, onDownload, onCancel, last }: MediaCardProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isVideo = item.type === 'video';

  const facts: string[] = [isVideo ? 'Video' : 'Photo'];
  if (item.width && item.height) facts.push(`${item.width}×${item.height}`);

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Feather
              name={isVideo ? 'play' : 'image'}
              size={15}
              color={theme.colors.textSecondary}
            />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.typeLabel}>{facts[0]}</Text>
        {state.status === 'downloading' ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]}
              />
            </View>
            <Text style={styles.progressLabel}>{Math.round(state.progress * 100)}%</Text>
          </View>
        ) : (
          <Text style={styles.facts}>{facts.slice(1).join(' · ') || statusFact(state.status)}</Text>
        )}
      </View>

      <DownloadAction
        state={state}
        styles={styles}
        theme={theme}
        onPress={() => onDownload(item)}
        onCancelPress={onCancel ? () => onCancel(item) : undefined}
      />
    </View>
  );
}

function statusFact(status: DownloadStatus): string {
  if (status === 'queued') return 'Waiting';
  if (status === 'error') return 'Failed';
  return '';
}

type Styles = ReturnType<typeof makeStyles>;

function DownloadAction({
  state,
  styles,
  theme,
  onPress,
  onCancelPress,
}: {
  state: ItemDownloadState;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
  onCancelPress?: () => void;
}) {
  // Queued behind another download: the runner takes one job at a time. Tapping
  // removes it from the queue (the in-flight job can't be cancelled — see
  // downloadQueue.ts).
  if (state.status === 'queued' || state.status === 'downloading') {
    if (!onCancelPress) return null;
    return (
      <Pressable
        onPress={onCancelPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Cancel download"
      >
        <Feather name="x" size={16} color={theme.colors.textSecondary} />
      </Pressable>
    );
  }
  if (state.status === 'done') {
    // Stays pressable: videos re-open the format modal, photos save again. Either
    // way the user needs a route back after changing the resolution.
    return (
      <PressableScale style={styles.doneBadge} onPress={onPress} accessibilityRole="button">
        <Feather name="check" size={12} color={theme.colors.success} />
        <Text style={styles.doneLabel}>Saved</Text>
      </PressableScale>
    );
  }
  const isRetry = state.status === 'error';
  return (
    <PressableScale
      style={[styles.saveButton, isRetry && styles.retryButton]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {isRetry ? <Feather name="rotate-cw" size={12} color={theme.colors.text} /> : null}
      <Text style={[styles.saveLabel, isRetry && styles.retryLabel]}>
        {isRetry ? 'Retry' : 'Save'}
      </Text>
    </PressableScale>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md - 2,
      padding: spacing.md - 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    thumb: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: theme.colors.sunken,
    },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    typeLabel: {
      fontSize: typography.subtitle,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facts: {
      marginTop: 4,
      fontSize: typography.figure,
      fontFamily: fonts.mono,
      color: theme.colors.textSecondary,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm - 1,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: theme.colors.sunken,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.accent,
      borderRadius: radius.pill,
    },
    progressLabel: {
      color: theme.colors.accent,
      fontWeight: '700',
      fontFamily: fonts.mono,
      fontSize: typography.figure,
    },
    doneBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.colors.successSoft,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
    },
    doneLabel: {
      color: theme.colors.success,
      fontWeight: '700',
      fontSize: typography.small,
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md + 1,
      paddingVertical: spacing.sm,
    },
    retryButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    saveLabel: {
      color: theme.colors.textOnAccent,
      fontWeight: '700',
      fontSize: typography.small + 1,
    },
    retryLabel: {
      color: theme.colors.text,
    },
  });
