import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

const STEPS = [
  'Tap Share on any Instagram or Threads post and pick Foxy Downloader',
  'Or copy a post link and hit Paste above',
  'Preview the media, then save it straight to your gallery',
] as const;

export function EmptyState() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>How it works</Text>
      {STEPS.map((step, index) => (
        <View key={step} style={styles.row}>
          <View style={styles.bullet}>
            <Text style={styles.bulletLabel}>{index + 1}</Text>
          </View>
          <Text style={styles.step}>{step}</Text>
        </View>
      ))}
      <Text style={styles.note}>Works with public posts, reels, and carousels.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginTop: 1,
  },
  bulletLabel: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: '700',
  },
  step: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 21,
  },
  note: {
    marginTop: spacing.xs,
    color: colors.placeholder,
    fontSize: typography.small,
  },
});
