import * as Crypto from 'expo-crypto';

import { abortable, throwIfAborted } from './reliability.ts';
import { supabase } from './supabase.ts';

export type VoiceIntro = { path: string; durationMs: number };

export async function loadMyVoiceIntro(userId: string, signal?: AbortSignal): Promise<VoiceIntro | null> {
  const { data, error } = await abortable(
    Promise.resolve(supabase.from('profile_audio').select('storage_path,duration_ms').eq('user_id', userId).maybeSingle()),
    signal,
  );
  if (error) throw error;
  return data ? { path: data.storage_path, durationMs: data.duration_ms } : null;
}

/**
 * Upload first, row second — set_my_voice_intro refuses a path whose object
 * does not exist. Replacing leaves the old object behind on purpose: the row
 * moves atomically, and the orphan is owner-only and cleaned with the account.
 */
export async function saveVoiceIntro(userId: string, localUri: string, durationMs: number, signal?: AbortSignal): Promise<VoiceIntro> {
  const response = await abortable(fetch(localUri), signal);
  const payload = await abortable(response.arrayBuffer(), signal);
  throwIfAborted(signal);
  const path = `${userId}/${Crypto.randomUUID()}.m4a`;
  const uploaded = await supabase.storage.from('profile-voice').upload(path, payload, { contentType: 'audio/mp4', upsert: false });
  if (uploaded.error) throw uploaded.error;
  const { error } = await supabase.rpc('set_my_voice_intro', { p_storage_path: path, p_duration_ms: Math.round(durationMs) });
  if (error) throw error;
  return { path, durationMs };
}

export async function removeVoiceIntro(intro: VoiceIntro): Promise<void> {
  const { error } = await supabase.rpc('clear_my_voice_intro');
  if (error) throw error;
  // Best effort: the row is gone either way, and account deletion sweeps the
  // folder. A failed object removal must not resurrect the intro.
  await supabase.storage.from('profile-voice').remove([intro.path]).catch(() => undefined);
}
