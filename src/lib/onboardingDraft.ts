// Signing up is five screens of answering personal questions. Until now none
// of it existed anywhere until the very last step, so anybody who closed the
// app, lost the connection or reflexively swiped back started again from the
// birth date. Nineteen of thirty accounts on this server got that far and no
// further. Every answer is now written down the moment it is given.
//
// It is deliberately local: nothing here has been sent to the server, so it is
// nobody's data but this person's, on this phone.

// The reading and writing live in onboardingDraftStore.ts, which talks to the
// keystore. What is here is the shape and the sanitising, which is the part
// worth testing on its own.
export const DRAFT_STORAGE_KEY = 'binder:onboarding-draft:v1';

export type OnboardingDraft = {
  step?: string;
  birthDate?: string;
  firstName?: string;
  gender?: string;
  bio?: string;
  interests?: string[];
  interestedIn?: string[];
  minAge?: number;
  maxAge?: number;
  distance?: number;
};

/**
 * A stored draft is untrusted input like anything else read back from disk:
 * an older build, a half-written file or a tampered value must not put the
 * signup into a state its own validation would reject.
 */
export function sanitize(raw: Record<string, unknown>): OnboardingDraft {
  const draft: OnboardingDraft = {};
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value : undefined;
  const number = (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : undefined;

  draft.step = text(raw.step, 24);
  draft.birthDate = typeof raw.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.birthDate) ? raw.birthDate : undefined;
  draft.firstName = text(raw.firstName, 40);
  draft.gender = ['woman', 'man', 'nonbinary'].includes(String(raw.gender)) ? String(raw.gender) : undefined;
  draft.bio = text(raw.bio, 500);
  draft.interests = Array.isArray(raw.interests) ? raw.interests.filter((item): item is string => typeof item === 'string').slice(0, 12) : undefined;
  draft.interestedIn = Array.isArray(raw.interestedIn)
    ? raw.interestedIn.filter((item): item is string => ['woman', 'man', 'nonbinary'].includes(String(item)))
    : undefined;
  draft.minAge = number(raw.minAge, 18, 100);
  draft.maxAge = number(raw.maxAge, 18, 100);
  draft.distance = number(raw.distance, 1, 500);
  if (draft.minAge !== undefined && draft.maxAge !== undefined && draft.minAge > draft.maxAge) {
    draft.minAge = undefined;
    draft.maxAge = undefined;
  }
  return draft;
}
