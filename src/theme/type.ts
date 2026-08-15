import type { TextStyle } from 'react-native';

import { color } from './tokens';

/**
 * Font family keys registered in `app/_layout.tsx`.
 * The design uses Archivo for display, Space Grotesk for UI text and
 * Space Mono for labels, counters and anything numeric-technical.
 */
export const font = {
  displayBlack: 'Archivo_900Black',
  displayXBold: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  displaySemi: 'Archivo_600SemiBold',
  displayMedium: 'Archivo_500Medium',

  uiBold: 'SpaceGrotesk_700Bold',
  uiSemi: 'SpaceGrotesk_600SemiBold',
  uiMedium: 'SpaceGrotesk_500Medium',
  ui: 'SpaceGrotesk_400Regular',

  monoBold: 'SpaceMono_700Bold',
  mono: 'SpaceMono_400Regular',
} as const;

/**
 * The design doc expresses tracking in `em`; React Native wants points.
 * Keeping the conversion explicit means a size change can't silently
 * desynchronise the tracking.
 */
const track = (size: number, em: number) => Math.round(size * em * 100) / 100;

export const type = {
  /** 54px hero — welcome screen only */
  heroXL: {
    fontFamily: font.displayXBold,
    fontSize: 54,
    lineHeight: 50,
    letterSpacing: track(54, -0.045),
    color: color.text,
  },
  /** 42px — success / milestone headings */
  hero: {
    fontFamily: font.displayXBold,
    fontSize: 42,
    lineHeight: 41,
    letterSpacing: track(42, -0.04),
    color: color.text,
  },
  /** 34px — primary screen heading */
  h1: {
    fontFamily: font.displayXBold,
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: track(34, -0.035),
    color: color.text,
  },
  /** 30px — section heading, tab-screen title */
  h2: {
    fontFamily: font.displayXBold,
    fontSize: 30,
    lineHeight: 30,
    letterSpacing: track(30, -0.03),
    color: color.text,
  },
  /** 26px — card heading */
  h3: {
    fontFamily: font.displayXBold,
    fontSize: 26,
    lineHeight: 27,
    letterSpacing: track(26, -0.03),
    color: color.text,
  },
  /** 21px — sheet heading, list heading */
  h4: {
    fontFamily: font.displayXBold,
    fontSize: 21,
    lineHeight: 24,
    letterSpacing: track(21, -0.02),
    color: color.text,
  },
  /** 18px — inline emphasis title */
  h5: {
    fontFamily: font.displayXBold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: track(18, -0.02),
    color: color.text,
  },

  /** big numerals inside stat cards */
  stat: {
    fontFamily: font.displayXBold,
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: track(24, -0.02),
    color: color.text,
  },
  statSm: {
    fontFamily: font.displayXBold,
    fontSize: 20,
    lineHeight: 23,
    color: color.text,
  },
  /** the session clock */
  clock: {
    fontFamily: font.displayXBold,
    fontSize: 76,
    lineHeight: 76,
    letterSpacing: track(76, -0.05),
    color: color.lime,
  },

  /** primary button label */
  button: {
    fontFamily: font.displayXBold,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: track(17, -0.01),
    color: color.ink,
  },
  buttonLg: {
    fontFamily: font.displayXBold,
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: track(20, -0.02),
    color: color.ink,
  },
  /** social / secondary button label */
  buttonUi: {
    fontFamily: font.uiBold,
    fontSize: 16,
    lineHeight: 20,
    color: color.text,
  },

  /** list row title */
  rowTitle: {
    fontFamily: font.uiSemi,
    fontSize: 15,
    lineHeight: 19,
    color: color.text,
  },
  /** body copy */
  body: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 21,
    color: color.textMuted,
  },
  bodyLg: {
    fontFamily: font.ui,
    fontSize: 15,
    lineHeight: 23,
    color: color.textMuted,
  },
  /** body copy that reads as content rather than helper text */
  prose: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 22,
    color: color.textSoft,
  },
  bodyStrong: {
    fontFamily: font.uiSemi,
    fontSize: 14,
    lineHeight: 19,
    color: color.text,
  },

  /** ALL-CAPS mono eyebrow — the workhorse label of this design */
  label: {
    fontFamily: font.monoBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: track(10, 0.16),
    color: color.textMuted,
  },
  labelSm: {
    fontFamily: font.monoBold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: track(9, 0.18),
    color: color.textFaint,
  },
  /** mono label without the wide tracking (counters, percentages) */
  labelTight: {
    fontFamily: font.monoBold,
    fontSize: 11,
    lineHeight: 14,
    color: color.textMuted,
  },
  /** eyebrow above a group of cards */
  eyebrow: {
    fontFamily: font.monoBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: track(11, 0.14),
    color: color.textMuted,
  },
  /** secondary metadata under a row title */
  meta: {
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: 17,
    color: color.textMuted,
  },
  metaSm: {
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: 14,
    color: color.textMuted,
  },
  /** numeric input display */
  numeric: {
    fontFamily: font.monoBold,
    fontSize: 17,
    lineHeight: 22,
    color: color.text,
  },
  numericLg: {
    fontFamily: font.monoBold,
    fontSize: 26,
    lineHeight: 32,
    color: color.text,
  },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;
