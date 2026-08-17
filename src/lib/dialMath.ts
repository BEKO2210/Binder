const TAU = Math.PI * 2;
export const DIAL_ARC_START = Math.PI * 3 / 4;
export const DIAL_ARC_RADIANS = Math.PI * 3 / 2;

export function pointToAngle(x: number, y: number, size: number): number {
  'worklet';
  return Math.atan2(y - size / 2, x - size / 2);
}

export function pointToPosition(x: number, y: number, size: number): number {
  'worklet';
  const fromStart = ((pointToAngle(x, y, size) - DIAL_ARC_START) % TAU + TAU) % TAU;
  if (fromStart <= DIAL_ARC_RADIANS) return fromStart / DIAL_ARC_RADIANS;
  return fromStart - DIAL_ARC_RADIANS < (TAU - DIAL_ARC_RADIANS) / 2 ? 1 : 0;
}

export function unwrapAngleDelta(previous: number, current: number): number {
  'worklet';
  let delta = current - previous;
  if (delta > Math.PI) delta -= TAU;
  else if (delta < -Math.PI) delta += TAU;
  return delta;
}

export function accumulateDragPosition(position: number, previousAngle: number, currentAngle: number): number {
  'worklet';
  return Math.min(1, Math.max(0, position + unwrapAngleDelta(previousAngle, currentAngle) / DIAL_ARC_RADIANS));
}

// What a touch on the ring grabbed: the low handle, the high handle, or the
// band between them. Deciding this once per gesture — instead of letting
// separate detectors each keep their own idea — is what stops a handle from
// jumping to the other end when the finger lands on it.
export type DialDragTarget = 0 | 1 | 2;

export function resolveDragTarget(
  fingerPosition: number,
  lowPosition: number,
  highPosition: number,
  isRange: boolean,
  bandDistance: number,
): DialDragTarget {
  'worklet';
  if (!isRange) return 0;
  const distanceToLow = Math.abs(fingerPosition - lowPosition);
  const distanceToHigh = Math.abs(fingerPosition - highPosition);
  const betweenHandles = fingerPosition > lowPosition && fingerPosition < highPosition;
  if (betweenHandles && Math.min(distanceToLow, distanceToHigh) > bandDistance) return 2;
  return distanceToLow <= distanceToHigh ? 0 : 1;
}

// The handle keeps its distance from the finger, so grabbing it slightly off
// centre does not teleport it under the thumb.
export function grabOffset(target: DialDragTarget, fingerPosition: number, lowPosition: number, highPosition: number): number {
  'worklet';
  return (target === 1 ? highPosition : lowPosition) - fingerPosition;
}

export function positionToStepIndex(position: number, stepCount: number): number {
  'worklet';
  return Math.round(Math.min(1, Math.max(0, position)) * Math.max(0, stepCount - 1));
}

export function clampRange(low: number, high: number, minimum: number, maximum: number, minimumSpan: number): [number, number] {
  const safeLow = Math.max(minimum, Math.min(low, maximum - minimumSpan));
  const safeHigh = Math.min(maximum, Math.max(high, safeLow + minimumSpan));
  return [Math.min(safeLow, safeHigh - minimumSpan), safeHigh];
}

export function moveRange(low: number, high: number, delta: number, minimum: number, maximum: number): [number, number] {
  'worklet';
  const span = high - low;
  const nextLow = Math.max(minimum, Math.min(maximum - span, low + delta));
  return [nextLow, nextLow + span];
}
