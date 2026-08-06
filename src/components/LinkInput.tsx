import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, radius, spacing, Theme, typography } from '../theme';
import { PressableScale } from './PressableScale';

interface LinkInputProps {
  value: string;
  busy: boolean;
  onChangeText: (text: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
}

/**
 * The link the user pasted is machine output, so it's set in the mono face —
 * that's what makes a truncated URL scannable at a glance.
 */
export function LinkInput({ value, busy, onChangeText, onPaste, onSubmit }: LinkInputProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <View>
      <Text style={styles.label}>Source link</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Feather
          name="link"
          size={15}
          color={focused ? theme.colors.accent : theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="instagram.com/reel/…"
          placeholderTextColor={theme.colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={!busy}
        />
        {value.length > 0 && !busy ? (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear link"
          >
            <Feather name="x" size={15} color={theme.colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        <PressableScale style={styles.pasteButton} onPress={onPaste} disabled={busy}>
          <Feather name="clipboard" size={14} color={theme.colors.text} />
          <Text style={styles.pasteLabel}>Paste</Text>
        </PressableScale>
        <PressableScale
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          {busy ? (
            <>
              <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
              <Text style={styles.submitLabel}>Fetching…</Text>
            </>
          ) : (
            <>
              <Feather name="download" size={15} color={theme.colors.textOnAccent} />
              <Text style={styles.submitLabel}>Get media</Text>
            </>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    label: {
      fontSize: typography.figure,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
      marginBottom: spacing.sm,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md - 2,
      backgroundColor: theme.colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: spacing.md,
    },
    fieldFocused: {
      borderColor: theme.colors.accent,
    },
    input: {
      flex: 1,
      paddingVertical: spacing.md,
      fontSize: typography.subtitle,
      fontFamily: fonts.mono,
      color: theme.colors.text,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm + 1,
      marginTop: spacing.sm + 1,
    },
    pasteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      width: 104,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    pasteLabel: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: typography.subtitle + 1,
    },
    submitButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: theme.colors.accent,
    },
    submitDisabled: {
      opacity: 0.4,
    },
    submitLabel: {
      color: theme.colors.textOnAccent,
      fontWeight: '700',
      fontSize: typography.subtitle + 1,
    },
  });
