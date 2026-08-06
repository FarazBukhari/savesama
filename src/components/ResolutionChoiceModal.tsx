import Feather from '@expo/vector-icons/Feather';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isTranscodeSupported } from '../../modules/savesama-audio-extractor';
import {
  RESOLUTION_OPTIONS,
  ResolutionPref,
  resolutionLabel,
  resolutionSublabel,
} from '../services/preferences';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';

/** Short badge shown in each row's leading tile. */
function resolutionBadge(pref: ResolutionPref): string {
  switch (pref) {
    case 'max':
      return 'MAX';
    case '1080':
      return 'FHD';
    case '720':
      return 'HD';
    case '480':
      return 'SD';
    case '360':
      return '360';
  }
}

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
  const styles = useThemedStyles(makeStyles);
  // Capped presets can only promise on-device downscaling where the native
  // transcoder exists (both platforms now) — elsewhere they pick the closest
  // available rendition.
  const canTranscode = isTranscodeSupported();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          accessible={false}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          {RESOLUTION_OPTIONS.map((option) => (
            <ResolutionRow
              key={option}
              badge={resolutionBadge(option)}
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
  badge,
  label,
  sublabel,
  selected,
  onPress,
}: {
  badge: string;
  label: string;
  sublabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.badgeTile, selected && styles.badgeTileSelected]}>
        <Text style={[styles.badgeLabel, selected && styles.badgeLabelSelected]}>{badge}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
        <Text style={styles.rowSublabel}>{sublabel}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Feather name="check" size={13} color={theme.colors.textOnAccent} /> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
  badgeTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: theme.colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  badgeTileSelected: {
    backgroundColor: theme.colors.accentSoft,
  },
  badgeLabel: {
    fontFamily: fonts.mono,
    fontSize: typography.caption,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: theme.colors.textSecondary,
  },
  badgeLabelSelected: {
    color: theme.colors.accent,
  },
  rowInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    fontSize: typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowLabelSelected: {
    fontWeight: '700',
    color: theme.colors.accent,
  },
  rowSublabel: {
    marginTop: 2,
    fontSize: typography.small,
    color: theme.colors.textSecondary,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
});
