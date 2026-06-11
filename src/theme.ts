export const colors = {
  background: '#F6F6F8',
  card: '#FFFFFF',
  accent: '#FF6A3D',
  accentPressed: '#E8552B',
  accentSoft: '#FFF0EA',
  text: '#1B1B1F',
  textSecondary: '#6E6E76',
  textOnAccent: '#FFFFFF',
  border: '#EAEAEE',
  success: '#2FA866',
  successSoft: '#E8F6EE',
  error: '#D6453D',
  errorSoft: '#FCEDEC',
  videoBadge: '#1B1B1F',
  placeholder: '#A6A6AE',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: 22,
  subtitle: 13,
  body: 15,
  small: 12,
} as const;

/** Reserved height for the future ad banner (AdMob adaptive banners are 50–60dp). */
export const AD_BANNER_HEIGHT = 60;
