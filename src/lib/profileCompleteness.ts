export type ProfileCompletenessInput = { photoCount: number; bio: string; interestCount: number };
export type CompletenessItem = { key: 'photos' | 'bio' | 'interests'; label: string; complete: boolean };

export function profileCompleteness(input: ProfileCompletenessInput) {
  const items: CompletenessItem[] = [
    { key: 'photos', label: 'Add 3 photos', complete: input.photoCount >= 3 },
    { key: 'bio', label: 'Write a bio', complete: input.bio.trim().length >= 20 },
    { key: 'interests', label: 'Choose 3 interests', complete: input.interestCount >= 3 },
  ];
  const completed = items.filter((item) => item.complete).length;
  return { items, completed, total: items.length, percent: Math.round(completed / items.length * 100), complete: completed === items.length };
}
