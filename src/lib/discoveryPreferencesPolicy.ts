export type DiscoveryPresetId = 'nearby' | 'city' | 'wide';

export type DiscoveryPreset = {
  id: DiscoveryPresetId;
  label: string;
  description: string;
  minAge: number;
  maxAge: number;
  distance: number;
};

export const discoveryPresets: readonly DiscoveryPreset[] = [
  { id: 'nearby', label: 'Nearby', description: 'Up to 10 km · ages 22–36', minAge: 22, maxAge: 36, distance: 10 },
  { id: 'city', label: 'My city', description: 'Up to 30 km · ages 20–45', minAge: 20, maxAge: 45, distance: 30 },
  { id: 'wide', label: 'Wide', description: 'Up to 100 km · ages 18–60', minAge: 18, maxAge: 60, distance: 100 },
] as const;

export const discoveryCountDebounceMs = 450;

type PresetValues = Pick<DiscoveryPreset, 'minAge' | 'maxAge' | 'distance'>;

export function matchingDiscoveryPreset(values: PresetValues): DiscoveryPresetId | null {
  return discoveryPresets.find((preset) => preset.minAge === values.minAge
    && preset.maxAge === values.maxAge
    && preset.distance === values.distance)?.id ?? null;
}

export function likelyEmptyFilter(values: PresetValues & { interestedIn: readonly string[] }): 'audience' | 'age' | 'distance' {
  if (values.interestedIn.length === 0) return 'audience';
  const ageCoverage = Math.max(0, values.maxAge - values.minAge) / 82;
  const distanceCoverage = Math.max(0, values.distance) / 500;
  return ageCoverage <= distanceCoverage ? 'age' : 'distance';
}
