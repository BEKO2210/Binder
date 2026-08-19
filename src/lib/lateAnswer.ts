/**
 * Who is still allowed to act on an answer that arrives late.
 *
 * The match celebration asked the server for the fresh conversation and then
 * navigated with whatever came back. On a slow network the person dismissed
 * the celebration long before the answer landed, kept swiping — and twenty-five
 * seconds later the app opened a chat by itself. Measured on the S23: the
 * celebration was gone, Discovery was on screen, and the reply still steered.
 *
 * A request therefore carries a ticket. Leaving the state that asked for it
 * voids every ticket handed out so far, and an answer without a valid ticket is
 * read and dropped. This module imports nothing so it can run under node:test.
 */
export type AnswerGate = { issued: number; open: number | null };

export function openGate(): AnswerGate {
  return { issued: 0, open: null };
}

/** Hands out the ticket for one request and makes it the only valid one. */
export function askFor(gate: AnswerGate): number {
  gate.issued += 1;
  gate.open = gate.issued;
  return gate.issued;
}

/** True only while this exact request is still the one being waited on. */
export function stillWaitingFor(gate: AnswerGate, ticket: number): boolean {
  return gate.open === ticket;
}

/**
 * Closing the screen, dismissing the celebration, unmounting: whatever is in
 * flight may still arrive, and it may no longer do anything when it does.
 */
export function stopWaiting(gate: AnswerGate): void {
  gate.open = null;
}
