import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ENTER, EXIT, TINT_TRANSITION } from '../motion';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { fonts, MIN_TAP, radius, spacing, Theme, typography } from '../theme';
import { PressableScale } from './PressableScale';

interface LinkInputProps {
  value: string;
  busy: boolean;
  onChangeText: (text: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
}

export function LinkInput({ value, busy, onChangeText, onPaste, onSubmit }: LinkInputProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <View>
      <Animated.View
        style={[styles.field, focused && styles.fieldFocused, TINT_TRANSITION]}
      >
        <Feather
          name="link"
          size={18}
          color={focused ? theme.colors.accent : theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Paste a link"
          placeholderTextColor={theme.colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={!busy}
        />
        {value.length > 0 && !busy ? (
          <Animated.View entering={ENTER} exiting={EXIT}>
            <Pressable
              onPress={() => onChangeText('')}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Clear link"
            >
              <Feather name="x-circle" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>

      <View style={styles.actions}>
        <PressableScale
          style={styles.pasteButton}
          onPress={onPaste}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Paste from clipboard"
        >
          <Feather name="clipboard" size={17} color={theme.colors.text} />
          <Text style={styles.pasteLabel}>Paste</Text>
        </PressableScale>

        <PressableScale
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Get media from this link"
          accessibilityState={{ disabled: !canSubmit, busy }}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
          ) : (
            <Feather
              name="arrow-down-circle"
              size={19}
              // A faded accent fill with white text was unreadable when
              // disabled; the disabled state now goes neutral instead.
              color={canSubmit ? theme.colors.textOnAccent : theme.colors.textSecondary}
            />
          )}
          <Text
            style={[styles.submitLabel, !canSubmit && styles.submitLabelDisabled]}
            numberOfLines={1}
          >
            {busy ? 'Reading…' : 'Get media'}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      backgroundColor: theme.colors.card,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      paddingHorizontal: spacing.lg,
    },
    fieldFocused: {
      borderColor: theme.colors.accent,
    },
    input: {
      flex: 1,
      paddingVertical: spacing.md,
      fontSize: typography.body,
      fontFamily: fonts.mono,
      color: theme.colors.text,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.md - 2,
      marginTop: spacing.md,
    },
    pasteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm + 2,
      // Not flex: the label is short and fixed, so it keeps its width while
      // the primary action takes the rest of the row.
      paddingHorizontal: spacing.lg,
      minHeight: MIN_TAP + 8,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    pasteLabel: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: typography.body,
    },
    submitButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm + 2,
      minHeight: MIN_TAP + 8,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.accent,
    },
    submitDisabled: {
      backgroundColor: theme.colors.sunken,
    },
    submitLabel: {
      color: theme.colors.textOnAccent,
      fontWeight: '700',
      fontSize: typography.body,
    },
    submitLabelDisabled: {
      color: theme.colors.textSecondary,
    },
  });
