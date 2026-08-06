import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../ThemeProvider';
import { spacing, Theme, typography } from '../theme';

interface HeaderProps {
  title: string;
  /** One line under the title. Skip it when the screen speaks for itself. */
  subtitle?: string;
  /** Right-hand slot: a queue count, a view toggle, nothing. */
  right?: ReactNode;
}

/**
 * The screen title. It's set at display size and sits on open space rather
 * than in a bar — at 16px in a hairline-ruled strip it read as a breadcrumb,
 * and every screen opened looking like the middle of something.
 */
export function Header({ title, subtitle, right }: HeaderProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: typography.display,
      fontWeight: '800',
      letterSpacing: -1,
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: typography.subtitle + 1,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
    right: {
      flexShrink: 0,
    },
  });
