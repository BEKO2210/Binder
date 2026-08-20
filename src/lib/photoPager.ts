export function clampPhotoIndex(index: number, photoCount: number): number {
  // Called from the pan gesture on the UI thread: without this directive the
  // worklet reaches back into the JS runtime and the app dies with
  // "Tried to synchronously call a Remote Function".
  'worklet';
  if (photoCount <= 0) return 0;
  return Math.min(photoCount - 1, Math.max(0, Math.trunc(index)));
}

export function adjacentPhotoIndex(index: number, direction: 'previous' | 'next', photoCount: number): number {
  'worklet';
  return clampPhotoIndex(index + (direction === 'next' ? 1 : -1), photoCount);
}

export function photosToPreload(photos: readonly string[], index: number): string[] {
  const candidates = [photos[index + 1], photos[index - 1]];
  return candidates.filter((photo, candidateIndex): photo is string => Boolean(photo) && candidates.indexOf(photo) === candidateIndex);
}

// Paging decision for a horizontal photo swipe. Distance alone is not enough:
// a short, fast flick has to page, and a long, slow drag that is released back
// past the middle has to snap home. Velocity is projected the same way the deck
// projects it, so both gestures feel like one system.
export const photoPagerPhysics = {
  // Fraction of the page width that commits a page when released.
  commitRatio: 0.28,
  // A flick above this speed pages regardless of distance (px/s).
  velocityThreshold: 550,
  projectionSeconds: 0.12,
  // Drag past the first or last photo only follows the thumb this much.
  edgeResistance: 0.32,
} as const;

export function nextPhotoPage(
  index: number,
  translationX: number,
  velocityX: number,
  pageWidth: number,
  photoCount: number,
): number {
  'worklet';
  if (photoCount <= 1 || pageWidth <= 0) return clampPhotoIndex(index, photoCount);
  const projected = translationX + velocityX * photoPagerPhysics.projectionSeconds;
  const flick = Math.abs(velocityX) >= photoPagerPhysics.velocityThreshold;
  const direction = flick ? (velocityX > 0 ? -1 : 1) : projected <= -pageWidth * photoPagerPhysics.commitRatio ? 1 : projected >= pageWidth * photoPagerPhysics.commitRatio ? -1 : 0;
  return clampPhotoIndex(index + direction, photoCount);
}

// Dragging before the first or after the last photo has to feel like an edge,
// not like a broken pager: the thumb keeps moving, the track barely does.
export function resistedPhotoTranslation(
  index: number,
  translationX: number,
  photoCount: number,
): number {
  'worklet';
  const atStart = index === 0 && translationX > 0;
  const atEnd = index === photoCount - 1 && translationX < 0;
  if (atStart || atEnd) return translationX * photoPagerPhysics.edgeResistance;
  return translationX;
}

/**
 * What a photo in the pager is doing right now.
 *
 * A card whose photo request never answers used to show nothing: an empty dark
 * rectangle with the name and the interests under it, indefinitely, while bind
 * and pass stayed active — somebody decided about a person they could not see.
 * The failure text existed but only an error could reach it, and silence is not
 * an error. Measured on the S23 with a network that accepted the connection and
 * never replied.
 */
export type PhotoLoadStatus = 'pending' | 'ready' | 'failed';

/** How long a photo may stay silent before the card says so and offers a retry. */
export const photoLoadDeadlineMs = 10_000;

export type PhotoLoadEvent = 'loaded' | 'error' | 'deadline' | 'retry';

export function photoStatusAfter(current: PhotoLoadStatus, event: PhotoLoadEvent): PhotoLoadStatus {
  if (event === 'loaded') return 'ready';
  if (event === 'error') return 'failed';
  if (event === 'retry') return 'pending';
  // A deadline only decides for a photo that is still waiting: an image that
  // arrived must never be thrown away by a timer that was already running.
  return current === 'pending' ? 'failed' : current;
}

/**
 * Which photo of how many, shown in the middle of the picture while paging.
 *
 * The thin segments along the top edge say the same thing, but they sit at the
 * very top of a card the thumb is covering, are two pixels tall, and are the
 * first thing to disappear against a bright photo. On a phone held one-handed
 * nobody sees which picture they just moved to. The counter answers that in the
 * one place the eye is already looking — the centre — and then gets out of the
 * way again.
 */
export function photoCounterLabel(index: number, count: number): string {
  return `${clampPhotoIndex(index, count) + 1} / ${Math.max(count, 1)}`;
}

/** How the counter appears and leaves: quick in, a beat to read, slow out. */
export const photoCounterTiming = {
  fadeInMs: 120,
  holdMs: 900,
  fadeOutMs: 260,
} as const;

/**
 * Reduced motion keeps the information and drops the movement: the counter is
 * simply there while paging and gone afterwards, without a fade.
 */
export function photoCounterDurations(reduceMotion: boolean): { fadeInMs: number; holdMs: number; fadeOutMs: number } {
  if (!reduceMotion) return { ...photoCounterTiming };
  return { fadeInMs: 0, holdMs: photoCounterTiming.holdMs, fadeOutMs: 0 };
}
