export type DiscoveryPresetId = 'nearby' | 'city' | 'wide';

export type DiscoveryPreset = {
  id: DiscoveryPresetId;
  labelKey: string;
  descriptionKey: string;
  minAge: number;
  maxAge: number;
  distance: number;
};

export const discoveryPresets: readonly DiscoveryPreset[] = [
  // The numbers are the contract; the words are translation keys, because this
  // chip is the first thing somebody reads in the discovery filter.
  { id: 'nearby', labelKey: 'discoveryPreferences.presets.nearby.label', descriptionKey: 'discoveryPreferences.presets.nearby.description', minAge: 22, maxAge: 36, distance: 10 },
  { id: 'city', labelKey: 'discoveryPreferences.presets.city.label', descriptionKey: 'discoveryPreferences.presets.city.description', minAge: 20, maxAge: 45, distance: 30 },
  { id: 'wide', labelKey: 'discoveryPreferences.presets.wide.label', descriptionKey: 'discoveryPreferences.presets.wide.description', minAge: 18, maxAge: 60, distance: 100 },
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
