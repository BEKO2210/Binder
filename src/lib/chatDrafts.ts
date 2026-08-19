// What a person typed or recorded, kept alive while they step out of a chat.
//
// The screen unmounts whenever they go back to the list — and with it went the
// half-written message and every failed send. Both are the person's work, not
// the screen's state, so both outlive the screen here. It is memory only: a
// draft is not worth writing to disk, and after a restart nobody expects it.

export type DraftAttempt = {
  clientId: string;
  body: string;
  /** For a voice attempt whose upload never finished. */
  localUri?: string;
  voice?: { audioPath: string; durationMs: number };
};

const texts = new Map<string, string>();
const attempts = new Map<string, DraftAttempt[]>();

export function rememberDraft(matchId: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed.length === 0) texts.delete(matchId);
  else texts.set(matchId, text);
}

export function recallDraft(matchId: string): string {
  return texts.get(matchId) ?? '';
}

export function rememberAttempts(matchId: string, list: DraftAttempt[]): void {
  if (list.length === 0) attempts.delete(matchId);
  else attempts.set(matchId, list);
}

export function recallAttempts(matchId: string): DraftAttempt[] {
  return attempts.get(matchId) ?? [];
}

/** Once a conversation ends there is nothing left to send into it. */
export function forgetChat(matchId: string): void {
  texts.delete(matchId);
  attempts.delete(matchId);
}
