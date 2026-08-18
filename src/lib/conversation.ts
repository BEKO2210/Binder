import * as Crypto from 'expo-crypto';

import { recordBetaEvent } from './beta';
import { abortable, throwIfAborted } from './reliability';
import { supabase } from './supabase';
import { voiceObjectPath } from './voiceMessage.ts';
import type { Database } from '../types/database';

export type Message = Database['public']['Tables']['messages']['Row'];

export type MatchSummary = {
  matchId: string;
  otherUserId: string;
  firstName: string;
  age: number;
  bio: string;
  photoUrl: string | null;
  matchedAt: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageKind: 'text' | 'voice' | null;
  unreadCount: number;
};

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'underage'
  | 'fake'
  | 'sexual_content'
  | 'violence'
  | 'other';

export type RequestOptions = { signal?: AbortSignal };

async function signProfilePhoto(storagePath: string | null | undefined, signal?: AbortSignal): Promise<string | null> {
  if (!storagePath) return null;

  const { data, error } = await abortable(supabase.storage
    .from('profile-media')
    .createSignedUrl(storagePath, 60 * 60), signal);

  if (error) throw error;
  return data.signedUrl;
}

export async function fetchMatches(options: RequestOptions = {}): Promise<MatchSummary[]> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('get_my_matches').abortSignal(options.signal ?? new AbortController().signal);
    if (error) throw error;

    const matches = await Promise.all(
      (data ?? []).map(async (match) => ({
        matchId: match.match_id,
        otherUserId: match.other_user_id,
        firstName: match.first_name,
        age: match.age,
        bio: match.bio,
        photoUrl: await signProfilePhoto(match.primary_photo_path, options.signal),
        matchedAt: match.matched_at,
        lastMessageBody: match.last_message_body ?? null,
        lastMessageAt: match.last_message_at ?? null,
        lastMessageKind: match.last_message_kind === 'voice' ? 'voice' as const : match.last_message_kind === 'text' ? 'text' as const : null,
        unreadCount: Number(match.unread_count ?? 0),
      })),
    );

    if (!options.signal) {
      void recordBetaEvent('matches_load', 'matches', {
        durationMs: Date.now() - startedAt,
        value: matches.length,
        outcome: matches.length === 0 ? 'empty' : 'ok',
      });
    }
    return matches;
  } catch (error) {
    if (!options.signal) void recordBetaEvent('matches_load', 'matches', { durationMs: Date.now() - startedAt, outcome: 'error' });
    throw error;
  }
}

export type MessagePage = { messages: Message[]; hasMore: boolean };

export async function fetchMessagesPage(matchId: string, before?: Message, limit = 50, options: RequestOptions = {}): Promise<MessagePage> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('get_match_messages_page', {
      p_match_id: matchId,
      p_before_created_at: before?.created_at,
      p_before_id: before?.id,
      p_limit: limit,
    }).abortSignal(options.signal ?? new AbortController().signal);

    if (error) throw error;
    const messages = [...(data ?? [])].reverse();
    if (!options.signal) {
      void recordBetaEvent('chat_load', 'chat', {
        durationMs: Date.now() - startedAt,
        value: messages.length,
        outcome: messages.length === 0 ? 'empty' : 'ok',
      });
    }
    return { messages, hasMore: messages.length === limit };
  } catch (error) {
    if (!options.signal) void recordBetaEvent('chat_load', 'chat', { durationMs: Date.now() - startedAt, outcome: 'error' });
    throw error;
  }
}

export async function fetchMessages(matchId: string, options: RequestOptions = {}): Promise<Message[]> {
  return (await fetchMessagesPage(matchId, undefined, 50, options)).messages;
}

export function createClientMessageId(): string {
  return Crypto.randomUUID();
}

export async function sendMessage(
  matchId: string,
  clientMessageId: string,
  body: string,
  options: RequestOptions = {},
): Promise<Message> {
  const { data, error } = await supabase.rpc('send_message', {
    p_match_id: matchId,
    p_client_message_id: clientMessageId,
    p_body: body,
  }).abortSignal(options.signal ?? new AbortController().signal);

  if (error) throw error;
  const message = data?.[0];
  if (!message) throw new Error('Message send did not return a server result.');

  return {
    ...message,
    client_message_id: clientMessageId,
  };
}

