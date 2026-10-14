import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/lib/theme';
import { isActive } from '@/lib/jobState';
import { useJobRows } from '@/state/rows';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { T } from './Text';
import { useTheme } from './theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Grab', icon: 'Link' },
  activity: { label: 'Activity', icon: 'Pulse' },
  library: { label: 'Library', icon: 'Images' },
  server: { label: 'Server', icon: 'HardDrives' },
  settings: { label: 'Settings', icon: 'Gear' },
};

function Badge({ count, live }: { count: number; live: boolean }) {
  const { c, reduced } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    if (live && !reduced) o.value = withRepeat(withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
    else o.value = withTiming(1, { duration: 120 });
  }, [live, reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', zIndex: 2, top: -4, left: 36, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.badge, alignItems: 'center', justifyContent: 'center' },
        anim,
      ]}
    >
      <T role="caption" tint="#FFFFFF" style={{ fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold }} maxFontSizeMultiplier={1.2}>
        {count > 99 ? '99+' : String(count)}
      </T>
    </Animated.View>
  );
}

function Indicator({ active }: { active: boolean }) {
  const { c, reduced } = useTheme();
  const s = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    s.value = reduced ? (active ? 1 : 0) : withTiming(active ? 1 : 0, { duration: 240, easing: Easing.bezier(0.2, 0, 0, 1) });
  }, [active, reduced, s]);
  const anim = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scaleX: 0.5 + s.value * 0.5 }] }));
  return <Animated.View style={[{ position: 'absolute', width: 64, height: 32, borderRadius: 16, backgroundColor: c.select }, anim]} />;
}

export function TabBar({ state, navigation }: TabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const rows = useJobRows();
  const unfinished = rows.filter((r) => isActive(r.stage)).length;
  const live = rows.some((r) => r.live);
  return (
    <View style={{ backgroundColor: c.surface, paddingBottom: insets.bottom, flexDirection: 'row', height: 80 + insets.bottom }}>
      {state.routes.map((route, i) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === i;
        const a11y = route.name === 'activity' && unfinished ? `Activity, ${unfinished} in progress` : meta.label;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={a11y}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 12, gap: 4 }}
          >
            <View style={{ width: 64, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Indicator active={focused} />
              <View style={{ zIndex: 1 }}>
                <Icon name={meta.icon} color={focused ? 'onSelect' : 'ink2'} weight={focused ? 'fill' : 'regular'} />
              </View>
              {route.name === 'activity' && unfinished > 0 ? <Badge count={unfinished} live={live} /> : null}
            </View>
            <T
              role="caption"
              color={focused ? 'ink' : 'ink2'}
              style={focused ? { fontFamily: fonts.semibold } : undefined}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {meta.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
