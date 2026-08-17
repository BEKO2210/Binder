export function clampPhotoIndex(index: number, photoCount: number): number {
  if (photoCount <= 0) return 0;
  return Math.min(photoCount - 1, Math.max(0, Math.trunc(index)));
}

export function adjacentPhotoIndex(index: number, direction: 'previous' | 'next', photoCount: number): number {
  return clampPhotoIndex(index + (direction === 'next' ? 1 : -1), photoCount);
}

export function photosToPreload(photos: readonly string[], index: number): string[] {
  const candidates = [photos[index + 1], photos[index - 1]];
  return candidates.filter((photo, candidateIndex): photo is string => Boolean(photo) && candidates.indexOf(photo) === candidateIndex);
}
