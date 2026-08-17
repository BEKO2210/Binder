type CelebrationLayoutInput = {
  screenWidth: number;
  screenHeight: number;
  horizontalPadding: number;
  verticalPadding: number;
  portraitGap: number;
  portraitMaxSize: number;
  portraitMinSize: number;
  fixedContentHeight: number;
};

export type CelebrationLayout = {
  portraitSize: number;
  groupWidth: number;
  outerOffset: number;
  leftCenterOffset: number;
  rightCenterOffset: number;
};

// The portrait centres are derived from one axis. Equal signed offsets make
// symmetry explicit and testable instead of relying on overlapping margins.
export function resolveMatchCelebrationLayout(input: CelebrationLayoutInput): CelebrationLayout {
  const contentWidth = Math.max(0, input.screenWidth - input.horizontalPadding * 2);
  const widthBound = Math.max(0, (contentWidth - input.portraitGap) / 2);
  const heightBound = Math.max(0, input.screenHeight - input.verticalPadding * 2 - input.fixedContentHeight);
  const portraitSize = Math.max(
    Math.min(input.portraitMinSize, widthBound),
    Math.min(input.portraitMaxSize, widthBound, heightBound),
  );
  const groupWidth = portraitSize * 2 + input.portraitGap;
  const outerOffset = (input.screenWidth - groupWidth) / 2;
  const centerOffset = (portraitSize + input.portraitGap) / 2;

  return {
    portraitSize,
    groupWidth,
    outerOffset,
    leftCenterOffset: -centerOffset,
    rightCenterOffset: centerOffset,
  };
}
