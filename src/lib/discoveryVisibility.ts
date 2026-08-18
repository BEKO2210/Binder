// Whether this account can appear in anybody's deck, decided the same way the
// server decides it.
//
// A photo arrives as `pending` and stays invisible until it is reviewed, and
// `phase4_safety_gate.sql` only lets a profile into discovery when the photo at
// position 0 is approved. The profile screen never said so: it showed "3 of 3,
// 100 %" the moment three files were uploaded, so somebody could finish their
// profile, see nothing but an empty deck, and have no way to learn that their
// photos were still in review.
//
// This module imports nothing so it can run directly under node:test.
export type MediaState = { position: number; moderationStatus: 'pending' | 'approved' | 'rejected' | 'removed' };
export type DiscoveryVisibility = 'visible' | 'awaitingReview' | 'blocked' | 'noPhotos';

export function discoveryVisibility(media: readonly MediaState[]): DiscoveryVisibility {
  if (media.length === 0) return 'noPhotos';
  // Position 0 is the one the gate looks at; the rest can be in any state.
  const primary = media.find((item) => item.position === 0);
  if (!primary) return 'noPhotos';
  if (primary.moderationStatus === 'approved') return 'visible';
  // Pending is a wait. Rejected or removed is a decision, and it needs a
  // different sentence: one asks for patience, the other asks for another photo.
  return primary.moderationStatus === 'pending' ? 'awaitingReview' : 'blocked';
}
