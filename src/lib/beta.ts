import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Read from the build instead of a constant someone has to remember to raise:
// diagnostics that report a stale version cannot be traced back to a build.
export const BINDER_APP_VERSION = String(Constants.expoConfig?.version ?? '0.0.0').slice(0, 32);

export type BetaEventName =
  | 'app_session'
  | 'legal_gate_load'
  | 'discovery_load'
  | 'matches_load'
  | 'chat_load'
  | 'profile_load'
  | 'client_render_error';

export type BetaSurface = 'app' | 'legal' | 'discover' | 'matches' | 'chat' | 'profile' | 'beta';
export type BetaOutcome = 'ok' | 'error' | 'empty' | 'cancel';
export type BetaFeedbackCategory = 'bug' | 'ux' | 'safety' | 'performance' | 'other';

export type BetaSettings = {
  diagnostics_enabled: boolean;
  rank_variant: string;
  client_retention_days: number;
  ranking_retention_days: number;
};

const sessionId = Crypto.randomUUID();
let diagnosticsEnabled: boolean | null = null;

export async function getBetaSettings(): Promise<BetaSettings> {
  const { data, error } = await supabase.rpc('get_beta_settings');
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('Binder beta settings are unavailable.');
  diagnosticsEnabled = row.diagnostics_enabled;
  return row;
}

export async function initializeBetaDiagnostics(): Promise<void> {
  try {
    await getBetaSettings();
  } catch {
    diagnosticsEnabled = null;
  }
}

export function betaDiagnosticsEnabled(): boolean {
  return diagnosticsEnabled === true;
}

export async function setBetaDiagnostics(enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_beta_diagnostics', { p_enabled: enabled });
  if (error) throw error;
  diagnosticsEnabled = data === true;
  return diagnosticsEnabled;
}

export async function recordBetaEvent(
  eventName: BetaEventName,
  surface: BetaSurface,
  options: { durationMs?: number; value?: number; outcome?: BetaOutcome } = {},
): Promise<boolean> {
  if (!diagnosticsEnabled) return false;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const durationMs = options.durationMs === undefined ? null : Math.max(0, Math.min(120000, Math.round(options.durationMs)));
  const value = options.value === undefined ? null : Math.max(0, Math.min(1000, Math.round(options.value)));

  try {
    const { data, error } = await supabase.rpc('record_beta_client_event', {
      p_event_id: Crypto.randomUUID(),
      p_session_id: sessionId,
      p_event_name: eventName,
      p_surface: surface,
      // PostgreSQL accepts NULL for these non-STRICT integer parameters; the
      // generated Supabase function type does not currently encode that nullability.
      p_duration_ms: durationMs as number,
      p_value: value as number,
      p_outcome: options.outcome ?? 'ok',
      p_platform: platform,
      p_app_version: BINDER_APP_VERSION,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function submitBetaFeedback(
  category: BetaFeedbackCategory,
  rating: number,
  details: string,
): Promise<string> {
  const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
  const safeDetails = details.trim().slice(0, 1500);
  const { data, error } = await supabase.rpc('submit_beta_feedback', {
    p_category: category,
    p_rating: safeRating,
    p_details: safeDetails,
  });
  if (error) throw error;
  if (!data) throw new Error('Binder could not confirm your beta feedback.');
  return data;
}
