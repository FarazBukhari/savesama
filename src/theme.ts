import { Platform } from 'react-native';

/**
 * Foxy's design tokens.
 *
 * Principles:
 *  - Two themes, one shape. `lightTheme` and `darkTheme` fill the same `Theme`,
 *    so a screen never branches on the mode — it reads `theme.colors.*`.
 *  - Depth comes from a 1px `border`, not a shadow. Only things that genuinely
 *    float (sheets, modals) keep `shadows.raised`.
 *  - Anything the machine produced — URLs, resolutions, byte counts, transfer
 *    rates — is set in `fonts.mono`. Anything a human wrote stays in the UI face.
 *  - One accent. Success/error appear only as feedback, never decoration.
 *
 * Read a theme through `useTheme()` (see `src/ThemeProvider.tsx`); the values
 * below are only imported directly by the provider and by tests.
 */

export interface ThemeColors {
  background: string;
  /** Raised panels: the link field, queue container, modals. */
  card: string;
  /** Wells inside a card: icon tiles, progress tracks, disabled fills. */
  sunken: string;
  /** The hairline that does the work shadows used to. */
  border: string;
  accent: string;
  accentPressed: string;
  /** Tinted fill behind an accent value — chips, active segments. */
  accentSoft: string;
  text: string;
  textSecondary: string;
  textOnAccent: string;
  success: string;
  successSoft: string;
  error: string;
  errorSoft: string;
  /** Badges sitting on top of a thumbnail, where the art is unknown. */
  videoBadge: string;
  placeholder: string;
  /** Media overlays (play badges, duration chips). */
  overlay: string;
  /** Modal backdrop. */
  scrim: string;
}

export interface Theme {
  mode: 'light' | 'dark';
  colors: ThemeColors;
  shadows: {
    /** Sheets and modals — the only things allowed to float. */
    raised: {
      shadowColor: string;
      shadowOpacity: number;
      shadowRadius: number;
      shadowOffset: { width: number; height: number };
      elevation: number;
    };
  };
}

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#100E0D',
    card: '#1A1716',
    sunken: '#232020',
    border: '#2C2826',
    accent: '#FF7A3D',
    accentPressed: '#E8632A',
    accentSoft: 'rgba(255, 122, 61, 0.13)',
    text: '#F4F1ED',
    textSecondary: '#8C837A',
    textOnAccent: '#140C06',
    success: '#4FCB95',
    successSoft: 'rgba(79, 203, 149, 0.12)',
    error: '#FF6B60',
    errorSoft: 'rgba(255, 107, 96, 0.12)',
    videoBadge: 'rgba(8, 6, 4, 0.62)',
    placeholder: '#6B635C',
    overlay: 'rgba(0, 0, 0, 0.45)',
    scrim: 'rgba(0, 0, 0, 0.66)',
  },
  shadows: {
    raised: {
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
  },
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#F7F5F2',
    card: '#FFFFFF',
    sunken: '#EFEBE6',
    border: '#E3DED7',
    // Deliberately darker than the dark-mode accent: #FF7A3D only reaches 3.1:1
    // on white, which fails for the small bold figures it's used on.
    accent: '#D04E19',
    accentPressed: '#B54314',
    accentSoft: 'rgba(208, 78, 25, 0.10)',
    text: '#16120F',
    textSecondary: '#736A61',
    textOnAccent: '#FFFFFF',
    success: '#2E7D5B',
    successSoft: 'rgba(46, 125, 91, 0.10)',
    error: '#C0392F',
    errorSoft: 'rgba(192, 57, 47, 0.09)',
    videoBadge: 'rgba(8, 6, 4, 0.62)',
    placeholder: '#A39A90',
    overlay: 'rgba(0, 0, 0, 0.35)',
    scrim: 'rgba(20, 14, 8, 0.5)',
  },
  shadows: {
    raised: {
      shadowColor: '#3A2A1A',
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
  },
};

/* ── Theme-independent scales ─────────────────────────────────────────────
   These don't change between light and dark, so they stay module exports and
   screens keep importing them directly. */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Squarer than the old scale — a tool reads sharper than a toy. */
export const radius = {
  sm: 7,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  /** Screen titles in the top bar. */
  display: 26,
  title: 22,
  /** Card/section headings and primary row labels. */
  headline: 16,
  subtitle: 13,
  body: 15,
  small: 12,
  /** Overlines and tiny badges — pair with uppercase + letterSpacing. */
  caption: 11,
  /** Machine figures: byte counts, rates, resolutions. */
  figure: 10,
} as const;

export const fonts = {
  /** Machine output only. Human-written copy stays in the system UI face. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

/** Reserved height for the ad banner (AdMob adaptive banners are 50–60dp). */
export const AD_BANNER_HEIGHT = 60;
