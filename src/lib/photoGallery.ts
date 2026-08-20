// Which gallery actions are allowed right now.
//
// The profile gallery has five actions — add, retry, move, make primary,
// remove — and each was guarded by its own line at the top of its handler in
// ProfileSettingsScreen. The guards were not the same shape: add checked the
// upload lock, move did not; make primary checked moderation, replace did not;
// and the "six photos" limit lived in two places with two different numbers
// once already. A screen is the wrong place to keep rules that decide whether
// somebody loses a photo.
//
// This module imports only the replacement order so it can run directly under
// node:test, with no React and no network.
import { MAXIMUM_PROFILE_PHOTOS, replacementOrder, type ReplacementOrder } from './photoReplacement.ts';

export type GalleryBusy = {
  /** A request that changes the gallery is in flight. */
  busy: boolean;
  /** An upload holds the lock, which outlives a single request. */
  uploadLocked: boolean;
};

export type UploadState = { phase: 'preparing' | 'uploading' | 'error'; hasImage: boolean } | null;

/** A seventh photo is refused by the server, so the button is refused here. */
export function canAddPhoto(count: number, state: GalleryBusy): boolean {
  return count < MAXIMUM_PROFILE_PHOTOS && !state.busy && !state.uploadLocked;
}

/**
 * Retry only exists for an upload that failed and still holds its prepared
 * image. Without the image there is nothing to send a second time, and offering
 * the button anyway is how a photo silently never arrives.
 */
export function canRetryUpload(upload: UploadState, state: GalleryBusy): boolean {
  if (state.uploadLocked) return false;
  return upload?.phase === 'error' && upload.hasImage;
}

/** The target slot, or null when the move would leave the gallery. */
export function moveTarget(index: number, delta: -1 | 1, count: number, state: GalleryBusy): number | null {
  if (state.busy) return null;
  const target = index + delta;
  if (index < 0 || index >= count) return null;
  return target >= 0 && target < count ? target : null;
}

/**
 * The first photo is the one other people see first, so it must be one the
 * moderators cleared. A photo that is already first is not a change.
 */
export function canMakePrimary(photo: { position: number; moderationStatus: string }, state: GalleryBusy): boolean {
  return photo.position !== 0 && photo.moderationStatus === 'approved' && !state.busy;
}

/** Replacing needs the same lock as adding: both run an upload. */
export function canReplacePhoto(state: GalleryBusy): boolean {
  return !state.busy && !state.uploadLocked;
}

export function orderForReplacement(count: number): ReplacementOrder {
  return replacementOrder(count);
}

/**
 * What the back gesture means while a photo is open full screen: the way out of
 * the viewer, not out of the profile behind it. Back used to leave both at
 * once, so a look at one photo cost the whole screen.
 */
export function backClosesViewer(viewerIndex: number | null): boolean {
  return viewerIndex !== null;
}
