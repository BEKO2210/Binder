// What to do when Supabase says the session ended.
//
// It emits SIGNED_OUT for two very different things: somebody tapped sign out,
// and a token refresh failed because the phone was in a tunnel. Treating them
// alike produced one wrong screen each way — a deliberate sign-out was greeted
// with "your session expired", as if something had broken, and a person in a
// dead spot was thrown back to the sign-in screen while their session was
// perfectly valid.
//
// So the app asks the server before it believes it, and only a real refusal
// ends a session. No answer at all means the phone could not reach anybody,
// which is not evidence of anything — the safe direction is to stay signed in,
// because the cost of guessing wrong is being locked out of a working account.
//
// This module imports nothing so it can run directly under node:test.
export type SessionEndInput = {
  /** The person asked for it — nothing to verify and nothing went wrong. */
  intentional: boolean;
  /** The server still has a session for this device. */
  hasServerSession: boolean;
  /** The check never reached a server: offline, or it timed out. */
  unreachable: boolean;
};

export type SessionEndDecision =
  /** Sign out cleanly, without claiming anything expired. */
  | 'sign-out'
  /** Keep the session; nothing proved it is gone. */
  | 'keep'
  /** The server refused it: say so and send them back to sign in. */
  | 'expired';

export function sessionEndDecision(input: SessionEndInput): SessionEndDecision {
  if (input.intentional) return 'sign-out';
  if (input.hasServerSession) return 'keep';
  if (input.unreachable) return 'keep';
  return 'expired';
}

// A deliberate sign-out is known where the button is, and unknowable by the
// time the event arrives. This carries that one fact across, and is consumed on
// read so a later refresh failure cannot inherit it.
let intentionalSignOut = false;

export function markIntentionalSignOut(): void {
  intentionalSignOut = true;
}

/**
 * Takes the flag back when the sign-out never happened.
 *
 * It is set before the request, because the SIGNED_OUT event can arrive while
 * that request is still running. If the request then fails, the flag would sit
 * there and be eaten by the next genuine session end — a token refresh that
 * failed in a tunnel would look deliberate and drop the person out silently.
 */
export function forgetIntentionalSignOut(): void {
  intentionalSignOut = false;
}

export function consumeIntentionalSignOut(): boolean {
  const value = intentionalSignOut;
  intentionalSignOut = false;
  return value;
}
