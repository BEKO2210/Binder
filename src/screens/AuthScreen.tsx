import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (!email.trim() || password.length < 8) {
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
        if (!data.session) setMessage('Account created. Confirm the email, then sign in.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>BINDER</Text>
      <Text style={styles.title}>{mode === 'signin' ? 'Welcome back.' : 'Start with the real you.'}</Text>
      <Text style={styles.copy}>Dating for adults. Mutual interest before conversation.</Text>

      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor="#72727D"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        autoCapitalize="none"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#72727D"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable disabled={busy} onPress={submit} style={styles.primary}>
        {busy ? <ActivityIndicator color="#101115" /> : <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>}
      </Pressable>

      <Pressable disabled={busy} onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        <Text style={styles.switchText}>
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </Text>
      </Pressable>

      <Text style={styles.footnote}>You must be at least 18 years old to use Binder.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F', justifyContent: 'center', padding: 24 },
  brand: { color: '#C7FF4A', fontSize: 16, fontWeight: '900', letterSpacing: 4, marginBottom: 24 },
  title: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  copy: { color: '#A0A0AA', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 28 },
  input: { backgroundColor: '#17171D', borderColor: '#2A2A33', borderWidth: 1, borderRadius: 16, color: '#FFFFFF', fontSize: 16, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 12 },
  message: { color: '#F4B6C2', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  primary: { minHeight: 54, borderRadius: 17, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: '#101115', fontSize: 15, fontWeight: '900' },
  switchText: { color: '#D7D7DD', textAlign: 'center', fontWeight: '700', paddingVertical: 20 },
  footnote: { color: '#666670', textAlign: 'center', fontSize: 12, marginTop: 8 },
});
