// What happens after a send, decided once instead of three times.
//
// Sending a message can end five ways, and the same five apply whether it was
// text or a voice take: the server confirmed it, the conversation has ended,
// the session has ended, the phone had no network, or the screen went away
// mid-flight. Each wants a different combination of "keep the attempt on
// screen", "write it to disk", "forget this conversation", "tell the person".
//
// The table was written out three times in ChatScreen — once for text, once for
// a voice send, once for a voice retry — and drifted between them: the retry
// path lost the recording's length, so a voice message whose upload failed
// could never be sent at all. One table, one set of tests.
import { classifyRequestFailure, isAbortError, isConversationEndedError, type ReliabilityError } from './reliability.ts';

export type MessageOutcome = {
  /** The attempt is finished with and disappears from the screen. */
  discard: boolean;
  /** The attempt stays visible as failed, with a retry. */
  keepAsFailed: boolean;
  /** It belongs on disk, so it survives the app being closed. */
  persist: boolean;
  /** The conversation is over: no retry can help, and nothing may wait for it. */
  conversationEnded: boolean;
  /** The session is over, which is not about this message at all. */
  sessionExpired: boolean;
  /** Nothing to do — the screen left while the request was in flight. */
  ignore: boolean;
  error: ReliabilityError | null;
};

const NOTHING: MessageOutcome = {
  discard: false, keepAsFailed: false, persist: false,
  conversationEnded: false, sessionExpired: false, ignore: false, error: null,
};

/** The server took it. */
export function outcomeForDelivery(): MessageOutcome {
  return { ...NOTHING, discard: true };
}

export function outcomeForSendFailure(cause: unknown, options: { mounted: boolean }): MessageOutcome {
  // The screen is gone: whoever unmounted it already decided what to keep, and
  // acting here would fight that.
  if (!options.mounted || isAbortError(cause)) return { ...NOTHING, ignore: true };

  // Unmatched or blocked while the message was on its way. Nothing may wait for
  // a conversation that no longer exists — a queue that keeps trying would ask
  // forever.
  if (isConversationEndedError(cause)) {
    return { ...NOTHING, discard: true, conversationEnded: true };
  }

  const failure = classifyRequestFailure(cause);
  if (failure.kind === 'permission-denied') {
    return { ...NOTHING, discard: true, sessionExpired: true };
  }

  // Everything else is worth another try, and worth surviving the app being
  // killed: this is the message somebody typed on a train.
  return { ...NOTHING, keepAsFailed: true, persist: true, error: failure };
}
