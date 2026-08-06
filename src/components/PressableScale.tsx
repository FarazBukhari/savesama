import { ReactNode, useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Pressable, PressableProps } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { pressScale } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * The app-wide press affordance: a slight spring down while held.
 *
 * Two things matter here.
 *
 * **The style lands on the pressable itself.** The previous version applied it
 * to a wrapper inside the Pressable, so a `flex: 1` never reached the element
 * doing the layout — which is how "Get media" ended up painted wider than the
 * button clipping it.
 *
 * **The feedback is a CSS transition, not a shared value.** A press is a plain
 * A→B change, so it doesn't need a worklet or a JS→UI round trip; Reanimated's
 * CSS engine drives it entirely on the UI thread. Shared values are reserved
 * for continuous gestures.
 */
export function PressableScale({
  style,
  disabled,
  children,
  ...pressableProps
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <AnimatedPressable
      {...pressableProps}
      disabled={disabled}
      style={[style, pressScale(pressed && !disabled)]}
      onPressIn={(event) => {
        setPressed(true);
        pressableProps.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        pressableProps.onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
