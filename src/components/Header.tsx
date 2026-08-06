import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../theme';

interface HeaderProps {
  /** Defaults to the app's brand lockup. */
  title?: string;
  subtitle?: string;
  /** Emoji shown in the leading badge. */
  glyph?: string;
}

export function Header({
  title = 'Foxy Downloader',
  subtitle = 'Save videos, photos & reels from Instagram, Threads and YouTube',
  glyph = '🦊',
}: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeGlyph}>{glyph}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.md + 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.glow,
  },
  badgeGlyph: {
    fontSize: 26,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: typography.display,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: typography.subtitle,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
