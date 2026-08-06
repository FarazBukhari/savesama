import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../ThemeProvider';
import { radius, spacing, Theme, typography } from '../theme';

type FeatherName = keyof typeof Feather.glyphMap;

const STEPS: { icon: FeatherName; text: string }[] = [
  {
    icon: 'share',
    text: 'Tap Share on an Instagram post, Threads post or YouTube video and pick Foxy',
  },
  { icon: 'clipboard', text: 'Or copy the link and hit Paste above' },
  { icon: 'download', text: 'Check what Foxy found, then save it to your gallery' },
];

export function EmptyState() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Getting started</Text>
      {STEPS.map((step) => (
        <View key={step.text} style={styles.row}>
          <View style={styles.tile}>
            <Feather name={step.icon} size={18} color={theme.colors.accent} />
          </View>
          <Text style={styles.step}>{step.text}</Text>
        </View>
      ))}
      <Text style={styles.note}>
        Instagram posts, reels and carousels; Threads posts; YouTube videos and Shorts.
      </Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      marginTop: spacing.xl,
    },
    label: {
      fontSize: typography.caption,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    tile: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: theme.colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    step: {
      flex: 1,
      color: theme.colors.text,
      fontSize: typography.body,
      lineHeight: 23,
    },
    note: {
      marginTop: spacing.lg,
      color: theme.colors.textSecondary,
      fontSize: typography.subtitle,
      lineHeight: 21,
    },
  });
