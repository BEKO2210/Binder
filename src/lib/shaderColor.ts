// The theme stores colours as CSS-ish strings; a fragment shader wants unit
// floats. Converting here keeps every colour in the shader a theme token
// rather than a literal, and keeps the conversion testable under node:test.

export type UnitRgba = readonly [number, number, number, number];

const hexPattern = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;
const rgbaPattern = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+)\s*)?\)$/i;

export function colorToUnitRgba(color: string): UnitRgba {
  const hex = color.match(hexPattern)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? hex.replace(/./g, (character) => character + character) : hex;
    const channel = (index: number) => Number.parseInt(expanded.slice(index * 2, index * 2 + 2), 16) / 255;
    return [channel(0), channel(1), channel(2), expanded.length === 8 ? channel(3) : 1];
  }
  const rgba = color.match(rgbaPattern);
  if (rgba) {
    const [, red = '0', green = '0', blue = '0', alpha] = rgba;
    const channel = (value: string) => clampUnit(Number(value) / 255);
    return [channel(red), channel(green), channel(blue), alpha === undefined ? 1 : clampUnit(Number(alpha))];
  }
  throw new Error(`Unsupported colour format for a shader uniform: ${color}`);
}

// Shader uniforms declared as float3 take the colour without its alpha.
export function colorToUnitRgb(color: string): readonly [number, number, number] {
  const [red, green, blue] = colorToUnitRgba(color);
  return [red, green, blue];
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
