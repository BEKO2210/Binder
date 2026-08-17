import type { Gender } from './validation';

export const ONBOARDING_STEPS = ['eligibility', 'identity', 'profile', 'discovery', 'photo'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function onboardingPosition(step: OnboardingStep) {
  const index = ONBOARDING_STEPS.indexOf(step);
  return { index, number: index + 1, total: ONBOARDING_STEPS.length, next: ONBOARDING_STEPS[index + 1] ?? null };
}

export function validateIdentity(firstName: string, gender: Gender | null) {
  return {
    firstName: firstName.trim() ? undefined : 'Enter the first name people should call you.',
    gender: gender ? undefined : 'Choose how you describe yourself.',
  };
}

export function validateDiscovery(interestedIn: Gender[], minAge: number, maxAge: number, distance: number) {
  return {
    audience: interestedIn.length ? undefined : 'Choose at least one group of people to meet.',
    age: Number.isInteger(minAge) && Number.isInteger(maxAge) && minAge >= 18 && maxAge <= 100 && minAge < maxAge ? undefined : 'Choose an age range from 18 to 100.',
    distance: Number.isInteger(distance) && distance >= 1 && distance <= 500 ? undefined : 'Choose a distance from 1 to 500 km.',
  };
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
