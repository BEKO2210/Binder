import type { PostgrestError } from '@supabase/supabase-js';
import { Linking } from 'react-native';

import { supabase } from './supabase';

export const BINDER_PUBLIC_URL = 'https://beko2210.github.io/Binder';
export const PRIVACY_URL = `${BINDER_PUBLIC_URL}/privacy.html`;
export const TERMS_URL = `${BINDER_PUBLIC_URL}/terms.html`;
export const DELETE_ACCOUNT_URL = `${BINDER_PUBLIC_URL}/delete-account.html`;

type LegalGateRow = {
  terms_version: string;
  privacy_version: string;
  accepted: boolean;
};

type Phase4Rpc = {
  <T = unknown>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: PostgrestError | null }>;
};

// Phase 4 is intentionally not deployed to production before the compatible app
// is ready. The local DB tests validate these RPC names/signatures; after the
// coordinated deploy, database.ts is regenerated from the live schema.
const phase4Rpc = supabase.rpc.bind(supabase) as unknown as Phase4Rpc;

export async function getLegalGate(): Promise<LegalGateRow> {
  const { data, error } = await phase4Rpc<LegalGateRow[]>('get_legal_gate');
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('Binder policy state is unavailable.');
  return row;
}

export async function acceptCurrentLegalGate(gate: LegalGateRow): Promise<void> {
  const { error } = await phase4Rpc('accept_legal_terms', {
    p_terms_version: gate.terms_version,
    p_privacy_version: gate.privacy_version,
  });
  if (error) throw error;
}

export async function openBinderUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('This link cannot be opened on this device.');
  await Linking.openURL(url);
}

export async function deleteCurrentAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
