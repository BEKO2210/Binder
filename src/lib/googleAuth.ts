import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';

import { safeLog } from './safeLog';
import { supabase } from './supabase';

// Signing in with Google skips the confirmation mail entirely: Google has
// already proven the address belongs to the person, so Supabase creates a
// confirmed account on the spot. It is also the only sign-in path that keeps
// working when the project's mail budget is spent.
//
// The button only exists once a web client id is configured. Shipping a button
// that opens a Google sheet and then fails is worse than not showing it.
// Public by design — a Google client id ships inside every app that uses it,
// and Supabase verifies the id token against exactly this value. Same pattern
// as the Supabase URL and publishable key in `supabase.ts`.
const DEFAULT_WEB_CLIENT_ID = '1098973922981-qbmvcdi5ser8n2lo4vl5b1cb08vnsi03.apps.googleusercontent.com';
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? DEFAULT_WEB_CLIENT_ID;

export type GoogleSignInOutcome =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: 'play-services' | 'no-id-token' | 'server' | 'signature' };

export function isGoogleSignInConfigured(): boolean {
  return webClientId.trim().length > 0;
}

let configured = false;
function configure() {
  if (configured || !isGoogleSignInConfigured()) return;
  GoogleSignin.configure({ webClientId, scopes: ['email', 'profile'] });
  configured = true;
}

/**
 * Maps the two libraries' outcomes onto Binder's own vocabulary. Kept pure of
 * UI so the screen only has to decide what to say, and so the mapping itself
 * can be tested without a Google account.
 */
export function describeGoogleError(error: unknown): GoogleSignInOutcome {
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) return { status: 'cancelled' };
    if (error.code === statusCodes.IN_PROGRESS) return { status: 'cancelled' };
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { status: 'failed', reason: 'play-services' };
    // DEVELOPER_ERROR means Google does not recognise this build's signing
    // certificate. It cost an evening once: the Play-delivered APK is signed
    // with the app-signing key, not the upload key, and only the upload key was
    // registered. The code is logged so the next occurrence is a log line
    // rather than pulling the APK off the phone to read its certificate.
    safeLog('warn', 'google_sign_in_failed', { code: String(error.code) });
    if (String(error.code) === '10' || String(error.code) === 'DEVELOPER_ERROR') {
      return { status: 'failed', reason: 'signature' };
    }
  }
  return { status: 'failed', reason: 'server' };
}

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  if (!isGoogleSignInConfigured()) return { status: 'unavailable' };
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    // v16 returns a discriminated result: a cancel is not an exception.
    if (result.type === 'cancelled') return { status: 'cancelled' };
    const idToken = result.data?.idToken;
    if (!idToken) return { status: 'failed', reason: 'no-id-token' };
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { status: 'failed', reason: 'server' };
    return { status: 'signed-in' };
  } catch (error) {
    return describeGoogleError(error);
  }
}
