import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface ErrorNoticeProps {
  message: string;
}

export function ErrorNotice({ message }: ErrorNoticeProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconWell}>
        <Text style={styles.icon}>!</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  iconWell: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginTop: 1,
  },
  icon: {
    color: colors.textOnAccent,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  message: {
    flex: 1,
    color: colors.error,
    fontSize: typography.body,
    lineHeight: 20,
  },
});
