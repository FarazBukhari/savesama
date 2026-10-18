import { type ReactNode } from 'react';
import { RefreshControl, View, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EDGE } from '@/lib/theme';

import { IconButton } from './controls';
import { T } from './Text';
import { useTheme } from './theme';

/** Tab screen with the large-title top app bar (§10.13) that collapses into a 64 dp bar. */
export function LargeTitleScreen({
  title,
  trailing,
  children,
  onRefresh,
  refreshing,
  contentStyle,
  header,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: ViewStyle;
  header?: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const small = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [40, 72], [0, 1], 'clamp') }));
  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[{ paddingTop: insets.top, paddingBottom: 32 }, contentStyle]}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} progressViewOffset={insets.top} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ height: 72 + 16, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: EDGE, paddingRight: 8, paddingBottom: 12 }}>
          <T role="display" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </T>
          {trailing ? <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: -8 }}>{trailing}</View> : null}
        </View>
        {header}
        {children}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top, height: insets.top + 64, backgroundColor: c.surface, justifyContent: 'center', paddingHorizontal: EDGE },
          small,
        ]}
      >
        <T role="title" numberOfLines={1}>
          {title}
        </T>
      </Animated.View>
    </View>
  );
}

/** Pushed screens: 64 dp bar with back. */
export function SmallBar({ title, onBack, tint, bg }: { title: string; onBack: () => void; tint?: string; bg?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: bg }}>
      <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 }}>
        <IconButton name="ArrowLeft" label="Back" onPress={onBack} tint={tint} />
        <T role="title" numberOfLines={1} tint={tint} style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </T>
      </View>
    </View>
  );
}
