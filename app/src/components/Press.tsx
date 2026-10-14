import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const standard = Easing.bezier(0.2, 0, 0, 1);

/** Pressable with the §8 press motion: scale 0.97 in 90 ms, back in 160 ms. */
export function PressScale({
  children,
  style,
  scaleTo = 0.97,
  ...rest
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const { reduced } = useTheme();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (!reduced) s.value = withTiming(scaleTo, { duration: 90, easing: standard });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withTiming(1, { duration: 160, easing: standard });
        rest.onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
