// Where a cropped photo sits inside its card.
//
// A card is taller than it is wide, most profile photos are not, and
// `resizeMode: 'cover'` centres what it keeps. On a portrait held at arm's
// length that centre is the chest: heads were being cut off at the hairline
// while there was empty floor to spare below.
//
// People put their face in the upper third of a photo, so that is where the
// visible window belongs. The offset is clamped, so a photo is never pulled far
// enough to show a gap — the worst case is the plain centred crop.
//
// This module imports nothing so it can run directly under node:test.

/** Where the kept window sits vertically: 0 is the top edge, 0.5 is centred. */
export const PORTRAIT_FOCUS = 0.38;

export type CropBox = {
  /** How the image must be drawn to cover the box. */
  width: number;
  height: number;
  /** How far to move it vertically. Negative moves the photo up. */
  translateY: number;
};

export function coverCrop(
  image: { width: number; height: number },
  box: { width: number; height: number },
  focus = PORTRAIT_FOCUS,
): CropBox | null {
  // Nothing to compute before the photo has reported its size, and a zero
  // anywhere would divide the layout by nothing.
  if (!(image.width > 0 && image.height > 0 && box.width > 0 && box.height > 0)) return null;

  const scale = Math.max(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  // Half the overflow is what a centred crop hides above and below.
  const overflowY = height - box.height;

  // Move up by the difference between the centre and the focus point, but never
  // past the edges of the photo.
  const wanted = overflowY * (0.5 - focus);
  const translateY = Math.max(-overflowY / 2, Math.min(overflowY / 2, wanted));

  // Horizontally the centre stays: faces are not biased left or right.
  return { width, height, translateY };
}
