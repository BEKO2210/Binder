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

export const motion = {
  fast: 120,
  standard: 180,
  deliberate: 240,
} as const;

export const typography = {
  displayXL: { fontSize: 40, lineHeight: 44, fontWeight: '900' as const, letterSpacing: -1.4 },
  displayL: { fontSize: 34, lineHeight: 38, fontWeight: '900' as const, letterSpacing: -1.0 },
  heading: { fontSize: 26, lineHeight: 31, fontWeight: '800' as const, letterSpacing: -0.45 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' as const, letterSpacing: -0.2 },
  bodyL: { fontSize: 17, lineHeight: 25, fontWeight: '500' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '700' as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const },
  micro: { fontSize: 10, lineHeight: 13, fontWeight: '800' as const, letterSpacing: 1.2 },
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
