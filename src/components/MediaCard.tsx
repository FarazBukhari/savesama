import { Image, StyleSheet, Text, View } from 'react-native';

import { MediaItem } from '../extraction/types';
import { colors, radius, shadows, spacing, typography } from '../theme';
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
}

export function MediaCard({ item, state, onDownload, onCancel }: MediaCardProps) {
  const isVideo = item.type === 'video';

  return (
    <View style={styles.card}>
      <View style={styles.thumbWrapper}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]} />
        )}
        {isVideo ? (
          <View style={styles.playOverlay}>
            <View style={styles.playChip}>
              <Text style={styles.playGlyph}>▶</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={styles.typeLabel}>{isVideo ? 'Video' : 'Photo'}</Text>
        {item.width && item.height ? (
          <View style={styles.dimensionChip}>
            <Text style={styles.dimensionLabel}>
              {item.width} × {item.height}
            </Text>
          </View>
        ) : null}
        {state.status === 'downloading' ? (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]}
            />
          </View>
        ) : null}
      </View>

      <DownloadAction
        state={state}
        onPress={() => onDownload(item)}
        onCancelPress={onCancel ? () => onCancel(item) : undefined}
      />
    </View>
  );
}

function DownloadAction({
  state,
  onPress,
  onCancelPress,
}: {
  state: ItemDownloadState;
  onPress: () => void;
  onCancelPress?: () => void;
}) {
  // Queued behind another download: the runner takes one job at a time. Tapping
  // removes it from the queue (the in-flight job can't be cancelled — see
  // downloadQueue.ts).
  if (state.status === 'queued') {
    if (onCancelPress) {
      return (
        <PressableScale style={styles.actionArea} onPress={onCancelPress} accessibilityRole="button">
          <Text style={styles.queuedLabel}>Queued · tap to cancel</Text>
        </PressableScale>
      );
    }
    return (
      <View style={styles.actionArea}>
        <Text style={styles.queuedLabel}>Queued</Text>
      </View>
    );
  }
  if (state.status === 'downloading') {
    // Tapping cancels: the transfer aborts immediately, and a native mux/transcode
    // already running stops mattering because the result is never saved.
    if (onCancelPress) {
      return (
        <PressableScale style={styles.actionArea} onPress={onCancelPress} accessibilityRole="button">
          <Text style={styles.progressLabel}>{Math.round(state.progress * 100)}%</Text>
          <Text style={styles.cancelHint}>Cancel</Text>
        </PressableScale>
      );
    }
    return (
      <View style={styles.actionArea}>
        <Text style={styles.progressLabel}>{Math.round(state.progress * 100)}%</Text>
      </View>
    );
  }
  if (state.status === 'done') {
    // Stays pressable: videos re-open the format modal, photos save again. Either
    // way the user needs a route back after changing the resolution.
    return (
      <PressableScale
        style={[styles.actionArea, styles.doneBadge]}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Text style={styles.doneLabel}>✓ Saved</Text>
      </PressableScale>
    );
  }
  return (
    <PressableScale style={styles.saveButton} onPress={onPress} accessibilityRole="button">
      <Text style={styles.saveLabel}>{state.status === 'error' ? 'Retry' : 'Save'}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadows.card,
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
  },
  thumbFallback: {
    backgroundColor: colors.videoBadge,
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playChip: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    color: colors.textOnAccent,
    fontSize: 14,
    marginLeft: 2,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  typeLabel: {
    fontSize: typography.headline,
    fontWeight: '700',
    color: colors.text,
  },
  dimensionChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs + 2,
    backgroundColor: colors.sunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  dimensionLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  progressTrack: {
    marginTop: spacing.sm,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.sunken,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  actionArea: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  cancelHint: {
    marginTop: 1,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  queuedLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  progressLabel: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: typography.body,
  },
  doneBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  doneLabel: {
    color: colors.success,
    fontWeight: '700',
    fontSize: typography.small,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minWidth: 76,
    alignItems: 'center',
    ...shadows.glow,
  },
  saveLabel: {
    color: colors.textOnAccent,
    fontWeight: '700',
    fontSize: typography.body,
  },
});
