import { useEffect, useRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { Tape } from '@/lib/jobState';
import type { Colors } from '@/lib/theme';

import { T } from './Text';
import { useTheme } from './theme';

const FLEX = [6, 3, 1];

function Span({ value, breathing, color, flex }: { value: number; breathing: boolean; color: string; flex: number }) {
  const { c, reduced } = useTheme();
  const scale = useSharedValue(value);
  const opacity = useSharedValue(1);
  const prev = useRef(value);
  useEffect(() => {
    // Never runs backwards, except a retry which resets to 0 instantly (§8).
    if (reduced || value < prev.current) scale.value = value;
    else scale.value = withTiming(value, { duration: 900, easing: Easing.linear });
    prev.current = value;
  }, [value, reduced, scale]);
  useEffect(() => {
    if (breathing && !reduced) {
      opacity.value = withRepeat(withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }
  }, [breathing, reduced, opacity]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ flex, height: 6, borderRadius: 3, backgroundColor: c.tapeTrack, overflow: 'hidden' }}>
      <Animated.View style={[{ flex: 1, borderRadius: 3, backgroundColor: color, transformOrigin: 'left' }, fill]} />
    </View>
  );
}

/** The signature tape line (§10.6): Server · To phone · Saved, sized 6:3:1. */
export function TapeLine({
  tape,
  text,
  labels = ['Server', 'To phone', 'Saved'],
  equal,
}: {
  tape: Tape;
  text: string;
  labels?: [string, string, string];
  equal?: boolean;
}) {
  const { c } = useTheme();
  const fillColor = tape.failed ? c.err : c.tapeFill;
  const lastStage = useRef(tape.current);
  useEffect(() => {
    if (lastStage.current !== tape.current && tape.current >= 0) AccessibilityInfo.announceForAccessibility(text);
    lastStage.current = tape.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce only when the stage changes
  }, [tape.current]);
  const labelColor = (i: number): keyof Colors => {
    if (tape.cancelled) return 'ink3';
    if (tape.failed && i === tape.current) return 'err';
    if (i === tape.current) return 'ink';
    if (i < tape.current || tape.spans[i] >= 1) return 'ink2';
    return 'ink3';
  };
  const flex = equal ? [1, 1, 1] : FLEX;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: tape.value, text }} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {tape.spans.map((v, i) => (
          <Span key={i} value={tape.cancelled ? 0 : v} breathing={tape.breathing === i} color={fillColor} flex={flex[i]} />
        ))}
      </View>
      {/* "Saved" is right-aligned to the end of the tape and may overhang its short span. */}
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <T role="caption" color={labelColor(0)} numberOfLines={1} style={{ flex: flex[0] }}>
          {labels[0]}
        </T>
        <T role="caption" color={labelColor(1)} numberOfLines={1} style={{ flex: flex[1] + flex[2], paddingRight: 44 }}>
          {labels[1]}
        </T>
        <T role="caption" color={labelColor(2)} numberOfLines={1} style={{ position: 'absolute', right: 0, top: 0 }}>
          {labels[2]}
        </T>
      </View>
    </View>
  );
}
