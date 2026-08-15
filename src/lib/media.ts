import { File } from 'expo-file-system';

import type { PreparedImage } from './images';
import { supabase } from './supabase';

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export async function replaceProfileImage(
  userId: string,
  image: PreparedImage,
  position = 0,
): Promise<string> {
  const file = new File(image.uri);
  const payload = await file.arrayBuffer();

  if (payload.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Compressed image is still larger than 3 MB. Choose another photo.');
  }

  const suffix = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${Date.now()}-${position}-${suffix}.webp`;

  const { data: previous, error: previousError } = await supabase
    .from('profile_media')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('position', position)
    .maybeSingle();

  if (previousError) throw previousError;

  const { error: uploadError } = await supabase.storage.from('profile-media').upload(path, payload, {
    contentType: 'image/webp',
    upsert: false,
    cacheControl: '3600',
  });

  if (uploadError) throw uploadError;

  const { error: metadataError } = await supabase.from('profile_media').upsert(
    {
      user_id: userId,
      storage_path: path,
      position,
      width: image.width,
      height: image.height,
      byte_size: payload.byteLength,
      mime_type: image.mimeType,
    },
    { onConflict: 'user_id,position' },
  );

  if (metadataError) {
    await supabase.storage.from('profile-media').remove([path]);
    throw metadataError;
  }

  if (previous?.storage_path && previous.storage_path !== path) {
    await supabase.storage.from('profile-media').remove([previous.storage_path]);
  }

  return path;
}

export async function signedProfileImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('profile-media').createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}
