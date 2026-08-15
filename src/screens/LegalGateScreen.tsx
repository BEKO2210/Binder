import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PRIVACY_URL,
  TERMS_URL,
  acceptCurrentLegalGate,
  openBinderUrl,
  type LegalGate,
} from '../lib/safety';

type Props = {
  gate: LegalGate;
  onAccepted: () => void;
};

export default function LegalGateScreen({ gate, onAccepted }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open(url: string) {
    setError('');
    try {
      await openBinderUrl(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this page.');
    }
  }

  async function accept() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      await acceptCurrentLegalGate(gate);
      onAccepted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your acceptance.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.mark}><Text style={styles.markText}>B</Text></View>
      <Text style={styles.eyebrow}>BEFORE YOU CREATE OR SHARE</Text>
      <Text style={styles.title}>Clear rules before conversation.</Text>
      <Text style={styles.copy}>
        Binder is 18+ and built around mutual choice. Before you create a profile, upload a photo or send a message, accept the current Terms & Community Rules and Privacy Policy.
      </Text>

      <Pressable onPress={() => void open(TERMS_URL)} style={({ pressed }) => [styles.policyCard, pressed && styles.pressed]}>
        <View style={styles.policyTop}>
          <Text style={styles.policyIndex}>01</Text>
          <Text style={styles.openLabel}>OPEN ↗</Text>
        </View>
        <Text style={styles.policyTitle}>Terms & Community Rules</Text>
        <Text style={styles.policyCopy}>18+ only · consent · no harassment · no sexual exploitation · no impersonation, scams or block evasion.</Text>
        <Text style={styles.version}>Version {gate.terms_version}</Text>
      </Pressable>

      <Pressable onPress={() => void open(PRIVACY_URL)} style={({ pressed }) => [styles.policyCard, pressed && styles.pressed]}>
        <View style={styles.policyTop}>
          <Text style={styles.policyIndex}>02</Text>
          <Text style={styles.openLabel}>OPEN ↗</Text>
        </View>
        <Text style={styles.policyTitle}>Privacy Policy</Text>
        <Text style={styles.policyCopy}>What Binder stores, why location stays private, how safety records work and how to delete your account.</Text>
        <Text style={styles.version}>Version {gate.privacy_version}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={() => setConfirmed((value) => !value)}
        style={[styles.confirm, confirmed && styles.confirmActive]}
      >
        <View style={[styles.check, confirmed && styles.checkActive]}>
          <Text style={[styles.checkText, confirmed && styles.checkTextActive]}>{confirmed ? '✓' : ''}</Text>
        </View>
        <Text style={[styles.confirmText, confirmed && styles.confirmTextActive]}>
          I have read and agree to the current Terms & Community Rules and Privacy Policy.
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!confirmed || busy}
        onPress={() => void accept()}
        style={({ pressed }) => [styles.primary, (!confirmed || busy) && styles.primaryDisabled, pressed && confirmed && styles.primaryPressed]}
      >
        {busy ? <ActivityIndicator color="#10120D" /> : <Text style={styles.primaryText}>Agree & continue</Text>}
      </Pressable>

      <Text style={styles.footnote}>There is no skip. If these rules change materially, Binder can require acceptance of a new version before more UGC is created.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090A0F' },
  content: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 56 },
  mark: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  markText: { color: '#10120D', fontWeight: '900', fontSize: 20 },
  eyebrow: { color: '#C7FF4A', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: '#F7F8F3', fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.2, marginTop: 10 },
  copy: { color: '#9EA4B0', fontSize: 15, lineHeight: 22, marginTop: 14, marginBottom: 24 },
  policyCard: { backgroundColor: '#12141B', borderWidth: 1, borderColor: '#2A2F3A', borderRadius: 22, padding: 20, marginBottom: 12 },
  pressed: { backgroundColor: '#181B24' },
  policyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  policyIndex: { color: '#656B76', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  openLabel: { color: '#C7FF4A', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  policyTitle: { color: '#F7F8F3', fontSize: 19, fontWeight: '900', marginTop: 18 },
  policyCopy: { color: '#9EA4B0', fontSize: 13, lineHeight: 19, marginTop: 7 },
  version: { color: '#6F7580', fontSize: 10, marginTop: 14 },
  confirm: { marginTop: 10, flexDirection: 'row', gap: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#30343E', backgroundColor: '#101219' },
  confirmActive: { borderColor: '#7E9F35', backgroundColor: '#151B13' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: '#4A4F59', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkActive: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' },
  checkText: { color: 'transparent', fontWeight: '900' },
  checkTextActive: { color: '#10120D' },
  confirmText: { flex: 1, color: '#A6ABB4', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  confirmTextActive: { color: '#E5E8DD' },
  error: { color: '#FF8EA2', lineHeight: 19, marginTop: 14 },
  primary: { height: 56, backgroundColor: '#C7FF4A', borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryDisabled: { opacity: 0.32 },
  primaryPressed: { transform: [{ scale: 0.985 }], backgroundColor: '#A8DE31' },
  primaryText: { color: '#10120D', fontSize: 14, fontWeight: '900' },
  footnote: { color: '#666C77', fontSize: 11, lineHeight: 17, marginTop: 16, textAlign: 'center' },
});
