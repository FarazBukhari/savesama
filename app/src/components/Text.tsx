import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { type Colors, type as typeRoles, type TypeRole } from '@/lib/theme';

import { useTheme } from './theme';

export interface TProps extends Omit<TextProps, 'role'> {
  role?: TypeRole;
  color?: keyof Colors;
  /** Raw colour, only for media overlays that sit on photos. */
  tint?: string;
  style?: TextStyle | (TextStyle | false | undefined | null)[];
}

export function T({ role = 'body', color = 'ink', tint, style, ...rest }: TProps) {
  const { c } = useTheme();
  const wide = role === 'display' || role === 'wordmark';
  return (
    <RNText
      maxFontSizeMultiplier={wide ? 1.3 : 1.6}
      {...rest}
      style={[typeRoles[role], { color: tint ?? c[color] }, style as TextStyle]}
    />
  );
}
