import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SavedAsset, normalizeRenameStem } from '../services/library';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';
import { splitExtension } from './savedName';

interface RenameDialogProps {
  asset: SavedAsset | null;
  /** Set while the rename is in flight, so the button can't be double-tapped. */
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (asset: SavedAsset, stem: string) => void;
}

/**
 * Cross-platform rename prompt (`Alert.prompt` is iOS-only). The extension is shown
 * but not editable — it has to keep matching the file's type.
 */
export function RenameDialog({ asset, busy, error, onCancel, onSubmit }: RenameDialogProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [stem, setStem] = useState('');

  const current = asset?.filename ? splitExtension(asset.filename) : { stem: '', extension: null };

  useEffect(() => {
    setStem(current.stem);
    // Re-seed when a different asset is opened, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  if (!asset) return null;

  const cleaned = normalizeRenameStem(stem);
  const unchanged = cleaned === current.stem;
  const canSave = cleaned.length > 0 && !unchanged && !busy;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" />
        <View style={styles.card}>
          <Text style={styles.title}>Rename file</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={stem}
              onChangeText={setStem}
              autoFocus
              selectTextOnFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => canSave && onSubmit(asset, cleaned)}
              style={styles.input}
              placeholder="File name"
              placeholderTextColor={theme.colors.placeholder}
              accessibilityLabel="New file name"
            />
            {current.extension ? <Text style={styles.extension}>.{current.extension}</Text> : null}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.buttonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(asset, cleaned)}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                !canSave && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy }}
            >
              <Text style={[styles.buttonLabel, styles.buttonLabelPrimary]}>
                {busy ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      alignSelf: 'stretch',
      backgroundColor: theme.colors.card,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
      ...theme.shadows.raised,
    },
    title: {
      fontSize: typography.headline,
      fontWeight: '700',
      color: theme.colors.text,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      backgroundColor: theme.colors.sunken,
      paddingHorizontal: spacing.md,
    },
    input: {
      flex: 1,
      minHeight: MIN_TAP,
      fontSize: typography.body,
      color: theme.colors.text,
    },
    extension: {
      fontFamily: fonts.mono,
      fontSize: typography.subtitle,
      color: theme.colors.textSecondary,
    },
    error: {
      fontSize: typography.small,
      color: theme.colors.error,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    button: {
      minHeight: MIN_TAP,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPrimary: {
      backgroundColor: theme.colors.accent,
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.7,
    },
    buttonLabel: {
      fontSize: typography.body,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    buttonLabelPrimary: {
      color: theme.colors.textOnAccent,
    },
  });
