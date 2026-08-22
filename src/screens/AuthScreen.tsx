import { useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderBrand, BinderButton, BinderInput, BinderText, SectionHeader } from '../components/ui';
import { hasAuthErrors, MIN_PASSWORD_LENGTH, validateAuthForm, type AuthFieldErrors, type AuthMode } from '../lib/authForm';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';

import { isGoogleSignInConfigured, signInWithGoogle } from '../lib/googleAuth';
import { supabase } from '../lib/supabase';
import { withDeadline } from '../lib/reliability';
import { useBinderTheme } from '../theme/ThemeProvider';

// The reset link has to come back to this app, not to a web page that cannot
// finish the job. The scheme is declared in app.json.
const PASSWORD_RESET_REDIRECT = 'binder://reset-password';
const EMAIL_CONFIRM_REDIRECT = 'binder://confirm-email';

function mapAuthError(error: unknown, t: (key: string, values?: Record<string, string | number>) => string): string {
  const raw = error instanceof Error ? error.message : '';
  if (/network|failed to fetch|fetch failed|timeout/i.test(raw) || error instanceof TypeError) {
    return t('auth.errors.connection');
  }
  if (/invalid login credentials/i.test(raw)) return t('auth.errors.credentials');
  if (/already registered|already exists/i.test(raw)) return t('auth.errors.registered');
  if (/at least 6|password should be|at least 8/i.test(raw)) return t('auth.errors.passwordLength');
  if (/invalid email|valid email/i.test(raw)) return t('auth.errors.email');
  // Supabase answers `over_email_send_rate_limit` when the mail budget for the
  // hour is spent. Without this the person reads "email rate limit exceeded" in
  // English, whatever language the rest of the screen is in.
  if (/rate limit|too many requests/i.test(raw)) return t('auth.errors.rateLimit');
  return raw || t('auth.errors.generic');
}

// `recovery` is set when the app was opened through a password-reset link and
// Supabase has handed us a recovery session: the only thing that screen may do
// is set a new password.
// Sign-in is the whole app for somebody who is not in yet: a silent socket
// used to leave every button on this screen disabled with no message.
const AUTH_DEADLINE_MS = 15_000;

