import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';

import { formatDuration } from '@/lib/format';
import type { Platform } from '@/lib/links';
import { EDGE, radius, type as typeRoles, type Colors } from '@/lib/theme';
import { haptic, snack } from '@/state/ui';

import { Icon, PLATFORM_ICON } from './Icon';
import type { IconName } from './icons';
import { PressScale } from './Press';
import { T } from './Text';
import { useTheme } from './theme';

// ---------- Button (§10.1) ----------

export type ButtonVariant = 'primary' | 'tonal' | 'text' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  rec,
  loading,
  loadingLabel,
  disabled,
  big,
  full,
  compact,
  style,
  accessibilityLabel,
  ink: inkOverride,
}: {
  ink?: keyof Colors;
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  rec?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  big?: boolean;
  full?: boolean;
  compact?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const off = disabled || loading;
  const fill =
    disabled ? c.sunk : variant === 'primary' ? c.action : variant === 'tonal' ? c.sunk : variant === 'danger' ? c.errSoft : 'transparent';
  const ink: keyof Colors = inkOverride ?? (disabled ? 'ink3' : variant === 'primary' ? 'onAction' : variant === 'danger' ? 'err' : 'ink');
  const height = big ? 56 : compact ? 40 : 48;
  return (
    <PressScale
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (loading && loadingLabel ? loadingLabel : label)}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      hitSlop={compact ? 4 : undefined}
      style={[
        {
          height,
          paddingHorizontal: variant === 'text' ? 12 : compact ? 16 : 20,
          borderRadius: radius.pill,
          backgroundColor: fill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size={20} color={c[ink]} />
      ) : rec && !disabled ? (
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.recOnAction }} />
      ) : icon ? (
        <Icon name={icon} size={20} color={ink} />
      ) : null}
      <T
        role="label"
        color={ink}
        style={[
          big && { fontSize: 17 },
          variant === 'text' && !disabled && { textDecorationLine: 'underline' },
        ]}
        numberOfLines={1}
      >
        {loading && loadingLabel ? loadingLabel : label}
      </T>
    </PressScale>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  color = 'ink',
  tint,
  tonal,
  size = 24,
  weight,
}: {
  name: IconName;
  label: string;
  onPress?: () => void;
  color?: keyof Colors;
  tint?: string;
  tonal?: boolean;
  size?: number;
  weight?: 'regular' | 'bold' | 'fill';
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.ripple, borderless: true, radius: 24 }}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tonal ? (pressed ? c.pressed : c.sunk) : pressed ? c.ripple : 'transparent',
      })}
    >
      <Icon name={name} size={size} color={color} tint={tint} weight={weight} />
    </Pressable>
  );
}

// ---------- Chip (§10.4) ----------

export function Chip({
  label,
  selected,
  onPress,
  disabled,
  role = 'radio',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  role?: 'radio' | 'checkbox';
}) {
  const { c } = useTheme();
  return (
    <PressScale
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: radius.sm,
        backgroundColor: selected ? c.select : c.sunk,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {selected ? <Icon name="Check" size={16} color="onSelect" weight="bold" /> : null}
      <T role="metaStrong" color={selected ? 'onSelect' : disabled ? 'ink3' : 'ink'}>
        {label}
      </T>
    </PressScale>
  );
}

// ---------- Segmented (§10.5) ----------

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ backgroundColor: c.sunk, borderRadius: radius.pill, padding: 4, flexDirection: 'row', minHeight: 48 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!on) haptic.select();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: radius.pill,
              backgroundColor: on ? c.select : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
            }}
          >
            <T role="label" color={on ? 'onSelect' : 'ink2'} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Switch (§10.15) ----------

