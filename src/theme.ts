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
    background: '#0B0A09',
    card: '#171514',
    sunken: '#221F1D',
    border: '#2F2A27',
    accent: '#FF7A3D',
    accentPressed: '#E8632A',
    accentSoft: 'rgba(255, 122, 61, 0.13)',
    text: '#F6F3EF',
    textSecondary: '#9C9289',
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
    // The ground sits a step below the card on purpose. When both were near
    // white the whole screen read as one flat value with nothing on it.
    background: '#EDEAE4',
    card: '#FFFFFF',
    sunken: '#E4DFD7',
    border: '#D7D0C6',
    // Deliberately darker than the dark-mode accent: #FF7A3D only reaches 3.1:1
    // on white, which fails for the small bold figures it's used on.
    accent: '#C9481A',
    accentPressed: '#AA3C14',
    accentSoft: 'rgba(208, 78, 25, 0.10)',
    text: '#141110',
    textSecondary: '#635B53',
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

/**
 * Sits on the 4pt grid and respects the mobile floor: body text never below
 * 16, secondary never below 14, and nothing at all below 12. The previous
 * scale ran 13/12/10 and read as fine print on a real device.
 */
export const typography = {
  /** Screen titles. */
  display: 32,
  title: 24,
  /** Section headings and primary row labels. */
  headline: 20,
  body: 16,
  subtitle: 14,
  small: 14,
  /** Overlines and badges — pair with uppercase + letterSpacing. */
  caption: 12,
  /** Machine figures: dimensions, counts, rates. */
  figure: 13,
} as const;

/**
 * Minimum hit area for anything tappable: 48dp covers Android's floor and
 * clears iOS's 44pt. Use `hitSlop` when the painted control is smaller than
 * the target — never shrink the target to match the paint.
 */
export const MIN_TAP = 48;

export const fonts = {
  /** Machine output only. Human-written copy stays in the system UI face. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

/** Reserved height for the ad banner (AdMob adaptive banners are 50–60dp). */
export const AD_BANNER_HEIGHT = 60;
