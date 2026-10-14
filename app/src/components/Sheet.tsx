import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius } from '@/lib/theme';

import { useTheme } from './theme';

const decelerate = Easing.bezier(0.05, 0.7, 0.1, 1);
const accelerate = Easing.bezier(0.3, 0, 0.8, 0.15);

const SheetContext = createContext<{ close: () => void }>({ close: () => undefined });
export const useSheet = () => useContext(SheetContext);

/** Bottom sheet (§10.10): scrim, drag to dismiss, pinned footer, max 92% height. */
export function Sheet({
  children,
  footer,
  onClose,
  scroll = true,
  label,
}: {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  scroll?: boolean;
  label?: string;
}) {
  const { c, scheme, reduced } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [h, setH] = useState(winH);
  const ty = useSharedValue(reduced ? 0 : winH);
  const fade = useSharedValue(0);
  const [kb, setKb] = useState(0);

  useEffect(() => {
    if (reduced) {
      fade.value = withTiming(1, { duration: 120 });
    } else {
      ty.value = withTiming(0, { duration: 400, easing: decelerate });
      fade.value = withTiming(1, { duration: 240 });
    }
  }, [reduced, ty, fade]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const close = useCallback(() => {
    if (reduced) {
      fade.value = withTiming(0, { duration: 120 }, (done) => done && runOnJS(onClose)());
      return;
    }
    fade.value = withTiming(0, { duration: 240 });
    ty.value = withTiming(h + 40, { duration: 240, easing: accelerate }, (done) => done && runOnJS(onClose)());
  }, [reduced, fade, ty, h, onClose]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      ty.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (ty.value > h * 0.35 || e.velocityY > 900) {
        fade.value = withTiming(0, { duration: 240 });
        ty.value = withTiming(h + 40, { duration: 240, easing: accelerate }, (done) => done && runOnJS(onClose)());
      } else {
        ty.value = withSpring(0, { damping: 26, stiffness: 260 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }], opacity: reduced ? fade.value : 1 }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const bottomPad = Math.max(insets.bottom, kb > 0 && Platform.OS === 'android' ? 0 : insets.bottom);

  return (
    <SheetContext.Provider value={{ close }}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          accessibilityLabel={label}
          onLayout={(e) => setH(e.nativeEvent.layout.height)}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: kb,
              maxHeight: (winH - kb) * 0.92,
              backgroundColor: c.surface,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              elevation: 8,
              shadowColor: '#15140F',
              shadowOpacity: scheme === 'dark' ? 0.5 : 0.14,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: -8 },
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.ink3, opacity: 0.6 }} />
            </View>
          </GestureDetector>
          {scroll ? (
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: footer ? 8 : 16 + bottomPad }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ flexShrink: 1, paddingBottom: footer ? 0 : bottomPad }}>{children}</View>
          )}
          {footer ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + (kb ? 0 : bottomPad), backgroundColor: c.surface }}>{footer}</View>
          ) : null}
        </Animated.View>
      </View>
    </SheetContext.Provider>
  );
}
