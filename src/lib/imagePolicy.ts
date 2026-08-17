export const IMAGE_POLICY = {
  cache: 'immutable',
  placeholder: 'surface',
  resizeMode: 'cover',
  thumbnailPixelRatioCap: 3,
} as const;

export function imageDecodeSize(layoutWidth: number, layoutHeight: number, pixelRatio: number) {
  const scale = Math.min(Math.max(pixelRatio, 1), IMAGE_POLICY.thumbnailPixelRatioCap);
  return {
    width: Math.max(1, Math.ceil(layoutWidth * scale)),
    height: Math.max(1, Math.ceil(layoutHeight * scale)),
  };
}
