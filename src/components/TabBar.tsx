import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { TINT_TRANSITION } from '../motion';
import { useTheme, useThemedStyles } from '../ThemeProvider';
import { MIN_TAP, radius, spacing, Theme, typography } from '../theme';

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

const INDICATOR_TRANSITION = {
  transitionProperty: 'transform',
  transitionDuration: 260,
  transitionTimingFunction: 'ease-out',
} as const;

/**
 * Docked, not floating: the bottom edge already carries the ad band, and a
 * floating pill would hover over it and clip the last row of the Saved grid.
 *
 * The active marker is one bar that slides between tabs rather than three that
 * blink on and off — the movement is what tells you which way you went.
 */
export function TabBar({ active, onChange }: TabBarProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [barWidth, setBarWidth] = useState(0);

  const activeIndex = TABS.findIndex((tab) => tab.key === active);
  const tabWidth = barWidth / TABS.length;

  const onLayout = (event: LayoutChangeEvent) => setBarWidth(event.nativeEvent.layout.width);

  return (
    <View style={styles.bar} onLayout={onLayout}>
      {barWidth > 0 ? (
        <Animated.View
          style={[
            styles.indicator,
            {
              width: tabWidth,
              transform: [{ translateX: Math.max(activeIndex, 0) * tabWidth }],
            },
            INDICATOR_TRANSITION,
          ]}
          pointerEvents="none"
        />
      ) : null}

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
            <Feather
              name={tab.icon}
              size={22}
              color={isActive ? theme.colors.accent : theme.colors.textSecondary}
            />
            <Animated.Text
              style={[styles.label, isActive && styles.labelActive, TINT_TRANSITION]}
            >
              {tab.label}
            </Animated.Text>
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
    indicator: {
      position: 'absolute',
      top: 0,
      left: 0,
      height: 2,
      backgroundColor: theme.colors.accent,
      borderBottomLeftRadius: radius.pill,
      borderBottomRightRadius: radius.pill,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 1,
      minHeight: MIN_TAP + 8,
      paddingTop: spacing.sm + 2,
      paddingBottom: spacing.md,
    },
    label: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    labelActive: {
      color: theme.colors.accent,
    },
  });
