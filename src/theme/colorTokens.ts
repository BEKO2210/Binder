import type { ContrastPair } from './contrast';

export type AccentThemeId = 'lime' | 'blue' | 'violet' | 'coral' | 'ice';

export const baseColors = {
  destructive: '#FF5A76', destructivePressed: '#E84B66', destructiveForeground: '#240A0F',
  destructiveSoftDark: '#211318', destructiveSoftLight: '#FFF0F3', warning: '#F3C969', warningPressed: '#D9AD4D', success: '#8EDB73',
  bind: '#F1274B',
} as const;

export const semanticPalettes = {
  dark: baseColors,
  light: { ...baseColors, bind: '#D81138', destructive: '#B42345', destructivePressed: '#941731', destructiveForeground: '#FFFFFF', warning: '#765600', warningPressed: '#634800', success: '#296719' },
} as const;

export const darkPalette = {
  canvas: '#090A0F', surface: '#12141B', surfaceElevated: '#181B24', surfacePressed: '#20232D', borderSubtle: '#2A2F3A', borderStrong: '#3A404D',
  textPrimary: '#F7F8F3', textSecondary: '#B6BBC4', textMuted: '#858C98', overlay: 'rgba(4,5,8,0.88)', scrim: 'rgba(0,0,0,0.48)', transparent: 'transparent',
} as const;

export const lightPalette = {
  canvas: '#F4F6F1', surface: '#FFFFFF', surfaceElevated: '#E9EDE5', surfacePressed: '#DFE4DA', borderSubtle: '#D5DAD0', borderStrong: '#B8C0B3',
  textPrimary: '#12140F', textSecondary: '#3D433A', textMuted: '#5C6458', overlay: 'rgba(16,18,13,0.76)', scrim: 'rgba(9,10,15,0.34)', transparent: 'transparent',
} as const;

export const accentThemes = {
  lime: { id: 'lime', label: 'Binder Lime', accent: '#C7FF4A', pressed: '#A8DE31', foreground: '#10120D', onDark: '#C7FF4A', onLight: '#486900' },
  blue: { id: 'blue', label: 'Electric Blue', accent: '#71A7FF', pressed: '#558BE3', foreground: '#0B111B', onDark: '#71A7FF', onLight: '#245493' },
  violet: { id: 'violet', label: 'Violet', accent: '#B39BFF', pressed: '#9277E8', foreground: '#120C20', onDark: '#B39BFF', onLight: '#6545A5' },
  coral: { id: 'coral', label: 'Coral', accent: '#FF8A78', pressed: '#E66D5D', foreground: '#21100D', onDark: '#FF8A78', onLight: '#9C382B' },
  ice: { id: 'ice', label: 'Ice', accent: '#76E6F7', pressed: '#59C7D7', foreground: '#091719', onDark: '#76E6F7', onLight: '#176472' },
} as const satisfies Record<AccentThemeId, { id: AccentThemeId; label: string; accent: string; pressed: string; foreground: string; onDark: string; onLight: string }>;

export function resolveAccentTheme(id: AccentThemeId, mode: 'dark' | 'light') {
  const accent = accentThemes[id];
  return { ...accent, onSurface: mode === 'light' ? accent.onLight : accent.onDark };
}

