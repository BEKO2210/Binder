// Pure motion policy: the raw motion values and what applies once the user's
// reduce-motion choice is known. This module imports nothing so it can run
// directly under node:test; src/theme/tokens.ts re-exports these values into
// the theme.

export const motionDurations = {
  fast: 120,
  standard: 180,
  deliberate: 240,
  feedback: 260,
  entrance: 350,
  context: 600,
} as const;

export const motionPressScale = 0.97;

export const motionStagger = {
  step: 36,
  cap: 180,
} as const;

export const motionSprings = {
  professional: { damping: 26, stiffness: 320, mass: 1 },
  celebratory: { damping: 12, stiffness: 200, mass: 1 },
} as const;

export type MotionDurations = { [K in keyof typeof motionDurations]: number };

// Reduced motion collapses every duration to zero — state changes still
// happen, they just appear instantly instead of animating.
export function resolveDurations(reduceMotion: boolean): MotionDurations {
  if (!reduceMotion) return { ...motionDurations };
  return { fast: 0, standard: 0, deliberate: 0, feedback: 0, entrance: 0, context: 0 };
}

// Press feedback scales the control slightly; with reduced motion the scale
// stays at 1 and pressed color states carry the feedback alone.
export function resolvePressScale(reduceMotion: boolean): number {
  return reduceMotion ? 1 : motionPressScale;
}

export function resolveStaggerDelay(index: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  return Math.min(Math.max(0, Math.floor(index)) * motionStagger.step, motionStagger.cap);
}

export function resolveSpring(reduceMotion: boolean, flavor: 'professional' | 'celebratory') {
  // Under reduced motion a very stiff, fully damped spring finishes visually
  // instantly without a bounce.
  if (reduceMotion) return { damping: 100, stiffness: 1000, mass: 1 };
  return motionSprings[flavor];
}
