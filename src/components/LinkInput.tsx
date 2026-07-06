import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../theme';
import { PressableScale } from './PressableScale';

interface LinkInputProps {
  value: string;
  busy: boolean;
  onChangeText: (text: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
}

export function LinkInput({ value, busy, onChangeText, onPaste, onSubmit }: LinkInputProps) {
  const [focused, setFocused] = useState(false);
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <View style={styles.card}>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <Text style={styles.linkGlyph}>🔗</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Paste an Instagram or YouTube link"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={!busy}
        />
        <PressableScale style={styles.pasteButton} onPress={onPaste} disabled={busy}>
          <Text style={styles.pasteLabel}>Paste</Text>
        </PressableScale>
      </View>
      <PressableScale
        style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.textOnAccent} size="small" />
            <Text style={[styles.submitLabel, styles.busyLabel]}>Fetching…</Text>
          </View>
        ) : (
          <Text style={styles.submitLabel}>Get media</Text>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputRowFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  linkGlyph: {
    fontSize: typography.subtitle,
    marginRight: spacing.sm,
    opacity: 0.55,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: typography.body,
    color: colors.text,
  },
  pasteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  pasteLabel: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.subtitle,
  },
  submitButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...shadows.glow,
  },
  submitDisabled: {
    opacity: 0.35,
    elevation: 0,
    shadowOpacity: 0,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  busyLabel: {
    marginLeft: spacing.sm,
  },
  submitLabel: {
    color: colors.textOnAccent,
    fontWeight: '700',
    fontSize: typography.headline,
    letterSpacing: 0.2,
  },
});
