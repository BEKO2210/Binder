export type SwipeDirection = 'left' | 'right';

export type SwipeDecision = SwipeDirection | null;

export const discoveryDeckPhysics = {
  distanceRatio: 0.24,
  velocityThreshold: 900,
  projectionSeconds: 0.16,
  edgeRatio: 0.72,
  edgeResistance: 0.28,
  dismissDistanceRatio: 1.35,
  maximumRotationDegrees: 8,
  hingeOffsetRatio: 1.1,
  backCardScale: 0.965,
  backCardOpacity: 0.62,
  backCardOffsetRatio: 0.025,
  undoWindowMs: 5_000,
} as const;

export function resistedTranslation(distanceX: number, viewportWidth: number): number {
  'worklet';
  const edge = viewportWidth * discoveryDeckPhysics.edgeRatio;
  const magnitude = Math.abs(distanceX);
  if (magnitude <= edge) return distanceX;
  const resisted = edge + (magnitude - edge) * discoveryDeckPhysics.edgeResistance;
  return Math.sign(distanceX) * resisted;
}

export function projectedTranslation(distanceX: number, velocityX: number): number {
  'worklet';
  return distanceX + velocityX * discoveryDeckPhysics.projectionSeconds;
}

export function decideSwipe(
  distanceX: number,
  velocityX: number,
  viewportWidth: number,
): SwipeDecision {
  'worklet';
  const threshold = viewportWidth * discoveryDeckPhysics.distanceRatio;
  const projected = projectedTranslation(distanceX, velocityX);
  // A flick decides by the direction of the flick. Dragging far one way and
  // then flicking hard the other way used to commit the drag's direction,
  // because the projection had not caught up with the reversal yet.
  if (Math.abs(velocityX) >= discoveryDeckPhysics.velocityThreshold) {
    return velocityX > 0 ? 'right' : 'left';
  }
  if (Math.abs(projected) >= threshold) {
    return projected > 0 ? 'right' : 'left';
  }
  return null;
}

// The deck advances past the card that was decided, not past whatever happens
// to sit on top: a decision confirmed while the deck reloaded used to drop the
// wrong card and could hand the decided one back to the user.
export function advanceDeck<T extends { id: string }>(deck: readonly T[], decidedId?: string): T[] {
  if (decidedId === undefined) return deck.slice(1);
  const index = deck.findIndex((item) => item.id === decidedId);
  if (index < 0) return [...deck];
  return [...deck.slice(0, index), ...deck.slice(index + 1)];
}

export function isUndoWindowOpen(
  passedAtMs: number,
  nowMs: number,
  windowMs = discoveryDeckPhysics.undoWindowMs,
): boolean {
  const elapsed = nowMs - passedAtMs;
  return elapsed >= 0 && elapsed <= windowMs;
}

/**
 * How far into a swipe the verdict has to be readable.
 *
 * The stamp used to fade in across the whole decision distance, so it reached
 * half its opacity at 12% of the screen and full only at the point where the
 * card leaves anyway — you saw what you had chosen after it was gone. A
 * decision has to be visible while there is still time to change it: the stamp
 * starts at a thumb's twitch and is solid at half the decision distance, so the
 * whole second half of the gesture is spent looking at a verdict you can still
 * take back by letting go.
 */
export const stampReveal = {
  startRatio: 0.03,
  fullRatio: 0.12,
  restingScale: 0.86,
} as const;

/** 0 before the gesture means anything, 1 once the verdict stands. */
export function stampProgress(intentX: number, viewportWidth: number, direction: SwipeDirection): number {
  'worklet';
  const signed = direction === 'right' ? intentX : -intentX;
  if (signed <= 0 || viewportWidth <= 0) return 0;
  const start = viewportWidth * stampReveal.startRatio;
  const full = viewportWidth * stampReveal.fullRatio;
  if (signed <= start) return 0;
  if (signed >= full) return 1;
  return (signed - start) / (full - start);
}

/** The stamp grows into place rather than appearing at full size. */
export function stampScale(progress: number): number {
  'worklet';
  return stampReveal.restingScale + (1 - stampReveal.restingScale) * Math.max(0, Math.min(1, progress));
}
