export type SwipeDirection = 'left' | 'right';

export type SwipeDecision = SwipeDirection | null;

export const discoveryDeckPhysics = {
  distanceRatio: 0.24,
  velocityThreshold: 900,
  dismissDistanceRatio: 1.35,
  maximumRotationDegrees: 8,
  hingeOffsetRatio: 1.1,
  backCardScale: 0.965,
  backCardOpacity: 0.62,
  backCardOffsetRatio: 0.025,
  undoWindowMs: 5_000,
} as const;

export function decideSwipe(
  distanceX: number,
  velocityX: number,
  viewportWidth: number,
): SwipeDecision {
  'worklet';
  if (Math.abs(velocityX) >= discoveryDeckPhysics.velocityThreshold) {
    return velocityX > 0 ? 'right' : 'left';
  }

  const threshold = viewportWidth * discoveryDeckPhysics.distanceRatio;
  if (distanceX >= threshold) return 'right';
  if (distanceX <= -threshold) return 'left';
  return null;
}

export function advanceDeck<T>(deck: readonly T[]): T[] {
  return deck.slice(1);
}

export function isUndoWindowOpen(
  passedAtMs: number,
  nowMs: number,
  windowMs = discoveryDeckPhysics.undoWindowMs,
): boolean {
  const elapsed = nowMs - passedAtMs;
  return elapsed >= 0 && elapsed <= windowMs;
}
