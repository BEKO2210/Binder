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
  // A code, not a sentence: this reaches the screen, and the screen speaks
  // fifteen languages. An English sentence thrown from here appeared verbatim
  // in all of them.
  if (payload.byteLength > MAX_UPLOAD_BYTES) throw new Error('binder/photo-too-large');
  return payload;
}

async function uploadPreparedImage(userId: string, image: PreparedImage): Promise<{ path: string; byteSize: number }> {
  const payload = await payloadFor(image);
  const path = `${userId}/${Date.now()}-${Crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from('profile-media').upload(path, payload, { contentType: 'image/webp', upsert: false, cacheControl: '3600' });
  if (error) throw error;
  return { path, byteSize: payload.byteLength };
}

export async function addProfileImage(userId: string, image: PreparedImage, onUploading?: () => void): Promise<RegisteredMediaRow> {
  onUploading?.();
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
    throw new Error('binder/photo-not-registered');
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
  // The server decides first, the file goes second.
  //
  // The old order deleted the object and then asked. When the server refused —
  // it refuses to remove the last approved photo, which is the case a person
  // is most likely to try — the row stayed and pointed at a file that no
  // longer existed. A profile with a permanently broken photo, and no way back.
  //
  // Doing it the other way can leave an object in the bucket that no row
  // addresses. That costs storage and is invisible to the person; the RPC
  // returns the paths it detached, so the cleanup below removes them, and a
  // cleanup that fails is not worth failing the whole operation over.
  const { data, error } = await phase6Rpc<RemovedMediaRow[]>('remove_my_profile_media', { p_media_id: mediaId });
  if (error) throw error;

  const paths = (data ?? []).map((row) => row.storage_path).filter(Boolean);
  if (paths.length === 0) return;
  await supabase.storage.from('profile-media').remove(paths);
}

// Half an hour, deliberately short.
//
// A signed URL is a bearer token: it keeps working until it expires, whatever
// happens to the block list or the moderation state behind it. Stretching it to
// four hours to spare people a stale photo also gave a blocked person four
// hours of access to pictures their app had already fetched — the same hole
// this week closed for voice messages. A picture that goes blank after half an
// hour is a nuisance; the other way round is a safety promise that does not
// hold.
const SIGNED_URL_SECONDS = 60 * 30;

export async function signedProfileImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('profile-media').createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
