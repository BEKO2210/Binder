export type ProfileCompletenessInput = { photoCount: number; bio: string; interestCount: number };
/** `label` is a translation key, resolved by the screen that shows it. */
export type CompletenessItem = { key: 'photos' | 'bio' | 'interests'; label: string; complete: boolean };

export function profileCompleteness(input: ProfileCompletenessInput) {
  const items: CompletenessItem[] = [
    { key: 'photos', label: 'profile.completeness.items.photos', complete: input.photoCount >= 3 },
    { key: 'bio', label: 'profile.completeness.items.bio', complete: input.bio.trim().length >= 20 },
    { key: 'interests', label: 'profile.completeness.items.interests', complete: input.interestCount >= 3 },
  ];
  const completed = items.filter((item) => item.complete).length;
  return { items, completed, total: items.length, percent: Math.round(completed / items.length * 100), complete: completed === items.length };
}
