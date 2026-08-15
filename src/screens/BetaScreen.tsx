import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  getBetaSettings,
  setBetaDiagnostics,
  submitBetaFeedback,
  type BetaFeedbackCategory,
  type BetaSettings,
} from '../lib/beta';

const CATEGORIES: { value: BetaFeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'ux', label: 'UX' },
  { value: 'safety', label: 'Safety' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

export default function BetaScreen({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<BetaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<BetaFeedbackCategory>('ux');
  const [rating, setRating] = useState(4);
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getBetaSettings()
      .then((value) => { if (active) setSettings(value); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Could not load beta settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggleDiagnostics(enabled: boolean) {
    if (!settings || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const saved = await setBetaDiagnostics(enabled);
      setSettings((current) => current ? { ...current, diagnostics_enabled: saved } : current);
      setMessage(saved
        ? 'Optional diagnostics enabled. Binder records only fixed technical event fields.'
        : 'Optional diagnostics disabled. Existing optional client diagnostics were deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update beta diagnostics.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await submitBetaFeedback(category, rating, details);
      setDetails('');
      setMessage('Feedback received. Thank you for testing Binder.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit beta feedback.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.back}><Text style={styles.backText}>← Back</Text></Pressable>
        <View style={styles.betaPill}><Text style={styles.betaPillText}>PHASE 5</Text></View>
      </View>

      <Text style={styles.eyebrow}>BETA PROGRAM</Text>
      <Text style={styles.title}>Help make Binder measurable, not invasive.</Text>
      <Text style={styles.lead}>Ranking quality is measured from Binder’s own server events. Optional client diagnostics are a separate choice and are off by default.</Text>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardCopyWrap}>
            <Text style={styles.cardTitle}>Optional diagnostics</Text>
            <Text style={styles.cardCopy}>Useful for load-time and render-failure debugging during beta.</Text>
          </View>
          {loading ? <ActivityIndicator color="#C7FF4A" /> : (
            <Switch
              accessibilityLabel="Optional Binder beta diagnostics"
              disabled={!settings || busy}
              value={settings?.diagnostics_enabled ?? false}
              onValueChange={(value) => void toggleDiagnostics(value)}
              trackColor={{ false: '#353A43', true: '#6D8734' }}
              thumbColor={settings?.diagnostics_enabled ? '#C7FF4A' : '#B3B8C1'}
            />
          )}
        </View>
        <View style={styles.rule} />
        <Text style={styles.dataLabel}>CAN RECORD</Text>
        <Text style={styles.dataCopy}>Fixed screen/event name, duration, small count, success/error outcome, Android/iOS and app version.</Text>
        <Text style={[styles.dataLabel, styles.dataGap]}>NEVER IN OPTIONAL DIAGNOSTICS</Text>
        <Text style={styles.dataCopy}>Message text, bio/profile text, photos, exact location, contact data, free-form metadata, raw exception message or stack trace.</Text>
        {settings ? <Text style={styles.retention}>Client diagnostics: {settings.client_retention_days} days · ranking observations: {settings.ranking_retention_days} days</Text> : null}
      </View>

      <View style={styles.rankingCard}>
        <Text style={styles.rankingIndex}>RANKING OBSERVABILITY</Text>
        <Text style={styles.rankingTitle}>What Binder learns from the deck.</Text>
        <Text style={styles.rankingCopy}>The server records rank position, shared-interest count, a 10-km distance bucket and the later Bind/Pass outcome. Exact coordinates and profile content are not copied into ranking telemetry.</Text>
      </View>

      <Text style={styles.sectionEyebrow}>PRIVATE BETA FEEDBACK</Text>
      <Text style={styles.sectionTitle}>Tell us what failed or felt wrong.</Text>
      <Text style={styles.sectionCopy}>For an abusive or unsafe person, use Report & Block on their profile/chat instead. This form is product feedback, not an emergency or moderation queue.</Text>

      <View style={styles.chips}>
        {CATEGORIES.map((item) => (
          <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.chip, category === item.value && styles.chipActive]}>
            <Text style={[styles.chipText, category === item.value && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Overall experience</Text>
      <View style={styles.ratingRow}>
        {[1,2,3,4,5].map((value) => (
          <Pressable key={value} accessibilityLabel={`${value} of 5`} onPress={() => setRating(value)} style={[styles.rating, rating === value && styles.ratingActive]}>
            <Text style={[styles.ratingText, rating === value && styles.ratingTextActive]}>{value}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Details</Text>
      <TextInput
        value={details}
        onChangeText={setDetails}
        maxLength={1500}
        multiline
        textAlignVertical="top"
        placeholder="What happened? What did you expect instead?"
        placeholderTextColor="#656B76"
        style={styles.input}
      />
      <Text style={styles.counter}>{details.length}/1500</Text>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable disabled={busy} accessibilityRole="button" onPress={() => void submit()} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.primaryPressed]}>
        {busy ? <ActivityIndicator color="#10120D" /> : <Text style={styles.primaryText}>Send beta feedback</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090A0F' },
  content: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 70 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  back: { minHeight: 42, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: '#30343E', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#D9DCE1', fontSize: 12, fontWeight: '800' },
  betaPill: { borderRadius: 999, backgroundColor: '#171B13', borderWidth: 1, borderColor: '#566B2E', paddingHorizontal: 11, paddingVertical: 7 },
  betaPillText: { color: '#C7FF4A', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  eyebrow: { color: '#C7FF4A', fontSize: 10, fontWeight: '900', letterSpacing: 1.9 },
  title: { color: '#F7F8F3', fontSize: 36, lineHeight: 39, fontWeight: '900', letterSpacing: -1.3, marginTop: 9 },
  lead: { color: '#989FAA', fontSize: 14, lineHeight: 21, marginTop: 13, marginBottom: 22 },
  card: { backgroundColor: '#12141B', borderWidth: 1, borderColor: '#2B303A', borderRadius: 24, padding: 20 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardCopyWrap: { flex: 1 }, cardTitle: { color: '#F0F2ED', fontSize: 18, fontWeight: '900' }, cardCopy: { color: '#8E949F', fontSize: 12, lineHeight: 17, marginTop: 4 },
  rule: { height: 1, backgroundColor: '#282D36', marginVertical: 18 },
  dataLabel: { color: '#717883', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, dataGap: { marginTop: 14 }, dataCopy: { color: '#C4C8CE', fontSize: 12, lineHeight: 18, marginTop: 5 }, retention: { color: '#737A85', fontSize: 10, lineHeight: 15, marginTop: 16 },
  rankingCard: { marginTop: 12, backgroundColor: '#151A13', borderWidth: 1, borderColor: '#405125', borderRadius: 24, padding: 20 }, rankingIndex: { color: '#8FAE4D', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, rankingTitle: { color: '#F1F5E8', fontSize: 19, fontWeight: '900', marginTop: 12 }, rankingCopy: { color: '#AAB39A', fontSize: 12, lineHeight: 18, marginTop: 7 },
  sectionEyebrow: { color: '#777E89', fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginTop: 34 }, sectionTitle: { color: '#F7F8F3', fontSize: 25, lineHeight: 29, fontWeight: '900', marginTop: 8 }, sectionCopy: { color: '#8F959F', fontSize: 12, lineHeight: 18, marginTop: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }, chip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#30343E', backgroundColor: '#15171D', alignItems: 'center', justifyContent: 'center' }, chipActive: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' }, chipText: { color: '#A9AFB8', fontWeight: '800', fontSize: 11 }, chipTextActive: { color: '#10120D' },
  label: { color: '#D8DBDF', fontSize: 11, fontWeight: '800', marginTop: 22, marginBottom: 8 }, ratingRow: { flexDirection: 'row', gap: 8 }, rating: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#30343E', backgroundColor: '#15171D', alignItems: 'center', justifyContent: 'center' }, ratingActive: { borderColor: '#748E3B', backgroundColor: '#1B2115' }, ratingText: { color: '#8B929C', fontWeight: '900' }, ratingTextActive: { color: '#C7FF4A' },
  input: { minHeight: 150, color: '#F4F5F0', backgroundColor: '#13151B', borderWidth: 1, borderColor: '#30343E', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, lineHeight: 20 }, counter: { color: '#666D78', textAlign: 'right', fontSize: 10, marginTop: 5 }, message: { color: '#D7DADE', fontSize: 12, lineHeight: 18, marginTop: 14 },
  primary: { height: 54, borderRadius: 17, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginTop: 20 }, primaryPressed: { backgroundColor: '#A8DE31', transform: [{ scale: 0.988 }] }, primaryText: { color: '#10120D', fontWeight: '900', fontSize: 13 }, disabled: { opacity: 0.45 },
});
