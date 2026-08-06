import { ReactNode, useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Subtle by default — buttons should feel, not bounce. */
  scaleTo?: number;
  children: ReactNode;
}

/**
 * A Pressable that springs down slightly while pressed — the app-wide press
 * affordance. Runs on the native driver, so it stays smooth mid-download.
 */
export function PressableScale({
  style,
  scaleTo = 0.96,
  disabled,
  children,
  ...pressableProps
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) springTo(scaleTo);
        pressableProps.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        springTo(1);
        pressableProps.onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
