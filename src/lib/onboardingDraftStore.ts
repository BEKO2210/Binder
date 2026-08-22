import { DRAFT_STORAGE_KEY, sanitize, type OnboardingDraft } from './onboardingDraft';
import { LargeSecureStore } from './secureSessionStorage';

// The draft is a birth date, a first name, a bio and what somebody is looking
// for — written down before an account exists, so the server has never seen
// any of it. It lay in plain text in AsyncStorage until the account was
// created, which on an abandoned signup is for as long as the app is
// installed.
//
// It goes through the same store the session does: encrypted, with the key in
// the hardware keystore, authenticated on the way back. And it leaves with the
// person, like the chat drafts and the queued decisions do — a half-written
// profile is exactly the kind of thing the next person on a shared phone must
// not find.

const store = new LargeSecureStore();

export async function loadOnboardingDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await store.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  try {
    await store.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Nothing to do: the answers are still on screen, and refusing to continue
    // because a cache write failed would be the worse outcome.
  }
}

/** Once the account exists — or the person leaves — the draft is done. */
export async function clearOnboardingDraft(): Promise<void> {
  try {
    await store.removeItem(DRAFT_STORAGE_KEY);
  } catch { /* the account is created either way */ }
}
