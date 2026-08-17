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
