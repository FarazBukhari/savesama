import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

export function Header() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        <Text>🦊 </Text>
        Foxy Downloader
      </Text>
      <Text style={styles.subtitle}>Save photos, videos & reels from Instagram</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.subtitle,
    color: colors.textSecondary,
  },
});
