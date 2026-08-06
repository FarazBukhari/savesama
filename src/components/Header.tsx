import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../ThemeProvider';
import { spacing, Theme, typography } from '../theme';

interface HeaderProps {
  title: string;
  /** Right-hand slot: a queue count, a view toggle, nothing. */
  right?: ReactNode;
}

/**
 * The screen's top bar. One hairline under it does the work a card shadow used
 * to — nothing on this screen floats.
 */
export function Header({ title, right }: HeaderProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.bar}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 46,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    title: {
      flexShrink: 1,
      fontSize: typography.headline,
      fontWeight: '800',
      letterSpacing: -0.3,
      color: theme.colors.text,
    },
    right: {
      marginLeft: spacing.md,
    },
  });
