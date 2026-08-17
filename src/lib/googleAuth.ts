import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';

import { supabase } from './supabase';

// Signing in with Google skips the confirmation mail entirely: Google has
// already proven the address belongs to the person, so Supabase creates a
// confirmed account on the spot. It is also the only sign-in path that keeps
// working when the project's mail budget is spent.
//
// The button only exists once a web client id is configured. Shipping a button
// that opens a Google sheet and then fails is worse than not showing it.
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export type GoogleSignInOutcome =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: 'play-services' | 'no-id-token' | 'server' };

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
