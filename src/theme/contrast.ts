export type ContrastLevel = 'bodyText' | 'largeText' | 'nonText';

export type ContrastPair = {
  name: string;
  foreground: string;
  background: string;
  level: ContrastLevel;
};

export const minimumContrast: Record<ContrastLevel, number> = {
  bodyText: 4.5,
  largeText: 3,
  nonText: 3,
};

type Rgb = { red: number; green: number; blue: number; alpha: number };

function parseColor(color: string): Rgb {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) {
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
      alpha: 1,
    };
  }
  const rgba = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/i);
  if (rgba) {
    const [, red = '0', green = '0', blue = '0', alpha = '1'] = rgba;
    return { red: Number(red), green: Number(green), blue: Number(blue), alpha: Number(alpha) };
  }
  throw new Error(`Unsupported colour format: ${color}`);
}

function composite(foreground: Rgb, background: Rgb): Rgb {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  const channel = (front: number, back: number) => (front * foreground.alpha + back * background.alpha * (1 - foreground.alpha)) / alpha;
  return { red: channel(foreground.red, background.red), green: channel(foreground.green, background.green), blue: channel(foreground.blue, background.blue), alpha };
}

function relativeLuminance(color: Rgb): number {
  const linear = [color.red, color.green, color.blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

export function contrastRatio(foreground: string, background: string): number {
  const opaqueBackground = composite(parseColor(background), { red: 255, green: 255, blue: 255, alpha: 1 });
  const opaqueForeground = composite(parseColor(foreground), opaqueBackground);
  const first = relativeLuminance(opaqueForeground);
  const second = relativeLuminance(opaqueBackground);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
