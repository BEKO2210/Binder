import type { DiscoveryPreferenceValues } from '../components/DiscoveryPreferences';
import type { Gender } from './validation';

export type DiscoveryPreferencesRow = {
  interested_in: Gender[];
  min_age: number;
  max_age: number;
  max_distance_km: number;
};

export function mapDiscoveryPreferences(row: DiscoveryPreferencesRow): DiscoveryPreferenceValues {
  return {
    interestedIn: row.interested_in,
    minAge: row.min_age,
    maxAge: row.max_age,
    distance: row.max_distance_km,
  };
}
