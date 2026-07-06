import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isTranscodeSupported } from '../../modules/foxy-audio-extractor';
import {
  RESOLUTION_OPTIONS,
  ResolutionPref,
  resolutionLabel,
  resolutionSublabel,
} from '../services/preferences';
import { colors, radius, spacing, typography } from '../theme';

interface ResolutionChoiceModalProps {
  visible: boolean;
  title: string;
  value: ResolutionPref;
  onSelect: (value: ResolutionPref) => void;
  onClose: () => void;
}

export function ResolutionChoiceModal({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: ResolutionChoiceModalProps) {
  const insets = useSafeAreaInsets();
  // Capped presets can only promise on-device downscaling where the native
  // transcoder exists (iOS today) — elsewhere they pick the closest rendition.
  const canTranscode = isTranscodeSupported();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          {RESOLUTION_OPTIONS.map((option) => (
            <ResolutionRow
              key={option}
              label={resolutionLabel(option)}
              sublabel={resolutionSublabel(option, canTranscode)}
              selected={option === value}
              onPress={() => {
                onSelect(option);
                onClose();
              }}
            />
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ResolutionRow({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
        <Text style={styles.rowSublabel}>{sublabel}</Text>
      </View>
      {selected ? (
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>✓</Text>
        </View>
      ) : null}
    </Pressable>
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
  rowLabelSelected: {
    color: colors.accent,
  },
  rowSublabel: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    color: colors.textSecondary,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.accentSoft,
  },
  chipLabel: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.small,
  },
});
