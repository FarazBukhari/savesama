import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface LinkInputProps {
  value: string;
  busy: boolean;
  onChangeText: (text: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
}

export function LinkInput({ value, busy, onChangeText, onPaste, onSubmit }: LinkInputProps) {
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <View style={styles.card}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder="Paste an Instagram link"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={!busy}
        />
        <Pressable
          style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
          onPress={onPaste}
          disabled={busy}
        >
          <Text style={styles.pasteLabel}>Paste</Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.submitButton,
          !canSubmit && styles.submitDisabled,
          pressed && canSubmit && styles.submitPressed,
        ]}
        onPress={onSubmit}
        disabled={!canSubmit}
      >
        {busy ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.submitLabel}>Get media</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.body,
    color: colors.text,
  },
  pasteButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pasteLabel: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: typography.body,
  },
  pressed: {
    opacity: 0.6,
  },
  submitButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitPressed: {
    backgroundColor: colors.accentPressed,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitLabel: {
    color: colors.textOnAccent,
    fontWeight: '700',
    fontSize: typography.body,
  },
});
