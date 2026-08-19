/**
 * Whether the deck's loading animation may be on screen at all.
 *
 * Opening the filter sheet while the deck was still searching put the sheet
 * behind the aurora: the sheet was there — its header and its buttons were
 * visible above and below — but the animation covered its middle, so the
 * controls a person came for were invisible. Reported by the owner, reproduced
 * on the S23 with a five-second network.
 *
 * The rule that makes the class of failure impossible is not a z-index: while
 * anything covers the deck, the deck's own loading animation has nothing to
 * show and nobody to show it to, so it is not rendered. It also keeps a heavy
 * shader off the GPU while a sheet animates in.
 */
export type DeckOverlays = {
  filtersOpen: boolean;
  safetyOpen: boolean;
  profileOpen: boolean;
  celebrating: boolean;
};

export function deckIsCovered(overlays: DeckOverlays): boolean {
  return overlays.filtersOpen || overlays.safetyOpen || overlays.profileOpen || overlays.celebrating;
}

export function discoveryLoadingVisible(loading: boolean, overlays: DeckOverlays): boolean {
  return loading && !deckIsCovered(overlays);
}
