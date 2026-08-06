import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResolutionPref, resolutionLabel } from '../services/preferences';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { ItemDownloadState } from './MediaCard';

interface FormatChoiceModalProps {
  visible: boolean;
  videoState: ItemDownloadState;
  audioState: ItemDownloadState;
  /** Quality this save will use — the platform default, or a one-off override. */
  resolution: ResolutionPref;
  /** True when the chosen quality differs from the saved default. */
  resolutionOverridden: boolean;
  onSaveVideo: () => void;
  onSaveAudio: () => void;
  onChangeResolution: () => void;
  onClose: () => void;
}

export function FormatChoiceModal({
  visible,
  videoState,
  audioState,
  resolution,
  resolutionOverridden,
  onSaveVideo,
  onSaveAudio,
  onChangeResolution,
  onClose,
}: FormatChoiceModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Save as</Text>

          <FormatRow
            glyph="🎬"
            label="Video"
            sublabel="MP4"
            state={videoState}
            onPress={onSaveVideo}
          />
          <FormatRow
            glyph="🎧"
            label="Audio"
            sublabel="M4A · audio only"
            state={audioState}
            onPress={onSaveAudio}
          />

          {/* Quality applies to the video save only, just for this download —
              Settings keeps the per-platform default. */}
          <Pressable
            style={({ pressed }) => [styles.qualityRow, pressed && styles.rowPressed]}
            onPress={onChangeResolution}
            accessibilityRole="button"
          >
            <Text style={styles.qualityLabel}>Video quality</Text>
            <View style={styles.qualityValueWrap}>
              <Text style={styles.qualityValue}>{resolutionLabel(resolution)}</Text>
              <Text style={styles.qualityHint}>
                {resolutionOverridden ? 'Just this download' : 'Default · tap to change'}
              </Text>
            </View>
            <Text style={styles.qualityChevron}>›</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FormatRow({
  glyph,
  label,
  sublabel,
  state,
  onPress,
}: {
  glyph: string;
  label: string;
  sublabel: string;
  state: ItemDownloadState;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const isDownloading = state.status === 'downloading';

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && !isDownloading && styles.rowPressed]}
      onPress={isDownloading ? undefined : onPress}
    >
      <View style={styles.iconTile}>
        <Text style={styles.iconGlyph}>{glyph}</Text>
      </View>
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
  const styles = useThemedStyles(makeStyles);
  if (state.status === 'done') {
    return (
      <View style={[styles.chip, styles.chipDone]}>
        <Text style={styles.chipLabelDone}>✓ Saved</Text>
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.colors.sunken,
  },
  qualityLabel: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  qualityValueWrap: {
    alignItems: 'flex-end',
  },
  qualityValue: {
    fontSize: typography.subtitle,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  qualityHint: {
    marginTop: 1,
    fontSize: typography.small,
    color: theme.colors.textSecondary,
  },
  qualityChevron: {
    marginLeft: spacing.sm,
    fontSize: typography.subtitle,
    color: theme.colors.textSecondary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...theme.shadows.raised,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowPressed: {
    opacity: 0.65,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: theme.colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconGlyph: {
    fontSize: 20,
  },
  rowInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: typography.body,
    fontWeight: '700',
    color: theme.colors.text,
  },
  rowSublabel: {
    marginTop: 2,
    fontSize: typography.small,
    color: theme.colors.textSecondary,
  },
  progressTrack: {
    marginTop: spacing.sm,
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
    fontWeight: '800',
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
    backgroundColor: theme.colors.successSoft,
  },
  chipLabelDone: {
    color: theme.colors.success,
    fontWeight: '700',
    fontSize: typography.small,
  },
  chipSave: {
    backgroundColor: theme.colors.accent,
  },
  chipLabelSave: {
    color: theme.colors.textOnAccent,
    fontWeight: '700',
    fontSize: typography.small,
  },
});
