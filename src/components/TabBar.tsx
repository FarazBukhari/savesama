import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export type Tab = 'download' | 'saved' | 'settings';

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: 'download', label: 'Download', glyph: '⬇' },
  { key: 'saved', label: 'Saved', glyph: '🗂' },
  { key: 'settings', label: 'Settings', glyph: '⚙' },
];

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={styles.item}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            {({ pressed }) => (
              <View style={[styles.pill, isActive && styles.pillActive, pressed && styles.pressed]}>
                <Text style={[styles.glyph, isActive && styles.activeGlyph]}>{tab.glyph}</Text>
                <Text style={[styles.label, isActive && styles.activeText]}>{tab.label}</Text>
              </View>
            )}
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm - 2,
    paddingBottom: spacing.sm - 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    minWidth: 84,
  },
  pillActive: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.6,
  },
  glyph: {
    fontSize: 19,
    color: colors.textSecondary,
  },
  activeGlyph: {
    color: colors.accent,
  },
  label: {
    marginTop: 2,
    fontSize: typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeText: {
    color: colors.accent,
    fontWeight: '700',
  },
});
