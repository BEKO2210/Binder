import AsyncStorage from '@react-native-async-storage/async-storage';

// A Bind is a decision a person made. The network being away for a moment is
// not a reason to make them decide again — the card is gone from their screen
// either way, so the decision has to outlive the failed request and the app
// being closed. It rides on disk until the server confirms it.

const STORAGE_KEY = 'binder:pending-decisions:v1';
const MAX_PENDING = 200;

export type PendingDecision = {
  targetUserId: string;
  decision: 'bind' | 'pass';
  /** When the person actually decided, not when it was sent. */
  decidedAt: number;
};

export function addPending(queue: PendingDecision[], entry: PendingDecision): PendingDecision[] {
  // One decision per person: swiping the same card twice cannot happen, but a
  // retry writing a second copy would ask the server the same question twice.
  const without = queue.filter((item) => item.targetUserId !== entry.targetUserId);
  return [...without, entry].slice(-MAX_PENDING);
}

export function removePending(queue: PendingDecision[], targetUserId: string): PendingDecision[] {
  return queue.filter((item) => item.targetUserId !== targetUserId);
}

/**
 * Oldest first: the order somebody swiped in is the order their decisions
 * should reach the server, or a later pass could overtake an earlier bind.
 */
export function nextToSend(queue: PendingDecision[]): PendingDecision | null {
  return [...queue].sort((a, b) => a.decidedAt - b.decidedAt)[0] ?? null;
}

/** A refusal is final; only a lost connection is worth keeping in the queue. */
export function shouldKeepAfterFailure(kind: string): boolean {
  return kind === 'offline' || kind === 'timeout' || kind === 'unknown';
}

export async function loadPending(): Promise<PendingDecision[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingDecision =>
      Boolean(item) && typeof item === 'object'
      && typeof (item as PendingDecision).targetUserId === 'string'
      && ((item as PendingDecision).decision === 'bind' || (item as PendingDecision).decision === 'pass')
      && typeof (item as PendingDecision).decidedAt === 'number');
  } catch {
    // A corrupt queue must not keep the deck from opening.
    return [];
  }
}

export async function savePending(queue: PendingDecision[]): Promise<void> {
  try {
    if (queue.length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable: the decision is still in memory for this
    // session, and losing it later is better than crashing now.
  }
}
