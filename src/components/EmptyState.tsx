import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../theme';

const STEPS = [
  { glyph: '📤', text: 'Tap Share on any Instagram post or YouTube video and pick Foxy Downloader' },
  { glyph: '📋', text: 'Or copy a link and hit Paste above' },
  { glyph: '💾', text: 'Preview the media, then save it straight to your gallery' },
] as const;

export function EmptyState() {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroGlyph}>🦊</Text>
      </View>
      <Text style={styles.title}>Save anything in two taps</Text>

      {STEPS.map((step, index) => (
        <View key={step.text} style={[styles.row, index === 0 && styles.firstRow]}>
          <View style={styles.stepTile}>
            <Text style={styles.stepGlyph}>{step.glyph}</Text>
          </View>
          <Text style={styles.step}>{step.text}</Text>
        </View>
      ))}

      <Text style={styles.note}>
        Works with public Instagram posts, reels & carousels and YouTube videos.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  hero: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroGlyph: {
    fontSize: 36,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepGlyph: {
    fontSize: 18,
  },
  step: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 21,
  },
  note: {
    marginTop: spacing.md,
    color: colors.placeholder,
    fontSize: typography.small,
    textAlign: 'center',
  },
});