export function SwitchMark({ on }: { on: boolean }) {
  const { c } = useTheme();
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(on ? 1 : 0, { duration: 160 });
  }, [on, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: 4 + x.value * 20 }] }));
  return (
    <View
      style={{
        width: 52,
        height: 32,
        borderRadius: 16,
        backgroundColor: on ? c.select : c.sunk,
        borderWidth: on ? 0 : 2,
        borderColor: c.ink3,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          {
            width: on ? 24 : 16,
            height: on ? 24 : 16,
            borderRadius: 12,
            backgroundColor: on ? c.onSelect : c.ink3,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: on ? 0 : 2,
          },
          thumb,
        ]}
      >
        {on ? <Icon name="Check" size={14} tint={c.select} weight="bold" /> : null}
      </Animated.View>
    </View>
  );
}

// ---------- Banner (§10.8) ----------

export type BannerTone = 'warn' | 'err' | 'ok' | 'info';

export function Banner({
  tone,
  icon,
  title,
  body,
  children,
  onDeck,
  style,
}: {
  tone: BannerTone;
  icon: IconName;
  title: string;
  body?: ReactNode;
  children?: ReactNode;
  onDeck?: boolean;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  const fill = onDeck ? c.deckWell : tone === 'warn' ? c.warnSoft : tone === 'err' ? c.errSoft : tone === 'ok' ? c.okSoft : c.sunk;
  const iconColor: keyof Colors = tone === 'info' ? 'ink2' : tone;
  return (
    <View
      accessibilityRole={tone === 'err' ? 'alert' : undefined}
      style={[{ backgroundColor: fill, borderRadius: radius.banner, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12 }, style]}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T role="bodyStrong">{title}</T>
        {typeof body === 'string' ? <T role="meta">{body}</T> : body}
        {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginLeft: -12, marginTop: 4 }}>{children}</View> : null}
      </View>
    </View>
  );
}

// ---------- Section title, list group, rows (§10.14) ----------

export function SectionTitle({ title, trailing, meta, style }: { title: string; trailing?: ReactNode; meta?: string; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: EDGE, marginTop: 24, marginBottom: 8, minHeight: 32 }, style]}>
      <T role="title" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </T>
      {meta ? <T role="meta" color="ink2">{meta}</T> : null}
      {trailing ? <View style={{ marginRight: -12 }}>{trailing}</View> : null}
    </View>
  );
}

export function GroupLabel({ title }: { title: string }) {
  return (
    <T role="metaStrong" color="ink2" accessibilityRole="header" style={{ paddingHorizontal: EDGE, marginTop: 24, marginBottom: 8 }}>
      {title}
    </T>
  );
}

export function ListGroup({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { c } = useTheme();
  return <View style={[{ marginHorizontal: 8, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.ground, gap: 2 }, style]}>{children}</View>;
}

export function ListRow({
  icon,
  iconNode,
  title,
  subtitle,
  value,
  trailing,
  onPress,
  role = 'button',
  checked,
  danger,
  chevron,
  accessibilityLabel,
}: {
  icon?: IconName;
  iconNode?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  role?: 'button' | 'switch' | 'radio';
  checked?: boolean;
  danger?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={role === 'button' ? undefined : { checked: !!checked }}
      android_ripple={{ color: c.ripple }}
      style={({ pressed }) => ({
        backgroundColor: pressed && onPress ? c.pressed : c.surface,
        minHeight: subtitle ? 64 : 56,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
      })}
    >
      {iconNode ?? (icon ? <Icon name={icon} color={danger ? 'err' : 'ink'} /> : null)}
      <View style={{ flex: 1 }}>
        <T role="body" color={danger ? 'err' : 'ink'}>
          {title}
        </T>
        {subtitle ? (
          <T role="meta" color="ink2">
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? <T role="meta" color="ink2">{value}</T> : null}
      {trailing}
      {chevron ? <Icon name="CaretRight" size={20} color="ink2" /> : null}
    </Pressable>
  );
}

// ---------- Empty state (§10.19) ----------

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: EDGE, gap: 4 }}>
      <View style={{ marginBottom: 8 }}>
        <Icon name={icon} size={32} color="ink2" />
      </View>
      <T role="title">{title}</T>
      <T role="body" color="ink2">
        {body}
      </T>
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}

// ---------- Skeleton (§10.20) ----------

