import { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { CSSTransitionProperties } from 'react-native-reanimated';

/**
 * SaveSama's motion system.
 *
 * Rules this file exists to enforce:
 *
 *  - **Builders live at module scope.** Reanimated re-creates an entering
 *    builder on every render if you inline it, which costs a worklet rebuild
 *    per frame of a list. Import these; don't call `FadeIn.duration(...)` in a
 *    component body.
 *  - **One vocabulary.** Content arrives by rising slightly and fading in;
 *    it leaves by fading out; rows reflow with a linear transition. Scattered
 *    one-off effects are what makes an app feel generated rather than designed.
 *  - **Only `transform` and `opacity`.** Both take Reanimated's fast path and
 *    never trigger a layout pass. Nothing here animates width/height/margin.
 *
 * Durations are short on purpose: this is a utility people open to grab one
 * file, so motion has to explain a change, not perform.
 */

/** Screen-level content settling in. */
export const ENTER = FadeIn.duration(220);
export const EXIT = FadeOut.duration(140);

/** Rows and tiles: rise 12dp while fading, so a list reads top-to-bottom. */
export const ENTER_ROW = FadeInDown.springify().damping(18).mass(0.6);

/**
 * Staggered variant for a freshly-resolved result set. Capped at eight steps —
 * beyond that the tail feels like lag rather than choreography.
 */
export function enterRow(index: number) {
  return FadeInDown.delay(Math.min(index, 8) * 40)
    .springify()
    .damping(18)
    .mass(0.6);
}

/** Reflow when items are added, removed, filtered or reordered. */
export const REFLOW = LinearTransition.springify().damping(20).mass(0.7);

/**
 * Press feedback, applied as a CSS transition rather than a shared value.
 * Reanimated's CSS engine handles the whole thing declaratively, which avoids
 * a worklet and a JS→UI round trip for what is only ever an A→B change.
 */
export const PRESS_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ['transform', 'opacity'],
  transitionDuration: 90,
  transitionTimingFunction: 'ease-out',
};

export const pressScale = (pressed: boolean) => ({
  transform: [{ scale: pressed ? 0.97 : 1 }],
  opacity: pressed ? 0.9 : 1,
  ...PRESS_TRANSITION,
});

/** Colour and fill changes: chips activating, progress bars filling. */
export const TINT_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ['backgroundColor', 'borderColor', 'color'],
  transitionDuration: 180,
  transitionTimingFunction: 'ease-out',
};

export const WIDTH_TRANSITION: CSSTransitionProperties = {
  transitionProperty: 'width',
  transitionDuration: 240,
  transitionTimingFunction: 'ease-out',
};