/**
 * Upload a finished recording and send the message that references it.
 *
 * Upload first, row second — the reference guard refuses a message whose
 * object does not exist, so the order is not a choice. A failed send after a
 * successful upload leaves an orphan object; retrying with the same client id
 * and the same path converges on one message, and an orphan nobody references
 * is unreadable to everyone but its match.
 */
export async function uploadVoiceRecording(
  matchId: string,
  senderId: string,
  localUri: string,
  options: RequestOptions = {},
): Promise<string> {
  const response = await abortable(fetch(localUri), options.signal);
  const payload = await abortable(response.arrayBuffer(), options.signal);
  throwIfAborted(options.signal);
  const path = voiceObjectPath(matchId, senderId, Crypto.randomUUID());
  const { error } = await supabase.storage.from('voice-media').upload(path, payload, { contentType: 'audio/mp4', upsert: false });
  if (error) throw error;
  return path;
}

export async function sendVoiceMessage(
  matchId: string,
  clientMessageId: string,
  audioPath: string,
  durationMs: number,
  options: RequestOptions = {},
): Promise<Message> {
  const { data, error } = await supabase.rpc('send_message', {
    p_match_id: matchId,
    p_client_message_id: clientMessageId,
    p_kind: 'voice',
    p_audio_path: audioPath,
    p_audio_duration_ms: Math.round(durationMs),
  }).abortSignal(options.signal ?? new AbortController().signal);

  if (error) throw error;
  const message = data?.[0];
  if (!message) throw new Error('Message send did not return a server result.');
  return { ...message, client_message_id: clientMessageId };
}

/** A short-lived playback URL; the bubble fetches it on first play. */
export async function signedVoiceUrl(audioPath: string, options: RequestOptions = {}): Promise<string> {
  const { data, error } = await abortable(supabase.storage.from('voice-media').createSignedUrl(audioPath, 60 * 60), options.signal);
  if (error) throw error;
  return data.signedUrl;
}

export async function markMatchRead(matchId: string, options: RequestOptions = {}): Promise<void> {
  const { error } = await supabase.rpc('mark_match_read', { p_match_id: matchId }).abortSignal(options.signal ?? new AbortController().signal);
  if (error) throw error;
}

export async function unmatch(matchId: string, options: RequestOptions = {}): Promise<boolean> {
  const { data, error } = await supabase.rpc('unmatch', { p_match_id: matchId }).abortSignal(options.signal ?? new AbortController().signal);
  if (error) throw error;
  return data;
}

export async function blockUser(userId: string, options: RequestOptions = {}): Promise<void> {
  const { data: sessionData, error: sessionError } = await abortable(supabase.auth.getSession(), options.signal);
  if (sessionError) throw sessionError;
  const currentUserId = sessionData.session?.user.id;
  if (!currentUserId) throw new Error('Authentication required.');

  throwIfAborted(options.signal);
  const { error } = await supabase.from('blocks').upsert(
    { blocker_id: currentUserId, blocked_id: userId },
    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
  ).abortSignal(options.signal ?? new AbortController().signal);
  if (error) throw error;
}

export async function reportUser(options: {
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  matchId?: string;
  messageId?: string;
  block?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const { data, error } = await supabase.rpc('report_user', {
    p_reported_id: options.reportedUserId,
    p_reason: options.reason,
    p_details: options.details ?? '',
    p_match_id: options.matchId,
    p_message_id: options.messageId,
    p_block: options.block ?? true,
  }).abortSignal(options.signal ?? new AbortController().signal);

  if (error) throw error;
  return data;
}

export function subscribeToMessages(
  matchId: string,
  onMessage: (message: Message) => void,
  onError?: (message: string) => void,
  onMatchEnded?: () => void,
): () => void {
  const channel = supabase
    .channel(`messages:${matchId}:${Crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        onMessage(payload.new as Message);
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      (payload) => {
        if ((payload.new as { status?: string }).status !== 'active') onMatchEnded?.();
      },
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(error?.message ?? 'Realtime connection failed.');
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
