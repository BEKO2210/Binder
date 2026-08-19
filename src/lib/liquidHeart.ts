// The maths behind the water in the Bind heart. Pure functions so the shape
// can be tested without a device, a canvas or a sensor.

export const LIQUID_FILL_RATIO = 0.62;
/**
 * The wave surface as an SVG path, filled to the bottom of the box.
 *
 * `phase` walks the wave sideways, `tilt` lifts one end of the surface, and
 * `fill` is how full
 * the heart is (never quite full — a full heart reads as a solid shape and the
 * whole point is that it moves).
 */
export function liquidPath(width: number, height: number, phase: number, tilt: number, fill = LIQUID_FILL_RATIO): string {
  const steps = 12;
  const amplitude = height * 0.045;
  const baseline = height * (1 - fill);
  const points: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const x = ratio * width;
    const wave = Math.sin(phase + ratio * Math.PI * 2) * amplitude;
    const lean = (ratio - 0.5) * tilt * height;
    points.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${(baseline + wave + lean).toFixed(2)}`);
  }
  return `${points.join(' ')} L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`;
}

/** The heart outline, scaled into a box of the given size. */
export function heartPath(size: number): string {
  const s = size / 100;
  const p = (value: number) => (value * s).toFixed(2);
  return `M${p(50)},${p(88)} C${p(20)},${p(66)} ${p(6)},${p(48)} ${p(6)},${p(33)} C${p(6)},${p(19)} ${p(17)},${p(10)} ${p(29)},${p(10)} C${p(38)},${p(10)} ${p(46)},${p(15)} ${p(50)},${p(23)} C${p(54)},${p(15)} ${p(62)},${p(10)} ${p(71)},${p(10)} C${p(83)},${p(10)} ${p(94)},${p(19)} ${p(94)},${p(33)} C${p(94)},${p(48)} ${p(80)},${p(66)} ${p(50)},${p(88)} Z`;
}
