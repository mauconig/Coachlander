/**
 * Design tokens lifted verbatim from the Tempo design doc.
 * Every literal here appears in `Tempo App.dc.html` — do not invent new values,
 * add a token instead so the whole app moves together.
 */

export const color = {
  /** page canvas behind the device frame */
  canvas: '#050506',
  /** default screen background */
  screen: '#0A0A0C',
  /** cards and raised panels */
  surface: '#14141A',
  /** quieter panels (hints, dropzones) */
  surfaceAlt: '#0F0F13',
  /** keypad keys, avatars, inactive pills */
  raised: '#1C1C24',

  border: '#2A2A33',
  hairline: '#1C1C24',

  text: '#F5F5F7',
  textSoft: '#C9C9D1',
  textMuted: '#85858F',
  textFaint: '#5A5A64',

  /** primary accent */
  lime: '#E4FF1A',
  /** secondary accent / brand block */
  violet: '#4B2BF5',
  /** rest phase clock */
  violetSoft: '#8A7BFF',

  /** text that sits on top of lime */
  ink: '#0A0A0C',

  /** translucent layers used on violet and over-screen scrims */
  onViolet: 'rgba(255,255,255,0.75)',
  onVioletStrong: 'rgba(255,255,255,0.85)',
  onVioletFill: 'rgba(255,255,255,0.16)',
  scrim: 'rgba(5,5,6,0.74)',
  glass: 'rgba(10,10,12,0.72)',
} as const;

export const radius = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 24,
  huge: 26,
  sheet: 34,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Horizontal gutter used by every screen body in the design. */
export const GUTTER = 22;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
