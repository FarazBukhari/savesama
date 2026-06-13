import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../theme';
import { ItemDownloadState } from './MediaCard';

interface FormatChoiceModalProps {
  visible: boolean;
  videoState: ItemDownloadState;
  audioState: ItemDownloadState;
  onSaveVideo: () => void;
  onSaveAudio: () => void;
  onClose: () => void;
}

export function FormatChoiceModal({
  visible,
  videoState,
  audioState,
  onSaveVideo,
  onSaveAudio,
  onClose,
}: FormatChoiceModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Save as</Text>

          <FormatRow
            label="Video"
            sublabel="MP4"
            state={videoState}
            onPress={onSaveVideo}
          />
          <FormatRow
            label="Audio"
            sublabel="M4A · audio only"
            state={audioState}
            onPress={onSaveAudio}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FormatRow({
  label,
  sublabel,
  state,
  onPress,
}: {
  label: string;
  sublabel: string;
  state: ItemDownloadState;
  onPress: () => void;
}) {
  const isDownloading = state.status === 'downloading';

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && !isDownloading && styles.rowPressed]}
      onPress={isDownloading ? undefined : onPress}
    >
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSublabel}>{sublabel}</Text>
        {isDownloading ? (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]}
            />
          </View>
        ) : null}
      </View>
      <FormatChip state={state} />
    </Pressable>
  );
}

function FormatChip({ state }: { state: ItemDownloadState }) {
  if (state.status === 'done') {
    return (
      <View style={[styles.chip, styles.chipDone]}>
        <Text style={styles.chipLabelDone}>Saved</Text>
      </View>
    );
  }
  if (state.status === 'downloading') {
    return <Text style={styles.progressLabel}>{Math.round(state.progress * 100)}%</Text>;
  }
  return (
    <View style={[styles.chip, styles.chipSave]}>
      <Text style={styles.chipLabelSave}>
        {state.status === 'error' ? 'Retry' : 'Save'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowPressed: {
    opacity: 0.65,
  },
  rowInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  rowSublabel: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  progressTrack: {
    marginTop: spacing.sm,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  progressLabel: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.body,
    minWidth: 44,
    textAlign: 'right',
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipDone: {
    backgroundColor: colors.successSoft,
  },
  chipLabelDone: {
    color: colors.success,
    fontWeight: '600',
    fontSize: typography.small,
  },
  chipSave: {
    backgroundColor: colors.accentSoft,
  },
  chipLabelSave: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.small,
  },
});
