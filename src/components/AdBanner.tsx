import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../ThemeProvider';
import { AD_BANNER_HEIGHT, radius, spacing, Theme, typography } from '../theme';

interface AdBannerProps {
  bottomInset: number;
}

/**
 * Reserved slot for a future ad SDK banner (e.g. an AdMob adaptive banner).
 * Replace the inner placeholder with the ad component and keep the outer
 * container so the layout doesn't shift when ads go live.
 */
export function AdBanner({ bottomInset }: AdBannerProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View style={styles.placeholder}>
        <Text style={styles.label}>Ad space</Text>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    placeholder: {
      height: AD_BANNER_HEIGHT - spacing.lg,
      borderRadius: radius.sm,
      backgroundColor: theme.colors.sunken,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    label: {
      color: theme.colors.placeholder,
      fontSize: typography.caption,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
  });
