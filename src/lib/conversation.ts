import * as Crypto from 'expo-crypto';

import { recordBetaEvent } from './beta';
import { supabase } from './supabase';
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

async function signProfilePhoto(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null;

  const { data, error } = await supabase.storage
    .from('profile-media')
    .createSignedUrl(storagePath, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export async function fetchMatches(): Promise<MatchSummary[]> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('get_my_matches');
    if (error) throw error;

    const matches = await Promise.all(
      (data ?? []).map(async (match) => ({
        matchId: match.match_id,
        otherUserId: match.other_user_id,
        firstName: match.first_name,
        age: match.age,
        bio: match.bio,
        photoUrl: await signProfilePhoto(match.primary_photo_path),
        matchedAt: match.matched_at,
        lastMessageBody: match.last_message_body ?? null,
        lastMessageAt: match.last_message_at ?? null,
        unreadCount: Number(match.unread_count ?? 0),
      })),
    );

    void recordBetaEvent('matches_load', 'matches', {
      durationMs: Date.now() - startedAt,
      value: matches.length,
      outcome: matches.length === 0 ? 'empty' : 'ok',
    });
    return matches;
  } catch (error) {
    void recordBetaEvent('matches_load', 'matches', { durationMs: Date.now() - startedAt, outcome: 'error' });
    throw error;
  }
}

export async function fetchMessages(matchId: string): Promise<Message[]> {
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, match_id, sender_id, client_message_id, body, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;
    const messages = data ?? [];
    void recordBetaEvent('chat_load', 'chat', {
      durationMs: Date.now() - startedAt,
      value: messages.length,
      outcome: messages.length === 0 ? 'empty' : 'ok',
    });
    return messages;
  } catch (error) {
    void recordBetaEvent('chat_load', 'chat', { durationMs: Date.now() - startedAt, outcome: 'error' });
    throw error;
  }
}

export function createClientMessageId(): string {
  return Crypto.randomUUID();
}

export async function sendMessage(
  matchId: string,
  clientMessageId: string,
  body: string,
): Promise<Message> {
  const { data, error } = await supabase.rpc('send_message', {
    p_match_id: matchId,
    p_client_message_id: clientMessageId,
    p_body: body,
  });

  if (error) throw error;
  const message = data?.[0];
  if (!message) throw new Error('Message send did not return a server result.');

  return {
    ...message,
    client_message_id: clientMessageId,
  };
}

export async function markMatchRead(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_match_read', { p_match_id: matchId });
  if (error) throw error;
}

export async function unmatch(matchId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unmatch', { p_match_id: matchId });
  if (error) throw error;
  return data;
}

export async function blockUser(userId: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const currentUserId = sessionData.session?.user.id;
  if (!currentUserId) throw new Error('Authentication required.');

  const { error } = await supabase.from('blocks').upsert(
    { blocker_id: currentUserId, blocked_id: userId },
    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function reportUser(options: {
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  matchId?: string;
  messageId?: string;
  block?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('report_user', {
    p_reported_id: options.reportedUserId,
    p_reason: options.reason,
    p_details: options.details ?? '',
    p_match_id: options.matchId,
    p_message_id: options.messageId,
    p_block: options.block ?? true,
  });

  if (error) throw error;
  return data;
}

export function subscribeToMessages(
  matchId: string,
  onMessage: (message: Message) => void,
  onError?: (message: string) => void,
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
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(error?.message ?? 'Realtime connection failed.');
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
