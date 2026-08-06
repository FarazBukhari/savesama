import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../ThemeProvider';
import { spacing, Theme, typography } from '../theme';

export type Tab = 'download' | 'saved' | 'settings';

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

type FeatherName = keyof typeof Feather.glyphMap;

const TABS: { key: Tab; label: string; icon: FeatherName }[] = [
  { key: 'download', label: 'Get', icon: 'download' },
  { key: 'saved', label: 'Saved', icon: 'grid' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

/**
 * Docked, not floating: the bottom edge already carries the ad band, and a
 * floating pill would hover over it and clip the last row of the Saved grid.
 * The active tab is marked by a rule along its top edge, not a filled pill.
 */
export function TabBar({ active, onChange }: TabBarProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.item,
              isActive && styles.itemActive,
              pressed && styles.pressed,
            ]}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Feather
              name={tab.icon}
              size={19}
              color={isActive ? theme.colors.accent : theme.colors.textSecondary}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xs,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderTopWidth: 2,
      borderTopColor: 'transparent',
      // Pull the 2px marker up over the bar's hairline so they don't stack.
      marginTop: -StyleSheet.hairlineWidth,
    },
    itemActive: {
      borderTopColor: theme.colors.accent,
    },
    pressed: {
      backgroundColor: theme.colors.sunken,
    },
    label: {
      fontSize: typography.small - 2,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    labelActive: {
      color: theme.colors.accent,
    },
  });
