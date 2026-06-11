import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface ErrorNoticeProps {
  message: string;
}

export function ErrorNotice({ message }: ErrorNoticeProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  message: {
    color: colors.error,
    fontSize: typography.body,
    lineHeight: 20,
  },
});
