import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import type { PostgrestError } from '@supabase/supabase-js';

import type { PreparedImage } from './images';
import { supabase } from './supabase';

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export type GalleryMedia = {
  id: string;
  storagePath: string;
  position: number;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
  signedUrl: string;
};

type RegisteredMediaRow = {
  id: string;
  storage_path: string;
  media_position: number;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  created_at: string;
};

type RemovedMediaRow = { storage_path: string };

type Phase6Rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: PostgrestError | null }>;
const phase6Rpc = supabase.rpc.bind(supabase) as unknown as Phase6Rpc;

function parseModerationStatus(value: string): ModerationStatus {
  if (value === 'pending' || value === 'approved' || value === 'rejected' || value === 'removed') return value;
  throw new Error(`Unexpected profile-media moderation state: ${value}`);
}

async function payloadFor(image: PreparedImage): Promise<ArrayBuffer> {
  const file = new File(image.uri);
  const payload = await file.arrayBuffer();
  if (payload.byteLength > MAX_UPLOAD_BYTES) throw new Error('Compressed image is still larger than 3 MB. Choose another photo.');
  return payload;
}

async function uploadPreparedImage(userId: string, image: PreparedImage): Promise<{ path: string; byteSize: number }> {
  const payload = await payloadFor(image);
  const path = `${userId}/${Date.now()}-${Crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from('profile-media').upload(path, payload, { contentType: 'image/webp', upsert: false, cacheControl: '3600' });
  if (error) throw error;
  return { path, byteSize: payload.byteLength };
}

export async function addProfileImage(userId: string, image: PreparedImage): Promise<RegisteredMediaRow> {
  const uploaded = await uploadPreparedImage(userId, image);
  const { data, error } = await phase6Rpc<RegisteredMediaRow[]>('register_profile_media', {
    p_storage_path: uploaded.path,
    p_width: image.width,
    p_height: image.height,
    p_byte_size: uploaded.byteSize,
    p_mime_type: image.mimeType,
  });
  if (error || !data?.[0]) {
    await supabase.storage.from('profile-media').remove([uploaded.path]);
    if (error) throw error;
    throw new Error('Binder could not register the prepared profile photo.');
  }
  return data[0];
}

export async function listMyProfileMedia(): Promise<GalleryMedia[]> {
  // RLS deliberately also grants read on OTHER users' media once their profile
  // is viewable (discovery/matches need that), so "my media" must filter on
  // the signed-in user explicitly — otherwise a match's photos leak into the
  // own-profile surfaces after an account switch.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData.user?.id;
  if (!uid) throw new Error('Authentication required.');
  const { data, error } = await supabase.from('profile_media').select('id,storage_path,position,moderation_status,moderation_reason,width,height,byte_size,created_at').eq('user_id', uid).order('position', { ascending: true });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (row) => ({
    id: row.id,
    storagePath: row.storage_path,
    position: row.position,
    moderationStatus: parseModerationStatus(row.moderation_status),
    moderationReason: row.moderation_reason,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    signedUrl: await signedProfileImageUrl(row.storage_path),
  })));
}

export async function reorderProfileMedia(mediaIds: string[]): Promise<void> {
  const { error } = await phase6Rpc('reorder_my_profile_media', { p_media_ids: mediaIds });
  if (error) throw error;
}

export async function setPrimaryProfileMedia(mediaId: string): Promise<void> {
  const { error } = await phase6Rpc('set_primary_profile_media', { p_media_id: mediaId });
  if (error) throw error;
}

export async function removeProfileMedia(mediaId: string): Promise<void> {
  // The storage object goes first and the row second, because that order is
  // the only one a retry can finish: removing an object that is already gone
  // succeeds, while the row still carries the path the retry needs. The other
  // way round, a failed cleanup left an orphan in the bucket that nothing
  // could ever address again.
  const { data: rows, error: lookupError } = await supabase
    .from('profile_media')
    .select('storage_path')
    .eq('id', mediaId)
    .limit(1);
  if (lookupError) throw lookupError;
  const path = rows?.[0]?.storage_path;
  if (!path) throw new Error('That photo is no longer in your gallery.');

  const { error: cleanupError } = await supabase.storage.from('profile-media').remove([path]);
  if (cleanupError) throw new Error('Binder could not remove the photo file. Try again.');

  const { error } = await phase6Rpc<RemovedMediaRow[]>('remove_my_profile_media', { p_media_id: mediaId });
  if (error) throw error;
}

export async function signedProfileImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('profile-media').createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}
