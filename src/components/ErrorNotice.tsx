import Feather from '@expo/vector-icons/Feather';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../ThemeProvider';
import { radius, spacing, Theme, typography } from '../theme';

interface ErrorNoticeProps {
  message: string;
  /** Optional headline above the message — use it to name the fix, not the fault. */
  title?: string;
  /** Action slot: "Sign in", "Retry". */
  action?: ReactNode;
  /**
   * 'error' is something that broke. 'prompt' is something the user can resolve
   * right now, like signing in — it reads in the accent, not in red.
   */
  tone?: 'error' | 'prompt';
}

export function ErrorNotice({ message, title, action, tone = 'error' }: ErrorNoticeProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isPrompt = tone === 'prompt';

  return (
    <View style={[styles.container, isPrompt && styles.prompt]} accessibilityRole="alert">
      <Feather
        name="alert-circle"
        size={18}
        color={isPrompt ? theme.colors.accent : theme.colors.error}
        style={styles.icon}
      />
      <View style={styles.copy}>
        {title ? <Text style={[styles.title, isPrompt && styles.titlePrompt]}>{title}</Text> : null}
        <Text style={[styles.message, title != null && styles.messageUnderTitle]}>{message}</Text>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      backgroundColor: theme.colors.errorSoft,
      borderWidth: 1,
      borderColor: theme.colors.error,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    prompt: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    icon: {
      marginTop: 1,
    },
    copy: {
      flex: 1,
    },
    title: {
      fontSize: typography.body,
      fontWeight: '700',
      color: theme.colors.error,
    },
    titlePrompt: {
      color: theme.colors.text,
    },
    message: {
      color: theme.colors.textSecondary,
      fontSize: typography.subtitle + 1,
      lineHeight: 21,
    },
    messageUnderTitle: {
      marginTop: 3,
    },
    action: {
      flexDirection: 'row',
      marginTop: spacing.sm + 1,
    },
  });