export function semanticContrastPairs(mode: 'dark' | 'light'): ContrastPair[] {
  const colors = mode === 'dark' ? darkPalette : lightPalette;
  const semantic = semanticPalettes[mode];
  const surfaces = [['canvas', colors.canvas], ['surface', colors.surface], ['surfaceElevated', colors.surfaceElevated]] as const;
  const pairs: ContrastPair[] = [];
  for (const [backgroundName, background] of surfaces) {
    for (const [foregroundName, foreground] of [
      ['textPrimary', colors.textPrimary], ['textSecondary', colors.textSecondary], ['textMuted', colors.textMuted],
      ['warning', semantic.warning], ['destructive', semantic.destructive], ['success', semantic.success],
    ] as const) pairs.push({ name: `${foregroundName}/${backgroundName}`, foreground, background, level: 'bodyText' });
  }
  pairs.push(
    { name: 'textPrimary/surfacePressed', foreground: colors.textPrimary, background: colors.surfacePressed, level: 'largeText' },
    { name: 'textSecondary/surfacePressed', foreground: colors.textSecondary, background: colors.surfacePressed, level: 'largeText' },
    { name: 'destructive/destructiveSoft', foreground: semantic.destructive, background: mode === 'dark' ? semantic.destructiveSoftDark : semantic.destructiveSoftLight, level: 'bodyText' },
    { name: 'destructiveButton/default', foreground: semantic.destructiveForeground, background: semantic.destructive, level: 'bodyText' },
    { name: 'destructiveButton/pressed', foreground: semantic.destructiveForeground, background: semantic.destructivePressed, level: 'bodyText' },
  );
  for (const accent of Object.values(accentThemes)) {
    const onSurface = mode === 'dark' ? accent.onDark : accent.onLight;
    for (const [backgroundName, background] of surfaces) pairs.push({ name: `${accent.id}.onSurface/${backgroundName}`, foreground: onSurface, background, level: 'bodyText' });
    pairs.push(
      { name: `${accent.id}.button/default`, foreground: accent.foreground, background: accent.accent, level: 'bodyText' },
      { name: `${accent.id}.button/pressed`, foreground: accent.foreground, background: accent.pressed, level: 'bodyText' },
      { name: `${accent.id}.control/surface`, foreground: onSurface, background: colors.surface, level: 'nonText' },
    );
  }
  return pairs;
}

function withOpacity(color: string, opacity: number): string {
  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!hex) throw new Error(`State contrast requires an opaque hex text colour: ${color}`);
  return `rgba(${Number.parseInt(hex[1] ?? '0', 16)},${Number.parseInt(hex[2] ?? '0', 16)},${Number.parseInt(hex[3] ?? '0', 16)},${opacity})`;
}

/** Interaction-state pairs kept separate from the base semantic matrix. */
export function semanticStateContrastPairs(mode: 'dark' | 'light', disabledOpacity: number): ContrastPair[] {
  const colors = mode === 'dark' ? darkPalette : lightPalette;
  const semantic = semanticPalettes[mode];
  const textColors = [
    ['textPrimary', colors.textPrimary], ['textSecondary', colors.textSecondary], ['textMuted', colors.textMuted],
    ['warning', semantic.warning], ['destructive', semantic.destructive], ['success', semantic.success],
    ...Object.values(accentThemes).map((accent) => [`${accent.id}.onSurface`, mode === 'dark' ? accent.onDark : accent.onLight] as const),
  ] as const;

  return [
    ...textColors.map(([name, foreground]) => ({ name: `${name}/surfacePressed`, foreground, background: colors.surfacePressed, level: 'bodyText' as const })),
    { name: 'textPrimary.disabled/surface', foreground: withOpacity(colors.textPrimary, disabledOpacity), background: colors.surface, level: 'bodyText' },
    { name: 'textPrimary.disabled/surfaceElevated', foreground: withOpacity(colors.textPrimary, disabledOpacity), background: colors.surfaceElevated, level: 'bodyText' },
    // Text over a photo is always drawn from the dark palette, in both
    // schemes: a photo is not a surface whose brightness the theme controls,
    // and light-mode text over a dark scrim was unreadable. The pairs are
    // measured the way the media surfaces actually draw them.
    { name: 'onMedia.textPrimary/overlay', foreground: darkPalette.textPrimary, background: colors.overlay, level: 'bodyText' },
    { name: 'onMedia.textSecondary/overlay', foreground: darkPalette.textSecondary, background: colors.overlay, level: 'bodyText' },
    // The scrim is the middle stop of the gradient, not a background: what sits
    // behind it is a photograph of unknown brightness. Measuring text against
    // it would mean measuring against an assumption. Text is placed where the
    // gradient has reached `overlay`, and that is the pair above.
  ];
}