export function Skeleton({ style }: { style: ViewStyle }) {
  const { c, reduced } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withTiming(0.55, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: c.sunk }, style, anim]} />;
}

// ---------- Code block (§10.18) ----------

export function CodeBlock({ code, fill }: { code: string; fill?: keyof Colors }) {
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <View style={{ backgroundColor: c[fill ?? 'sunk'], borderRadius: radius.md, paddingLeft: 16, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
      <T role="code" selectable style={[{ flex: 1, paddingVertical: 10 }, breakAnywhere]}>
        {code}
      </T>
      <IconButton
        name={copied ? 'Check' : 'Copy'}
        label={`Copy ${code}`}
        onPress={() => {
          void Clipboard.setStringAsync(code);
          setCopied(true);
          snack('Copied');
        }}
      />
    </View>
  );
}

// ---------- Form field (§10.17) ----------

export function Field({
  label,
  helper,
  error,
  trailing,
  ...input
}: TextInputProps & { label: string; helper?: string; error?: string | null; trailing?: ReactNode }) {
  const { c, scheme } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T role="metaStrong" color="ink2">
        {label}
      </T>
      <View
        style={{
          minHeight: 52,
          borderRadius: radius.md,
          backgroundColor: focus ? c.surface : c.sunk,
          borderWidth: 2,
          borderColor: error ? c.err : focus ? c.ink : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 14,
        }}
      >
        <TextInput
          {...input}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocus(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={scheme === 'light' ? c.ink2 : c.ink3}
          selectionColor={c.select}
          cursorColor={c.ink}
          maxFontSizeMultiplier={1.6}
          style={[typeRoles.body, { flex: 1, color: c.ink, paddingVertical: 12, paddingRight: 14 }, webNoOutline]}
        />
        {trailing}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name="WarningCircle" size={16} color="err" />
          <T role="meta" color="err" style={{ flex: 1 }}>
            {error}
          </T>
        </View>
      ) : helper ? (
        <T role="meta" color="ink2">
          {helper}
        </T>
      ) : null}
    </View>
  );
}

// Long commands and URLs must wrap inside code blocks instead of overflowing (web needs this).
const breakAnywhere = { wordBreak: 'break-all' } as unknown as TextStyle;

export const webNoOutline = { outlineStyle: 'none' } as unknown as ViewStyle;

// ---------- Thumbnail (§10.21) ----------

export function Thumb({
  uri,
  platform,
  size,
  width,
  height,
  rounded = radius.thumb,
  duration,
  pill,
  iconSize = 24,
  label,
}: {
  uri: string | null | undefined;
  platform?: Platform;
  size?: number;
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  duration?: number | null;
  pill?: string;
  iconSize?: number;
  label?: string;
}) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  // A new uri gets a fresh chance to load.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFailed(false), [uri]);
  const w = width ?? size;
  const h = height ?? size;
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      style={{ width: w, height: h, borderRadius: rounded, overflow: 'hidden', backgroundColor: c.sunk, alignItems: 'center', justifyContent: 'center' }}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : platform ? (
        <Icon name={PLATFORM_ICON[platform]} size={iconSize} color="ink3" />
      ) : null}
      {duration ? <MediaPill text={formatDuration(duration)} style={{ position: 'absolute', left: 6, bottom: 6 }} /> : null}
      {pill ? <MediaPill text={pill} style={{ position: 'absolute', left: 6, bottom: 6 }} /> : null}
    </View>
  );
}

export function MediaPill({ text, style }: { text: string; style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.mediaScrim, borderRadius: radius.xs, paddingHorizontal: 6, paddingVertical: 2 }, style]}>
      <T role="caption" color="mediaInk">
        {text}
      </T>
    </View>
  );
}

// ---------- Lamp (REC dot) ----------

export function Lamp({ live, size = 8 }: { live: boolean; size?: number }) {
  const { c, reduced } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    if (live && !reduced) o.value = withRepeat(withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
    else o.value = withTiming(1, { duration: 120 });
  }, [live, reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: live ? c.rec : c.ink3 }, anim]} />;
}
