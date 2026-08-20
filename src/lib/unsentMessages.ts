import AsyncStorage from '@react-native-async-storage/async-storage';

// A message somebody pressed send on is not a draft.
//
// Drafts live in memory and nobody expects them after a restart. A message that
// was sent into a dead network is different: the person is done deciding, the
// words are theirs, and the app owes them delivery. It used to survive only as
// long as the process did — killing the app while offline threw it away
// silently, and the person had no way of knowing.
//
// So it rides on disk, per conversation, the same way a pending bind does.

const STORAGE_KEY = 'binder:unsent-messages:v1';
const MAX_PER_MATCH = 50;

export type UnsentMessage = {
  clientId: string;
  body: string;
  /** A voice take whose upload never finished; the file is still on the phone. */
  localUri?: string;
  /**
   * How long that take is. Without it a retry sent zero and the server
   * refused it, so a voice message whose upload failed could never be sent
   * at all — the recording sat there with a retry button that could not work.
   */
  durationMs?: number;
  voice?: { audioPath: string; durationMs: number };
  /** When they pressed send, so the queue keeps their order. */
  createdAt: number;
};

export type UnsentStore = Record<string, UnsentMessage[]>;

export function addUnsent(store: UnsentStore, matchId: string, message: UnsentMessage): UnsentStore {
  const existing = store[matchId] ?? [];
  // One entry per client id: a retry that fails again must not queue twice.
  const without = existing.filter((entry) => entry.clientId !== message.clientId);
  return { ...store, [matchId]: [...without, message].slice(-MAX_PER_MATCH) };
}

export function removeUnsent(store: UnsentStore, matchId: string, clientId: string): UnsentStore {
  const remaining = (store[matchId] ?? []).filter((entry) => entry.clientId !== clientId);
  if (remaining.length > 0) return { ...store, [matchId]: remaining };
  const next = { ...store };
  delete next[matchId];
  return next;
}

/** Oldest first: what somebody wrote first is what goes out first. */
export function unsentInOrder(store: UnsentStore, matchId: string): UnsentMessage[] {
  return [...(store[matchId] ?? [])].sort((left, right) => left.createdAt - right.createdAt);
}

export function forgetUnsentMatch(store: UnsentStore, matchId: string): UnsentStore {
  const next = { ...store };
  delete next[matchId];
  return next;
}

function isMessage(value: unknown): value is UnsentMessage {
  if (!value || typeof value !== 'object') return false;
  const entry = value as UnsentMessage;
  return typeof entry.clientId === 'string' && typeof entry.body === 'string' && typeof entry.createdAt === 'number';
}

export async function loadUnsent(): Promise<UnsentStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const store: UnsentStore = {};
    for (const [matchId, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(list)) store[matchId] = list.filter(isMessage);
    }
    return store;
  } catch {
    // A corrupt queue must not keep a conversation from opening.
    return {};
  }
}

export async function saveUnsent(store: UnsentStore): Promise<void> {
  try {
    if (Object.keys(store).length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable: the message is still in memory for this
    // session, and losing it later is better than crashing now.
  }
}

/**
 * Everything unsent, gone from this device.
 *
 * Messages waiting for a connection are written to disk in plain text so they
 * survive the app being killed — which is right while somebody is signed in,
 * and wrong the moment they sign out or delete the account. What they typed is
 * theirs, and after they leave it belongs on the phone no more than the session
 * does.
 */
export async function clearUnsent(): Promise<void> {
  await saveUnsent({});
}
