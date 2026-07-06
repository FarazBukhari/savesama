import { StyleSheet, Text, View } from 'react-native';

import { AD_BANNER_HEIGHT, colors, radius, spacing } from '../theme';

interface AdBannerProps {
  bottomInset: number;
}

/**
 * Reserved slot for a future ad SDK banner (e.g. an AdMob adaptive banner).
 * Replace the inner placeholder with the ad component and keep the outer
 * container so the layout doesn't shift when ads go live.
 */
export function AdBanner({ bottomInset }: AdBannerProps) {
  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View style={styles.placeholder}>
        <Text style={styles.label}>Ad space</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  placeholder: {
    height: AD_BANNER_HEIGHT - spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.placeholder,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
