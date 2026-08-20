// What happens after a decision, decided once and in one place.
//
// Bind and pass look like one tap and are five outcomes: the server confirmed
// it, the server confirmed a match, the phone had no network so it goes on
// disk, the session is gone, or the server refused and will refuse again. Each
// one wants a different combination of "does the card leave", "does anything
// get stored", "does the deck reload", "does the person see an error".
//
// That table lived inside a screen, tangled with animations and haptics, which
// is why two of its branches were wrong at the same time: a decision was thrown
// away before it was stored, and a queue write that failed still let the card
// go. Here it is a function with no side effects, and every branch has a test.
import { classifyError, type ReliabilityError } from './reliability.ts';
import { shouldKeepAfterFailure } from './decisionQueue.ts';

export type DecisionOutcome = {
  /** Does the card leave the deck? */
  dismiss: boolean;
  /** Does the decision have to be written to disk before the card may leave? */
  queue: boolean;
  /** Does the deck spring the card back, because nothing was recorded? */
  springBack: boolean;
  /** Did the server confirm a match? */
  matched: boolean;
  /** Has the session ended — the one failure that is not about this decision? */
  sessionExpired: boolean;
  /** What the person is told, if anything. */
  error: ReliabilityError | null;
};

const NOTHING: DecisionOutcome = {
  dismiss: false, queue: false, springBack: false, matched: false, sessionExpired: false, error: null,
};

/** The server answered. */
export function outcomeForConfirmation(matched: boolean): DecisionOutcome {
  return { ...NOTHING, dismiss: true, matched };
}

/** The server did not answer, or refused. */
export function outcomeForFailure(cause: unknown): DecisionOutcome {
  const failure = classifyError(cause);

  // A session that ended is not a decision that failed: the card comes back and
  // the app asks the person to sign in again.
  if (failure.kind === 'permission-denied') {
    return { ...NOTHING, springBack: true, sessionExpired: true };
  }

  // No network, a timeout, something unrecognised: the person decided, and the
  // decision outlives the connection. The card may only leave once it is on
  // disk — the caller does the writing and asks again if it failed.
  if (shouldKeepAfterFailure(failure.kind)) {
    return { ...NOTHING, dismiss: true, queue: true };
  }

  // A refusal will refuse again. Keeping it would retry forever, so the card
  // comes back and the person sees why.
  return { ...NOTHING, springBack: true, error: failure };
}

/** The decision could not be written to disk after all. */
export function outcomeForQueueFailure(cause: unknown): DecisionOutcome {
  // Nothing was stored, so nothing may be thrown away.
  return { ...NOTHING, springBack: true, error: classifyError(cause) };
}

/**
 * Whether the deck should ask the server for more.
 *
 * Only when this was the last card. A match defers it: the celebration is on
 * screen, and reloading behind it moved the deck under the person's hands.
 */
export function shouldReloadDeck(remaining: number, matched: boolean): 'now' | 'after-celebration' | 'no' {
  if (remaining > 1) return 'no';
  return matched ? 'after-celebration' : 'now';
}
