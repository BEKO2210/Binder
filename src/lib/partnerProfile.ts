import { signedProfileImageUrl } from './media';
import { supabase } from './supabase';

export type PartnerProfile = {
  userId: string;
  name: string;
  age: number;
  bio: string;
  interests: string[];
  distanceKm: number | null;
  photoUrls: string[];
};

type PublicProfileRow = {
  user_id: string;
  first_name: string;
  age: number;
  bio: string;
  gender: string;
  interests: string[];
};

// Everything here rides on the server's visibility rules: get_public_profile
// answers only for viewable profiles and the media query passes RLS only for
// approved photos of viewable users.
export async function fetchPartnerProfile(userId: string): Promise<PartnerProfile> {
  const [profileResult, distanceResult, mediaResult] = await Promise.all([
    supabase.rpc('get_public_profile', { target_user_id: userId }),
    supabase.rpc('distance_to_user', { target_user_id: userId }),
    supabase.from('profile_media')
      .select('storage_path,position,moderation_status')
      .eq('user_id', userId)
      .eq('moderation_status', 'approved')
      .order('position', { ascending: true }),
  ]);

  if (profileResult.error) throw profileResult.error;
  const row = (profileResult.data as PublicProfileRow[] | null)?.[0];
  if (!row) throw new Error('This profile is not available.');
  // A gallery that failed to load is not an empty gallery. Swallowing this
  // showed a real person as somebody with no photos at all, which is both a
  // lie about them and a reason to pass — the screen has an error state with a
  // retry, and this is what it is for. The distance is different: it is one
  // line of context, and a profile without it is still the truth.
  if (mediaResult.error) throw mediaResult.error;

  const photoUrls = await Promise.all(
    (mediaResult.data ?? []).map((item) => signedProfileImageUrl(item.storage_path)),
  );

  return {
    userId: row.user_id,
    name: row.first_name,
    age: row.age,
    bio: row.bio,
    interests: row.interests ?? [],
    distanceKm: distanceResult.error ? null : (distanceResult.data as number | null),
    photoUrls,
  };
}
