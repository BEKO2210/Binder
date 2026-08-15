import { useState } from 'react';
import { View } from 'react-native';

import { BinderBrand, BinderButton, BinderInput, BinderText, SectionHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';

export default function AuthScreen() {
  const { theme } = useBinderTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'secondary' | 'destructive'>('destructive');

  async function submit() {
    if (!email.trim() || password.length < 8) {
      setMessageTone('destructive');
      setMessage('Enter an email and a password with at least 8 characters.');
      return;
    }
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
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, justifyContent: 'center', padding: theme.spacing.x6 }}>
      <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <BinderBrand />
        <View style={{ marginTop: theme.spacing.x8 }}>
          <SectionHeader title={mode === 'signin' ? 'Welcome back.' : 'Start with the real you.'} copy="Dating for adults. Mutual interest before conversation." />
        </View>
        <View style={{ gap: theme.spacing.x4, marginTop: theme.spacing.x8 }}>
          <BinderInput label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" value={email} onChangeText={setEmail} />
          <BinderInput label="Password" autoCapitalize="none" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} secureTextEntry placeholder="At least 8 characters" value={password} onChangeText={setPassword} />
        </View>
        {message ? <BinderText variant="caption" tone={messageTone} style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
        <BinderButton label={mode === 'signin' ? 'Sign in' : 'Create account'} loading={busy} onPress={() => void submit()} style={{ marginTop: theme.spacing.x5 }} />
        <BinderButton label={mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'} variant="ghost" disabled={busy} onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }} style={{ marginTop: theme.spacing.x3 }} />
        <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x3 }}>You must be at least 18 years old to use Binder.</BinderText>
      </View>
    </View>
  );
}
