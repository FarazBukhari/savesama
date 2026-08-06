/**
 * Foxy's design tokens — a warm, brand-forward light theme.
 *
 * Principles:
 *  - Warm neutrals (paper background, ink text) so the fox-orange accent glows.
 *  - Depth from soft ambient shadows (`shadows.*`), not hairline borders.
 *  - One accent. Success/error appear only as feedback, never decoration.
 */
export const colors = {
  background: '#F7F4EF',
  card: '#FFFFFF',
  /** Sunken wells inside cards: input fields, progress tracks, icon tiles. */
  sunken: '#F2EDE6',
  accent: '#FF6A3D',
  accentPressed: '#E8552B',
  accentSoft: '#FFEFE7',
  text: '#1D1813',
  textSecondary: '#6F675E',
  textOnAccent: '#FFFFFF',
  border: '#EDE7DF',
  success: '#2FA866',
  successSoft: '#E7F6EE',
  error: '#D6453D',
  errorSoft: '#FCEDEC',
  videoBadge: '#1D1813',
  placeholder: '#A9A198',
  /** Media overlays (play badges, duration chips) on top of thumbnails. */
  overlay: 'rgba(20, 14, 8, 0.4)',
  /** Modal backdrop. */
  scrim: 'rgba(20, 14, 8, 0.5)',
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
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  /** Screen titles ("Foxy Downloader", "Settings", "Saved files"). */
  display: 26,
  title: 22,
  /** Card/section headings and primary row labels. */
  headline: 16,
  subtitle: 13,
  body: 15,
  small: 12,
  /** Overlines and tiny badges — pair with uppercase + letterSpacing. */
  caption: 11,
} as const;

/**
 * Elevation recipes: iOS shadow* props + Android `elevation` together, spread
 * into a style (`...shadows.card`). Warm shadow color keeps depth from going
 * grey on the paper background.
 */
export const shadows = {
  /** Resting cards. */
  card: {
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  /** Sheets, docks, and anything floating above cards. */
  raised: {
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  /** Primary accent CTAs — a soft brand glow. */
  glow: {
    shadowColor: '#FF6A3D',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const;

/** Reserved height for the future ad banner (AdMob adaptive banners are 50–60dp). */
export const AD_BANNER_HEIGHT = 60;
