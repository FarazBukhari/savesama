import type { IconWeight } from 'phosphor-react-native';

import type { Platform } from '@/lib/links';
import type { Colors } from '@/lib/theme';

import { icons, type IconName } from './icons';
import { useTheme } from './theme';

export function Icon({
  name,
  size = 24,
  color = 'ink',
  tint,
  weight = 'regular',
}: {
  name: IconName;
  size?: number;
  color?: keyof Colors;
  tint?: string;
  weight?: IconWeight;
}) {
  const { c } = useTheme();
  const Cmp = icons[name];
  return <Cmp size={size} color={tint ?? c[color]} weight={weight} />;
}

export const PLATFORM_ICON: Record<Platform, IconName> = {
  youtube: 'YoutubeLogo',
  instagram: 'InstagramLogo',
  tiktok: 'TiktokLogo',
  facebook: 'FacebookLogo',
  threads: 'ThreadsLogo',
};
