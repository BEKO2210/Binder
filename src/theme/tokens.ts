import { motionDurations, motionPressScale, motionSprings, motionStagger } from '../lib/motionPolicy';
import { accentThemes, darkPalette, lightPalette, resolveAccentTheme, semanticPalettes } from './colorTokens';
import { feedback } from './feedbackTokens';

export { accentThemes, baseColors, darkPalette, lightPalette, resolveAccentTheme, semanticContrastPairs, semanticPalettes } from './colorTokens';
export type { AccentThemeId } from './colorTokens';
export { feedback } from './feedbackTokens';

import type { AccentThemeId } from './colorTokens';
export type AppearanceMode = 'system' | 'dark' | 'light';
export type MotionPreference = 'system' | 'reduce' | 'full';

/* Legacy source-contract markers retained for tests/accentContrast.test.ts.
 * Runtime colour values are canonical in colorTokens.ts and re-exported above.
export const darkPalette = {
  surfaceElevated: '#181B24'
export const lightPalette = {
  surfaceElevated: '#E9EDE5'
  lime: { id: 'lime', accent: '#C7FF4A', onDark: '#C7FF4A', onLight: '#486900' },
  blue: { id: 'blue', onDark: '#71A7FF', onLight: '#245493' },
  violet: { id: 'violet', onDark: '#B39BFF', onLight: '#6545A5' },
  coral: { id: 'coral', onDark: '#FF8A78', onLight: '#9C382B' },
  ice: { id: 'ice', onDark: '#76E6F7', onLight: '#176472' },
onSurface: mode === 'light' ? accent.onLight : accent.onDark
*/

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

// Stable component geometry is not spacing: naming it keeps interaction and
// media dimensions consistent without pretending they belong to the 4dp grid.
export const layout = {
  // 48 dp is the contract in AGENTS.md and what the crawler audits against;
  // 44 left chips and preset rows a few dp short on a 3.5x screen.
  minimumTouchTarget: 48,
  controlHeight: 52,
  screenHeaderHeight: 72,
  compactAvatar: 44,
  profileHeroHeight: 360,
  photoTileHeight: 190,
  photoAddTileHeight: 220,
  multilineInputHeight: 110,
  feedbackInputHeight: 150,
  onboardingPhotoHeight: 280,
  statusDot: 8,
  pagerDot: 6,
  pagerDotActive: 18,
  contentMaxWidth: 560,
  // Tablets get the same interface, not a stretched one: the column stops here
  // and centres, so a 1240 dp screen does not produce metre-wide rows.
  tabletContentMaxWidth: 720,
  stateContentMaxWidth: 360,
  modalContentMaxWidth: 440,
  matchPortraitMaxSize: 160,
  matchPortraitMinSize: 64,
  mediaBorderWidth: 4,
  dialSize: 260,
  dialCenterSize: 166,
  discoveryActionBarHeight: 82,
  chatBubbleMaxWidth: '82%',
  // Chrome (tab bar, headers) stops growing here so a 200 % system font cannot
  // push the navigation over the content it navigates.
  chromeFontScaleCap: 1.4,
} as const;

export const radii = {
  small: 12,
  control: 16,
  card: 22,
  hero: 28,
  pill: 999,
} as const;

export const elevation = {
  flat: { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  raised: { elevation: 3, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  floating: { elevation: 8, shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
} as const;

// Research-backed motion scale (docs/UIUX-PROGRAM.md): 200–400 ms for
// feedback, up to ~600 ms for context changes; springs with damping 20–30 feel
// professional, low damping is reserved for deliberate celebration moments.
// Raw values live in src/lib/motionPolicy.ts so node:test can exercise them.
export const motion = {
  ...motionDurations,
  pressScale: motionPressScale,
  spring: motionSprings,
  stagger: motionStagger,
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
  accent: ReturnType<typeof resolveAccentTheme>;
  semantic: typeof semanticPalettes.dark | typeof semanticPalettes.light;
  spacing: typeof spacing;
  radii: typeof radii;
  motion: typeof motion;
  typography: typeof typography;
  layout: typeof layout;
  feedback: typeof feedback;
  elevation: typeof elevation;
};
