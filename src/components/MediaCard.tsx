import Feather from '@expo/vector-icons/Feather';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MediaItem } from '../extraction/types';
import { WIDTH_TRANSITION } from '../motion';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';
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
 * One row of a resolved post.
 *
 * The action is a single circular button rather than a filled pill. Eight
 * carousel items meant eight orange slabs stacked down the screen, which read
 * as eight alarms — the filled treatment now belongs only to "Save all".
 */
export function MediaCard({ item, state, onDownload, onCancel, last }: MediaCardProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isVideo = item.type === 'video';
  const busy = state.status === 'downloading' || state.status === 'queued';

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Feather
            name={isVideo ? 'play' : 'image'}
            size={18}
            color={theme.colors.textSecondary}
          />
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.typeLabel}>{isVideo ? 'Video' : 'Photo'}</Text>

        {state.status === 'downloading' ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(state.progress * 100)}%` },
                  WIDTH_TRANSITION,
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>{Math.round(state.progress * 100)}%</Text>
          </View>
        ) : (
          <Text style={styles.facts}>
            {state.status === 'queued'
              ? 'Waiting'
              : state.status === 'error'
                ? 'Failed'
                : item.width && item.height
                  ? `${item.width}×${item.height}`
                  : ''}
          </Text>
        )}
      </View>

      <RowAction
        state={state}
        busy={busy}
        styles={styles}
        theme={theme}
        onPress={() => onDownload(item)}
        onCancelPress={onCancel ? () => onCancel(item) : undefined}
      />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function RowAction({
  state,
  busy,
  styles,
  theme,
  onPress,
  onCancelPress,
}: {
  state: ItemDownloadState;
  busy: boolean;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
  onCancelPress?: () => void;
}) {
  // Queued behind another download: the runner takes one job at a time. Tapping
  // removes it from the queue (the in-flight job can't be cancelled — see
  // downloadQueue.ts).
  if (busy) {
    if (!onCancelPress) return <View style={styles.action} />;
    return (
      <PressableScale
        style={styles.action}
        onPress={onCancelPress}
        accessibilityRole="button"
        accessibilityLabel="Cancel download"
      >
        <Feather name="x" size={20} color={theme.colors.textSecondary} />
      </PressableScale>
    );
  }

  if (state.status === 'done') {
    // Stays pressable: videos re-open the format modal, photos save again. Either
    // way the user needs a route back after changing the resolution.
    return (
      <PressableScale
        style={[styles.action, styles.actionDone]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Saved — save again"
      >
        <Feather name="check" size={20} color={theme.colors.success} />
      </PressableScale>
    );
  }

  const isRetry = state.status === 'error';
  return (
    <PressableScale
      style={[styles.action, styles.actionIdle, isRetry && styles.actionRetry]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isRetry ? 'Retry download' : 'Save'}
    >
      <Feather
        name={isRetry ? 'rotate-cw' : 'arrow-down'}
        size={20}
        color={isRetry ? theme.colors.error : theme.colors.accent}
      />
    </PressableScale>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
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
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      marginTop: spacing.sm,
    },
    progressTrack: {
      flex: 1,
      height: 5,
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
    action: {
      width: MIN_TAP,
      height: MIN_TAP,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionIdle: {
      backgroundColor: theme.colors.accentSoft,
    },
    actionRetry: {
      backgroundColor: theme.colors.errorSoft,
    },
    actionDone: {
      backgroundColor: theme.colors.successSoft,
    },
  });
