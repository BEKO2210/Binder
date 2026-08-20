import AsyncStorage from '@react-native-async-storage/async-storage';

// What this phone already agreed to, remembered locally.
//
// The gate is a server answer, and asking for it is the first thing the app
// does. With no network there is no answer, so the app used to stop at a
// full-screen "you are offline" — no tab bar, no conversations, nothing. A
// dating app that cannot show the messages it already has because the train is
// in a tunnel is broken in the ordinary case, not the exotic one.
//
// So an acceptance is written down when it happens, and used only when the
// server cannot be reached. Two rules keep this from becoming a way around the
// gate:
//
//   1. It counts for the exact versions that were accepted. New terms mean the
//      cached answer does not apply, and the gate appears as it should.
//   2. A server answer always wins. This is what to do while nobody answers,
//      not a second opinion.

const STORAGE_KEY = 'binder:legal-acceptance:v1';

export type CachedAcceptance = {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: number;
};

export function acceptanceApplies(cached: CachedAcceptance | null, userId: string, versions: { terms: string; privacy: string } | null): boolean {
  if (!cached || !versions) return false;
  if (cached.userId !== userId) return false;
  return cached.termsVersion === versions.terms && cached.privacyVersion === versions.privacy;
}

export async function rememberAcceptance(entry: CachedAcceptance): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry)); } catch { /* a phone with no room still works online */ }
}

export async function recallAcceptance(): Promise<CachedAcceptance | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as CachedAcceptance;
    if (typeof candidate.userId !== 'string' || typeof candidate.termsVersion !== 'string' || typeof candidate.privacyVersion !== 'string') return null;
    return candidate;
  } catch { return null; }
}

/** Signing out takes it with it: the next person on this phone agreed to nothing. */
export async function forgetAcceptance(): Promise<void> {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
}
