export type Scheme = 'light' | 'dark';

const light = {
  ground: '#F3F3EF',
  surface: '#FFFFFF',
  sunk: '#E7E7E1',
  pressed: '#DCDCD5',
  ink: '#15140F',
  ink2: '#56554D',
  ink3: '#6B6A61',
  deck: '#FFD12E',
  onDeck: '#15140F',
  onDeck2: '#4F4A2A',
  deckWell: '#FFFFFF',
  action: '#15140F',
  onAction: '#FFFFFF',
  select: '#FFD12E',
  onSelect: '#15140F',
  tapeTrack: '#D6D5CD',
  tapeFill: '#15140F',
  rec: '#E0301A',
  recOnAction: '#E0301A',
  badge: '#E0301A',
  ok: '#1A6E43',
  okOnDeck: '#1A6E43',
  okSoft: '#DDEFE3',
  warn: '#8A5A00',
  warnSoft: '#F7EBCF',
  err: '#B3261E',
  errSoft: '#F9DEDC',
  snackAction: '#FFD12E',
  scrim: 'rgba(21,20,15,0.42)',
  mediaScrim: 'rgba(10,10,8,0.62)',
  mediaInk: '#FFFFFF',
  viewerBg: '#000000',
  ripple: 'rgba(21,20,15,0.10)',
  placeholderOnSunk: '#56554D',
  pillOnDeck: 'rgba(21,20,15,0.09)',
};

export type Colors = typeof light;

const dark: Colors = {
  ground: '#111110',
  surface: '#1C1C1A',
  sunk: '#262624',
  pressed: '#31312E',
  ink: '#F2F1EA',
  ink2: '#A9A89E',
  ink3: '#8F8E85',
  deck: '#F0C52B',
  onDeck: '#15140F',
  onDeck2: '#4A4524',
  deckWell: '#1C1C1A',
  action: '#F2F1EA',
  onAction: '#15140F',
  select: '#FFD12E',
  onSelect: '#15140F',
  tapeTrack: '#33332F',
  tapeFill: '#FFD12E',
  rec: '#FF5A43',
  recOnAction: '#C42B17',
  badge: '#C42B17',
  ok: '#6FD49B',
  okOnDeck: '#1A6E43',
  okSoft: '#1D3326',
  warn: '#F5C062',
  warnSoft: '#3A2F14',
  err: '#FFB4AB',
  errSoft: '#3D1E1B',
  snackAction: '#8A5A00',
  scrim: 'rgba(0,0,0,0.60)',
  mediaScrim: 'rgba(0,0,0,0.62)',
  mediaInk: '#FFFFFF',
  viewerBg: '#000000',
  ripple: 'rgba(242,241,234,0.10)',
  placeholderOnSunk: '#8F8E85',
  pillOnDeck: 'rgba(21,20,15,0.09)',
};

export const palettes: Record<Scheme, Colors> = { light, dark };

export const space = { s2: 2, s4: 4, s8: 8, s12: 12, s16: 16, s20: 20, s24: 24, s32: 32, s40: 40, s56: 56 } as const;
export const radius = { xs: 4, sm: 10, thumb: 12, md: 14, banner: 16, lg: 20, sheet: 28, pill: 999 } as const;
export const EDGE = 20;

export const motion = {
  short: 120,
  medium: 240,
  long: 400,
  pulse: 1600,
} as const;

export const fonts = {
  display: 'Michroma_400Regular',
  regular: 'SchibstedGrotesk_400Regular',
  medium: 'SchibstedGrotesk_500Medium',
  semibold: 'SchibstedGrotesk_600SemiBold',
  bold: 'SchibstedGrotesk_700Bold',
} as const;

const tnum = { fontVariant: ['tabular-nums' as const] };

export const type = {
  display: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  wordmark: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  headline: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  title: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  bodyLarge: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  // Schibsted's tnum also widens '.' and ':', which reads as stray spaces in links and sizes,
  // so tabular figures are kept to captions (pills, tape legend, player times).
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  metaStrong: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2, ...tnum },
  code: { fontFamily: 'monospace', fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
} as const;

export type TypeRole = keyof typeof type;
