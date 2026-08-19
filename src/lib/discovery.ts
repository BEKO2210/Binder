import * as Location from 'expo-location';

import { recordBetaEvent } from './beta';
import { mapDiscoveryPreferences, type DiscoveryPreferencesRow } from './discoveryPreferences';
import { activeFilterCount, parseStoredFilters } from './attributeFilters';
import { supabase } from './supabase';
import type { DiscoveryPreferenceValues } from '../components/DiscoveryPreferences';

/**
 * How many attribute fields the person is filtering on.
 *
 * The header line can honestly say "18–45 within 50 km" and still describe a
 * deck that is far narrower, because ten more filters may be set out of
 * sight. This is what makes that visible.
 */
export async function loadAttributeFilterCount(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return 0;
  const { data, error } = await supabase.from('user_preferences').select('attribute_filters').eq('user_id', uid).single();
  if (error) return 0;
  return activeFilterCount(parseStoredFilters(data.attribute_filters));
}

export async function loadDiscoveryPreferences(): Promise<DiscoveryPreferenceValues> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData.user?.id;
  if (!uid) throw new Error('Authentication required.');
  const { data, error } = await supabase
    .from('user_preferences')
    .select('interested_in,min_age,max_age,max_distance_km')
    .eq('user_id', uid)
    .single();
  if (error) throw error;
  return mapDiscoveryPreferences(data as DiscoveryPreferencesRow);
}

export type DiscoveryProfile = {
  id: string;
  name: string;
  age: number;
  distanceKm: number;
  bio: string;
  tags: string[];
  photoUrl: string;
  photoUrls: string[];
};

export type DecisionResult = {
  targetUserId: string;
  decision: 'bind' | 'pass';
  matched: boolean;
  matchId: string | null;
  matchCreated: boolean;
};

/** How old a stored position may be before discovery insists on a fresh one. */
export const LAST_KNOWN_POSITION_MAX_AGE_MS = 15 * 60 * 1000;

export async function refreshDiscoveryLocation(): Promise<boolean> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return false;
  }

  // A fix the phone already has beats a fix it has to go and get. Asking for a
  // fresh position indoors took longer than the screen's own deadline on the
  // S23 — the deck said "Binder hat zu lange gebraucht" before it had ever
  // loaded. Discovery is a radius in kilometres; a position from the last
  // quarter of an hour is exactly as good for that, and it arrives at once.
  const recent = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_POSITION_MAX_AGE_MS });
  const position = recent ?? await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { error } = await supabase.rpc('set_my_location', {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  if (error) throw error;
  return true;
}

export async function countDiscoveryCandidates(values: DiscoveryPreferenceValues): Promise<number> {
  const { data, error } = await supabase.rpc('count_discovery_candidates', {
    p_interested_in: values.interestedIn,
    p_min_age: values.minAge,
    p_max_age: values.maxAge,
    p_distance_km: values.distance,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function fetchDiscoveryBatch(limit = 20): Promise<DiscoveryProfile[]> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('get_discovery_batch', { p_limit: limit });
    if (error) throw error;

    const candidates = data ?? [];
    const candidateIds = candidates.map((candidate) => candidate.target_user_id);
    const { data: galleryRows, error: galleryError } = candidateIds.length > 0
      ? await supabase
        .from('profile_media')
        .select('user_id,storage_path,position')
        .in('user_id', candidateIds)
        .eq('moderation_status', 'approved')
        .order('position', { ascending: true })
      : { data: [], error: null };
    // A failed gallery query is an error, not a candidate with one photo:
    // swallowing it made a broken read look like a thin profile.
    if (galleryError) throw galleryError;

    const galleryPaths = new Map<string, string[]>();
    for (const row of galleryRows ?? []) {
      const paths = galleryPaths.get(row.user_id) ?? [];
      paths.push(row.storage_path);
      galleryPaths.set(row.user_id, paths);
    }

    const profiles = await Promise.all(
      candidates.map(async (candidate) => {
        const paths = galleryPaths.get(candidate.target_user_id) ?? [candidate.primary_photo_path];
        const signedPhotos = await Promise.all(paths.map(async (path) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from('profile-media')
            .createSignedUrl(path, 60 * 60);

          if (signedError) return null;
          return signed.signedUrl;
        }));
        const photoUrls = signedPhotos.filter((url): url is string => Boolean(url));
        if (photoUrls.length === 0) {
          const { data: signed, error: signedError } = await supabase.storage
            .from('profile-media')
            .createSignedUrl(candidate.primary_photo_path, 60 * 60);
          if (signedError) throw signedError;
          photoUrls.push(signed.signedUrl);
        }
        const primaryPhotoUrl = photoUrls[0];
        if (!primaryPhotoUrl) throw new Error('Discovery profile did not return a usable photo.');

        return {
          id: candidate.target_user_id,
          name: candidate.first_name,
          age: candidate.age,
          distanceKm: candidate.distance_km,
          bio: candidate.bio,
          tags: candidate.interests,
          photoUrl: primaryPhotoUrl,
          photoUrls,
        } satisfies DiscoveryProfile;
      }),
    );

    void recordBetaEvent('discovery_load', 'discover', {
      durationMs: Date.now() - startedAt,
      value: profiles.length,
      outcome: profiles.length === 0 ? 'empty' : 'ok',
    });
    return profiles;
  } catch (error) {
    void recordBetaEvent('discovery_load', 'discover', { durationMs: Date.now() - startedAt, outcome: 'error' });
    throw error;
  }
}

export async function recordDecision(
  targetUserId: string,
  decision: 'bind' | 'pass',
): Promise<DecisionResult> {
  const { data, error } = await supabase.rpc('record_decision', {
    p_target_user_id: targetUserId,
    p_decision: decision,
  });

  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('Decision did not return a server result.');

  return {
    targetUserId: result.target_user_id,
    decision: result.decision as 'bind' | 'pass',
    matched: result.matched,
    matchId: result.match_id,
    matchCreated: result.match_created,
  };
}
