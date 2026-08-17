import { motionDurations, motionPressScale, motionSprings } from '../lib/motionPolicy';

export type AccentThemeId = 'lime' | 'blue' | 'violet' | 'coral' | 'ice';
export type AppearanceMode = 'system' | 'dark';
export type MotionPreference = 'system' | 'reduce' | 'full';

export const baseColors = {
  destructive: '#FF5A76',
  destructivePressed: '#E84B66',
  destructiveForeground: '#240A0F',
  destructiveSoftDark: '#211318',
  destructiveSoftLight: '#FFF0F3',
  warning: '#F3C969',
  warningPressed: '#D9AD4D',
  success: '#8EDB73',
} as const;

export const darkPalette = {
  canvas: '#090A0F',
  surface: '#12141B',
  surfaceElevated: '#181B24',
  surfacePressed: '#20232D',
  borderSubtle: '#2A2F3A',
  borderStrong: '#3A404D',
  textPrimary: '#F7F8F3',
  textSecondary: '#B6BBC4',
  textMuted: '#858C98',
  overlay: 'rgba(4,5,8,0.88)',
  scrim: 'rgba(0,0,0,0.48)',
  transparent: 'transparent',
} as const;

export const lightPalette = {
  canvas: '#F4F6F1',
  surface: '#FFFFFF',
  surfaceElevated: '#E9EDE5',
  surfacePressed: '#DFE4DA',
  borderSubtle: '#D5DAD0',
  borderStrong: '#B8C0B3',
  textPrimary: '#12140F',
  textSecondary: '#3D433A',
  textMuted: '#646D60',
  overlay: 'rgba(16,18,13,0.76)',
  scrim: 'rgba(9,10,15,0.34)',
  transparent: 'transparent',
} as const;

export const accentThemes = {
  lime: { id: 'lime', label: 'Binder Lime', accent: '#C7FF4A', pressed: '#A8DE31', foreground: '#10120D' },
  blue: { id: 'blue', label: 'Electric Blue', accent: '#71A7FF', pressed: '#558BE3', foreground: '#0B111B' },
  violet: { id: 'violet', label: 'Violet', accent: '#B39BFF', pressed: '#9277E8', foreground: '#120C20' },
  coral: { id: 'coral', label: 'Coral', accent: '#FF8A78', pressed: '#E66D5D', foreground: '#21100D' },
  ice: { id: 'ice', label: 'Ice', accent: '#76E6F7', pressed: '#59C7D7', foreground: '#091719' },
} as const satisfies Record<AccentThemeId, { id: AccentThemeId; label: string; accent: string; pressed: string; foreground: string }>;

export const spacing = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x8: 32,
  x10: 40,
  x12: 48,
  x16: 64,
  screen: 20,
} as const;

export const radii = {
  small: 12,
  control: 16,
  card: 22,
  hero: 28,
  pill: 999,
} as const;

// Research-backed motion scale (docs/UIUX-PROGRAM.md): 200–400 ms for
// feedback, up to ~600 ms for context changes; springs with damping 20–30 feel
// professional, low damping is reserved for deliberate celebration moments.
// Raw values live in src/lib/motionPolicy.ts so node:test can exercise them.
export const motion = {
  ...motionDurations,
  pressScale: motionPressScale,
  spring: motionSprings,
} as const;

export const fontFamilies = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
} as const;

export const typography = {
  displayXL: { fontFamily: fontFamilies.extraBold, fontSize: 40, lineHeight: 44, letterSpacing: -1.4 },
  displayL: { fontFamily: fontFamilies.extraBold, fontSize: 34, lineHeight: 38, letterSpacing: -1.0 },
  heading: { fontFamily: fontFamilies.extraBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.45 },
  title: { fontFamily: fontFamilies.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  bodyL: { fontFamily: fontFamilies.medium, fontSize: 17, lineHeight: 25 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.bold, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: fontFamilies.medium, fontSize: 11, lineHeight: 15 },
  micro: { fontFamily: fontFamilies.extraBold, fontSize: 10, lineHeight: 13, letterSpacing: 1.2 },
} as const;

export type BinderTheme = {
  mode: 'dark' | 'light';
  colors: typeof darkPalette | typeof lightPalette;
  accent: (typeof accentThemes)[AccentThemeId];
  semantic: typeof baseColors;
  spacing: typeof spacing;
  radii: typeof radii;
  motion: typeof motion;
  typography: typeof typography;
};
