import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderBrand, BinderButton, BinderInput, BinderText, SectionHeader } from '../components/ui';
import { hasAuthErrors, MIN_PASSWORD_LENGTH, validateAuthForm, type AuthFieldErrors, type AuthMode } from '../lib/authForm';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';

// The reset link has to come back to this app, not to a web page that cannot
// finish the job. The scheme is declared in app.json.
const PASSWORD_RESET_REDIRECT = 'binder://reset-password';

function mapAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (/network|failed to fetch|fetch failed|timeout/i.test(raw) || error instanceof TypeError) {
    return 'No connection. Check your internet and try again.';
  }
  if (/invalid login credentials/i.test(raw)) return 'Email or password is incorrect.';
  if (/already registered|already exists/i.test(raw)) return 'This email is already registered. Sign in instead.';
  if (/at least 6|password should be|at least 8/i.test(raw)) return 'The password must be at least 8 characters.';
  if (/invalid email|valid email/i.test(raw)) return 'Enter a valid email address.';
  return raw || 'Something went wrong. Try again.';
}

// `recovery` is set when the app was opened through a password-reset link and
// Supabase has handed us a recovery session: the only thing that screen may do
// is set a new password.
export default function AuthScreen({ recovery = false, onRecoveryHandled }: { recovery?: boolean; onRecoveryHandled?: () => void } = {}) {
  const { theme } = useBinderTheme();
  const [mode, setMode] = useState<AuthMode>(recovery ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'secondary' | 'destructive'>('destructive');

  const errors: AuthFieldErrors = useMemo(
    () => validateAuthForm(mode, email, password, confirmPassword),
    [mode, email, password, confirmPassword],
  );
  // Errors appear once the user has tried to submit, not while they are still
  // typing their first character.
  const visibleErrors: AuthFieldErrors = submitted ? errors : {};

  function switchMode(next: AuthMode) {
    setMode(next);
    setMessage('');
    setSubmitted(false);
    setConfirmPassword('');
  }

  async function submit() {
    setSubmitted(true);
    if (hasAuthErrors(errors)) return;
    // `busy` only reaches the button after the next render; two fast taps beat
    // it and started two sign-ups. The ref is checked and set synchronously.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessageTone('secondary');
        setMessage('Password changed. You are signed in.');
        onRecoveryHandled?.();
      } else if (mode === 'reset') {
        // Supabase always answers the same way here, whether or not the address
        // exists — telling an anonymous caller which emails have accounts on a
        // dating app would be a privacy leak, not a convenience.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: PASSWORD_RESET_REDIRECT });
        if (error) throw error;
        setMessageTone('secondary');
        setMessage('If that address has an account, a reset link is on its way. Open it on this phone.');
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setMessageTone('secondary');
          setMessage('Account created. Confirm the email, then sign in.');
        }
      }
    } catch (error) {
      setMessageTone('destructive');
      setMessage(mapAuthError(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    // The keyboard used to sit on top of the password field. This lifts the form
    // instead, keeps the focused field and the submit button visible, and still
    // dismisses on a tap outside.
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.spacing.x6 }}
      bottomOffset={theme.spacing.x8}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <BinderBrand />
        <View style={{ marginTop: theme.spacing.x8 }}>
          <SectionHeader
            title={recovery ? 'Set a new password.' : mode === 'signin' ? 'Welcome back.' : mode === 'signup' ? 'Start with the real you.' : 'Locked out?'}
            copy={recovery ? 'Choose something you have not used here before. You stay signed in on this device.' : mode === 'reset' ? 'Enter the address you signed up with and we will send a link to set a new password.' : 'Dating for adults. Mutual interest before conversation.'}
          />
        </View>
        <View style={{ gap: theme.spacing.x4, marginTop: theme.spacing.x8 }}>
          {recovery ? null : <BinderInput
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            value={email}
            error={visibleErrors.email}
            onChangeText={setEmail}
          />}
          {mode === 'reset' ? null : <BinderInput
            label="Password"
            autoCapitalize="none"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            revealToggle
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            error={visibleErrors.password}
            onChangeText={setPassword}
          />}
          {mode === 'signup' ? (
            <BinderInput
              label="Repeat password"
              autoCapitalize="none"
              autoComplete="new-password"
              revealToggle
              placeholder="Type it once more"
              value={confirmPassword}
              error={visibleErrors.confirmPassword}
              helper="Both entries have to match before the account is created."
              onChangeText={setConfirmPassword}
            />
          ) : null}
        </View>
        {message ? <BinderText variant="caption" tone={messageTone} style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
        <BinderButton label={recovery ? 'Save new password' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'} loading={busy} onPress={() => void submit()} style={{ marginTop: theme.spacing.x5 }} />
        {mode === 'signin' && !recovery ? <BinderButton label="Forgot your password?" variant="ghost" disabled={busy} onPress={() => switchMode('reset')} style={{ marginTop: theme.spacing.x2 }} /> : null}
        {recovery ? null : <BinderButton
          label={mode === 'signin' ? 'New here? Create an account' : mode === 'signup' ? 'Already have an account? Sign in' : 'Back to sign in'}
          variant="ghost"
          disabled={busy}
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          style={{ marginTop: theme.spacing.x3 }}
        />}
        <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x3 }}>You must be at least 18 years old to use Binder.</BinderText>
      </View>
    </KeyboardAwareScrollView>
  );
}