export default function AuthScreen({ recovery = false, onRecoveryHandled }: { recovery?: boolean; onRecoveryHandled?: () => void } = {}) {
  const { theme, t } = useBinderTheme();
  const [mode, setMode] = useState<AuthMode>(recovery ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'secondary' | 'destructive'>('destructive');
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleAvailable = isGoogleSignInConfigured();

  async function continueWithGoogle() {
    if (googleBusy || busy) return;
    setGoogleBusy(true);
    setMessage('');
    // The Google sheet can be dismissed in ways that never come back to us;
    // without a ceiling the button stays busy for the rest of the session.
    //
    // The ceiling itself used to do that: a deadline that runs out rejects, and
    // the rejection walked past the line that gives the button back. It stayed
    // disabled for the whole session, nothing said why, and the rejection went
    // unhandled — at the very first screen of the app. The way out of a state
    // may never be the control that is waiting, so the reset belongs in
    // `finally` and the failure has to reach the screen.
    try {
      const outcome = await withDeadline(signInWithGoogle(), AUTH_DEADLINE_MS);
      // A cancel is a decision, not an error: saying nothing is the right answer.
      if (outcome.status === 'signed-in' || outcome.status === 'cancelled') return;
      setMessageTone('destructive');
      setMessage(t(outcome.status === 'unavailable'
        ? 'auth.google.unavailable'
        : outcome.reason === 'play-services'
          ? 'auth.google.playServices'
          : outcome.reason === 'signature'
            ? 'auth.google.signature'
            : 'auth.google.failed'));
    } catch {
      // The sheet never answered. Nothing is known about the account, so the
      // only true thing to say is that it did not work and email still does.
      setMessageTone('destructive');
      setMessage(t('auth.google.failed'));
    } finally {
      setGoogleBusy(false);
    }
  }

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
        const { error } = await withDeadline(supabase.auth.updateUser({ password }), AUTH_DEADLINE_MS);
        if (error) throw error;
        setMessageTone('secondary');
        setMessage(t('auth.messages.passwordChanged'));
        onRecoveryHandled?.();
      } else if (mode === 'reset') {
        // Supabase always answers the same way here, whether or not the address
        // exists — telling an anonymous caller which emails have accounts on a
        // dating app would be a privacy leak, not a convenience.
        const { error } = await withDeadline(supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: PASSWORD_RESET_REDIRECT }), AUTH_DEADLINE_MS);
        if (error) throw error;
        setMessageTone('secondary');
        setMessage(t('auth.messages.resetSent'));
      } else if (mode === 'signin') {
        const { error } = await withDeadline(supabase.auth.signInWithPassword({ email: email.trim(), password }), AUTH_DEADLINE_MS);
        if (error) throw error;
      } else {
        // Back into Binder, not onto the website: the confirmation link carries
        // a PKCE code that only this device can exchange, so the person lands
        // signed in instead of reading "email confirmed" in a browser.
        const { data, error } = await withDeadline(supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
        }), AUTH_DEADLINE_MS);
        if (error) throw error;
        if (!data.session) {
          setMessageTone('secondary');
          setMessage(t('auth.messages.accountCreated'));
        }
      }
    } catch (error) {
      setMessageTone('destructive');
      setMessage(mapAuthError(error, t));
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
            title={recovery ? t('auth.headers.recoveryTitle') : mode === 'signin' ? t('auth.headers.signInTitle') : mode === 'signup' ? t('auth.headers.signUpTitle') : t('auth.headers.resetTitle')}
            copy={recovery ? t('auth.headers.recoveryCopy') : mode === 'reset' ? t('auth.headers.resetCopy') : t('auth.headers.defaultCopy')}
          />
        </View>
        <View style={{ gap: theme.spacing.x4, marginTop: theme.spacing.x8 }}>
          {recovery ? null : <BinderInput
            inputRef={emailRef}
            label={t('auth.fields.emailLabel')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder={t('auth.fields.emailPlaceholder')}
            value={email}
            error={visibleErrors.email}
            onChangeText={setEmail}
            returnKeyType={mode === 'reset' ? 'go' : 'next'}
            blurOnSubmit={mode === 'reset'}
            onSubmitEditing={() => { if (mode === 'reset') void submit(); else passwordRef.current?.focus(); }}
          />}
          {mode === 'reset' ? null : <BinderInput
            inputRef={passwordRef}
            label={t('auth.fields.passwordLabel')}
            autoCapitalize="none"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            revealToggle
            placeholder={t('auth.fields.passwordPlaceholder', { length: MIN_PASSWORD_LENGTH })}
            value={password}
            error={visibleErrors.password}
            onChangeText={setPassword}
            returnKeyType={mode === 'signup' ? 'next' : 'go'}
            blurOnSubmit={mode !== 'signup'}
            onSubmitEditing={() => { if (mode === 'signup') confirmPasswordRef.current?.focus(); else void submit(); }}
          />}
          {mode === 'signup' ? (
            <BinderInput
              inputRef={confirmPasswordRef}
              label={t('auth.fields.repeatPasswordLabel')}
              autoCapitalize="none"
              autoComplete="new-password"
              revealToggle
              placeholder={t('auth.fields.repeatPasswordPlaceholder')}
              value={confirmPassword}
              error={visibleErrors.confirmPassword}
              helper={t('auth.fields.repeatPasswordHelper')}
              onChangeText={setConfirmPassword}
              returnKeyType="go"
              blurOnSubmit
              onSubmitEditing={() => void submit()}
            />
          ) : null}
        </View>
        {message ? <BinderText accessibilityLiveRegion={messageTone === 'destructive' ? 'assertive' : 'polite'} variant="caption" tone={messageTone} style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
        <BinderButton label={recovery ? t('auth.actions.savePassword') : mode === 'signin' ? t('auth.actions.signIn') : mode === 'signup' ? t('auth.actions.createAccount') : t('auth.actions.sendResetLink')} loading={busy} onPress={() => void submit()} style={{ marginTop: theme.spacing.x5 }} />
        {mode === 'signin' && !recovery ? <BinderButton label={t('auth.actions.forgotPassword')} variant="ghost" disabled={busy} onPress={() => switchMode('reset')} style={{ marginTop: theme.spacing.x2 }} /> : null}
        {recovery ? null : <BinderButton
          label={mode === 'signin' ? t('auth.actions.createAccountPrompt') : mode === 'signup' ? t('auth.actions.signInPrompt') : t('auth.actions.backToSignIn')}
          variant="ghost"
          disabled={busy}
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          style={{ marginTop: theme.spacing.x3 }}
        />}
        {googleAvailable && !recovery && mode !== 'reset' ? (
          <View style={{ marginTop: theme.spacing.x5 }}>
            <BinderText variant="caption" tone="muted" align="center">{t('auth.google.divider')}</BinderText>
            {/* Google's own button, drawn by Google's own library: the mark
                belongs to them, and a hand-drawn imitation of it is a
                trademark problem, not a design decision. It is the one control
                in Binder that does not take its colours from the theme — the
                same exemption the warning and destructive colours have. */}
            <GoogleSigninButton
              size={GoogleSigninButton.Size.Wide}
              color={theme.mode === 'dark' ? GoogleSigninButton.Color.Dark : GoogleSigninButton.Color.Light}
              disabled={busy || googleBusy}
              onPress={() => void continueWithGoogle()}
              accessibilityRole="button"
              accessibilityLabel={t('auth.google.action')}
              accessibilityState={{ disabled: busy || googleBusy }}
              style={{ width: '100%', height: theme.spacing.x12 + theme.spacing.x2, marginTop: theme.spacing.x3 }}
            />
            <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x2 }}>{t('auth.google.note')}</BinderText>
          </View>
        ) : null}
        <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x3 }}>{t('auth.ageRequirement')}</BinderText>
      </View>
    </KeyboardAwareScrollView>
  );
}
