// Which auth events mean "somebody else is using the app now".
//
// Supabase emits an auth event for far more than a sign-in: TOKEN_REFRESHED
// every time the access token is renewed, USER_UPDATED after a profile write,
// and SIGNED_IN from a dozen places that merely recovered the session that was
// already there. Root treated all of them as a fresh sign-in and discarded the
// legal gate, the onboarding answer, the open conversation and the selected
// tab. That is invisible when it happens on a quiet Discover screen and very
// visible otherwise: an access token lasts an hour, so roughly once an hour the
// app threw the person back to Discover behind a full-screen loading state, and
// a photo upload caught by the same refresh lost its screen mid-upload.
//
// Only the identity behind the session decides. This module imports nothing so
// it can run directly under node:test.
export function sessionIdentityChanged(
  previousUserId: string | null | undefined,
  nextUserId: string | null | undefined,
): boolean {
  // undefined (nothing seen yet) and null (signed out) are the same absence
  // here; keeping them apart would make the first event after a restored
  // session look like a change.
  return (previousUserId ?? null) !== (nextUserId ?? null);
}
