// The type scale, on its own, so node:test can read it without pulling the
// whole theme in behind it.

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
  eyebrow: { fontFamily: fontFamilies.extraBold, fontSize: 14, lineHeight: 19, letterSpacing: 1.1 },
} as const;

/**
 * The same scale with the tracking taken out.
 *
 * Letter spacing is a Latin idea. Arabic letters join, and pulling them apart
 * breaks the joins: `micro` and `eyebrow` push them 1.2 and 1.1 points apart,
 * which turns a word into a row of unconnected shapes, and the negative
 * tracking on the display sizes crushes them together instead. Nothing else
 * about the scale changes — same families, same sizes, same line heights.
 */
export const untrackedTypography = Object.fromEntries(
  Object.entries(typography).map(([name, style]) => [name, { ...style, letterSpacing: 0 }]),
) as { [K in keyof typeof typography]: (typeof typography)[K] & { letterSpacing: number } };
