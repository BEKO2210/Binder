import * as Location from 'expo-location';

import { recordBetaEvent } from './beta';
import { supabase } from './supabase';

export type DiscoveryProfile = {
  id: string;
  name: string;
  age: number;
  distanceKm: number;
  bio: string;
  tags: string[];
  photoUrl: string;
};

export type DecisionResult = {
  targetUserId: string;
  decision: 'bind' | 'pass';
  matched: boolean;
  matchId: string | null;
  matchCreated: boolean;
};

export async function refreshDiscoveryLocation(): Promise<void> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission is required to discover nearby people.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { error } = await supabase.rpc('set_my_location', {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  if (error) throw error;
}

export async function fetchDiscoveryBatch(limit = 20): Promise<DiscoveryProfile[]> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('get_discovery_batch', { p_limit: limit });
    if (error) throw error;

    const profiles = await Promise.all(
      (data ?? []).map(async (candidate) => {
        const { data: signed, error: signedError } = await supabase.storage
          .from('profile-media')
          .createSignedUrl(candidate.primary_photo_path, 60 * 60);

        if (signedError) throw signedError;

        return {
          id: candidate.target_user_id,
          name: candidate.first_name,
          age: candidate.age,
          distanceKm: candidate.distance_km,
          bio: candidate.bio,
          tags: candidate.interests,
          photoUrl: signed.signedUrl,
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
