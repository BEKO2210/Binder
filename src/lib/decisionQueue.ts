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

/**
 * One queue, one writer at a time.
 *
 * Everything that changes the queue reads it from disk, changes it and writes
 * it back, and every step of that is a promise. Two of them overlapping lose a
 * decision: the flush read the queue, waited for the network, and wrote back
 * what was left — over the swipe that had been queued in the meantime. The
 * card was already gone from the screen, so the decision was gone with it, and
 * nothing said so.
 *
 * The lock is per process, which is the whole of it: the queue is only ever
 * touched by this app on this phone. Work runs in the order it asked, and a
 * failure inside it does not stop what queued behind it.
 */
let queueTail: Promise<unknown> = Promise.resolve();

export function withQueueLock<T>(work: () => Promise<T>): Promise<T> {
  const run = queueTail.then(work, work);
  queueTail = run.then(() => undefined, () => undefined);
  return run;
}

export function addPending(queue: PendingDecision[], entry: PendingDecision): PendingDecision[] {
  // One decision per person: a retry writing a second copy would ask the server
  // the same question twice. The first answer wins — a profile can come back
  // into the deck while its decision is still queued (the server has not seen
  // it yet), and letting the second swipe overwrite the first would silently
  // turn somebody's bind into a pass.
  const existing = queue.find((item) => item.targetUserId === entry.targetUserId);
  if (existing) return queue;
  return [...queue, entry].slice(-MAX_PENDING);
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

/**
 * Writes the queue, or says it could not.
 *
 * This used to swallow every storage error, which made the caller's recovery
 * path unreachable: the card left the deck as if the decision were safe while
 * nothing had been written, and the queue is only ever read back from disk. A
 * failure has to reach the screen so the card can come back.
 */
export async function savePending(queue: PendingDecision[]): Promise<void> {
  if (queue.length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
  else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Drops everything waiting, for good.
 *
 * A queued decision belongs to the account that made it. Signing out or
 * deleting the account ends that account's claim on this phone: what is left
 * on disk would otherwise be sent under the next person's session, putting
 * somebody else's binds on their profile and quietly filtering their deck.
 */
export async function clearPending(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
