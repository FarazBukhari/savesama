import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { MediaItem } from '../extraction/types';
import { colors, radius, spacing, typography } from '../theme';

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

export interface ItemDownloadState {
  status: DownloadStatus;
  progress: number;
}

interface MediaCardProps {
  item: MediaItem;
  state: ItemDownloadState;
  onDownload: (item: MediaItem) => void;
}

export function MediaCard({ item, state, onDownload }: MediaCardProps) {
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
          <View style={styles.playBadge}>
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={styles.typeLabel}>{isVideo ? 'Video' : 'Photo'}</Text>
        {item.width && item.height ? (
          <Text style={styles.dimensions}>
            {item.width} × {item.height}
          </Text>
        ) : null}
        {state.status === 'downloading' ? (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]}
            />
          </View>
        ) : null}
      </View>

      <DownloadAction state={state} onPress={() => onDownload(item)} />
    </View>
  );
}

function DownloadAction({
  state,
  onPress,
}: {
  state: ItemDownloadState;
  onPress: () => void;
}) {
  if (state.status === 'downloading') {
    return (
      <View style={styles.actionArea}>
        <Text style={styles.progressLabel}>{Math.round(state.progress * 100)}%</Text>
      </View>
    );
  }
  if (state.status === 'done') {
    return (
      <View style={[styles.actionArea, styles.doneBadge]}>
        <Text style={styles.doneLabel}>✓ Saved</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
      onPress={onPress}
    >
      <Text style={styles.saveLabel}>{state.status === 'error' ? 'Retry' : 'Save'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  thumbFallback: {
    backgroundColor: colors.videoBadge,
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
  playGlyph: {
    color: colors.textOnAccent,
    fontSize: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  typeLabel: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  dimensions: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  progressTrack: {
    marginTop: spacing.sm,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  actionArea: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  progressLabel: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.body,
  },
  doneBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  doneLabel: {
    color: colors.success,
    fontWeight: '600',
    fontSize: typography.small,
  },
  saveButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 72,
    alignItems: 'center',
  },
  saveButtonPressed: {
    opacity: 0.7,
  },
  saveLabel: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.body,
  },
});
