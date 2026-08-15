import type { PostgrestError } from '@supabase/supabase-js';
import { Linking } from 'react-native';

import { supabase } from './supabase';

export const BINDER_PUBLIC_URL = 'https://beko2210.github.io/Binder';
export const PRIVACY_URL = `${BINDER_PUBLIC_URL}/privacy.html`;
export const TERMS_URL = `${BINDER_PUBLIC_URL}/terms.html`;
export const DELETE_ACCOUNT_URL = `${BINDER_PUBLIC_URL}/delete-account.html`;

export type LegalGate = {
  terms_version: string;
  privacy_version: string;
  accepted: boolean;
};

export type MediaModerationState = {
  storage_path: string;
  moderation_status: 'pending' | 'approved' | 'rejected' | 'removed';
  moderation_reason: string | null;
};

export type DiscoveryReportReason = 'spam' | 'harassment' | 'underage' | 'fake' | 'sexual_content' | 'violence' | 'other';

type Phase4Rpc = {
  <T = unknown>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: PostgrestError | null }>;
};

// Phase 4 is intentionally not deployed to production before the compatible app
// is ready. Local DB tests validate these RPC names/signatures. After the
// coordinated deploy, database.ts is regenerated from the live schema and this
// temporary compatibility boundary can be narrowed to generated RPC types.
const phase4Rpc = supabase.rpc.bind(supabase) as unknown as Phase4Rpc;

export async function getLegalGate(): Promise<LegalGate> {
  const { data, error } = await phase4Rpc<LegalGate[]>('get_legal_gate');
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('Binder policy state is unavailable.');
  return row;
}

export async function acceptCurrentLegalGate(gate: LegalGate): Promise<void> {
  const { error } = await phase4Rpc('accept_legal_terms', {
    p_terms_version: gate.terms_version,
    p_privacy_version: gate.privacy_version,
  });
  if (error) throw error;
}

export async function getMyPrimaryMediaState(): Promise<MediaModerationState | null> {
  const { data, error } = await phase4Rpc<MediaModerationState[]>('get_my_primary_media_state');
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function reportAndBlockDiscoveryProfile(targetUserId: string, reason: DiscoveryReportReason): Promise<void> {
  const { error } = await supabase.rpc('report_user', {
    p_reported_id: targetUserId,
    p_reason: reason,
    p_details: '',
    p_match_id: undefined,
    p_message_id: undefined,
    p_block: true,
  });
  if (error) throw error;
}

export async function openBinderUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('This link cannot be opened on this device.');
  await Linking.openURL(url);
}

export async function deleteCurrentAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean; error?: string }>('delete-account', { method: 'POST' });
  if (error) throw error;
  if (!data?.deleted) throw new Error(data?.error ?? 'Binder could not confirm account deletion.');
  await supabase.auth.signOut({ scope: 'local' });
}
