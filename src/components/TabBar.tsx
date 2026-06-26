import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

export type Tab = 'download' | 'saved';

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: 'download', label: 'Download', glyph: '⬇' },
  { key: 'saved', label: 'Saved', glyph: '🗂' },
];

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.glyph, isActive && styles.activeText]}>{tab.glyph}</Text>
            <Text style={[styles.label, isActive && styles.activeText]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  glyph: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  label: {
    marginTop: 2,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeText: {
    color: colors.accent,
  },
});
