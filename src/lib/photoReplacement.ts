// Which way round to replace a photo.
//
// Replacing used to delete the old photo and then upload the new one. If the
// upload failed — a tunnel, a refused file, anything — the old photo was gone
// and nothing had taken its place. Photos are the one thing in a profile people
// often cannot recreate: the moment has passed.
//
// Uploading first costs nothing except that it needs a free slot, because the
// server allows six and would refuse the seventh. So it is only the full
// gallery that still has to make room first, and that case is worth naming
// rather than hiding.
//
// This module imports nothing so it can run directly under node:test.
export const MAXIMUM_PROFILE_PHOTOS = 6;

export type ReplacementOrder = 'upload-first' | 'remove-first';

export function replacementOrder(photoCount: number, maximum = MAXIMUM_PROFILE_PHOTOS): ReplacementOrder {
  return photoCount < maximum ? 'upload-first' : 'remove-first';
}
