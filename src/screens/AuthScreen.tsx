import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderBrand, BinderButton, BinderInput, BinderText, SectionHeader } from '../components/ui';
import { hasAuthErrors, MIN_PASSWORD_LENGTH, validateAuthForm, type AuthFieldErrors } from '../lib/authForm';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';

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

export default function AuthScreen() {
  const { theme } = useBinderTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'secondary' | 'destructive'>('destructive');

  const errors: AuthFieldErrors = useMemo(
    () => validateAuthForm(mode, email, password, confirmPassword),
    [mode, email, password, confirmPassword],
  );
  // Errors appear once the user has tried to submit, not while they are still
  // typing their first character.
  const visibleErrors: AuthFieldErrors = submitted ? errors : {};

  function switchMode(next: 'signin' | 'signup') {
    setMode(next);
    setMessage('');
    setSubmitted(false);
    setConfirmPassword('');
  }

  async function submit() {
    setSubmitted(true);
    if (hasAuthErrors(errors)) return;
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signin') {
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
          <SectionHeader title={mode === 'signin' ? 'Welcome back.' : 'Start with the real you.'} copy="Dating for adults. Mutual interest before conversation." />
        </View>
        <View style={{ gap: theme.spacing.x4, marginTop: theme.spacing.x8 }}>
          <BinderInput
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            value={email}
            error={visibleErrors.email}
            onChangeText={setEmail}
          />
          <BinderInput
            label="Password"
            autoCapitalize="none"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            revealToggle
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            error={visibleErrors.password}
            onChangeText={setPassword}
          />
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
        <BinderButton label={mode === 'signin' ? 'Sign in' : 'Create account'} loading={busy} onPress={() => void submit()} style={{ marginTop: theme.spacing.x5 }} />
        <BinderButton label={mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'} variant="ghost" disabled={busy} onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} style={{ marginTop: theme.spacing.x3 }} />
        <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x3 }}>You must be at least 18 years old to use Binder.</BinderText>
      </View>
    </KeyboardAwareScrollView>
  );
}
