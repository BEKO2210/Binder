import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import { BinderButton, BinderCard, BinderChip, BinderIconButton, BinderInput, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { getBetaSettings, setBetaDiagnostics, submitBetaFeedback, type BetaFeedbackCategory, type BetaSettings } from '../lib/beta';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

const CATEGORIES: { value: BetaFeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' }, { value: 'ux', label: 'UX' }, { value: 'safety', label: 'Safety' }, { value: 'performance', label: 'Performance' }, { value: 'other', label: 'Other' },
];

export default function BetaScreen({ onClose }: { onClose: () => void }) {
  const { theme } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [settings, setSettings] = useState<BetaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<BetaFeedbackCategory>('ux');
  const [rating, setRating] = useState(4);
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getBetaSettings().then((value) => { if (active) setSettings(value); }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Could not load beta settings.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggleDiagnostics(enabled: boolean) {
    if (!settings || busy) return;
    setBusy(true); setMessage('');
    try {
      const saved = await setBetaDiagnostics(enabled);
      setSettings((current) => current ? { ...current, diagnostics_enabled: saved } : current);
      await haptic('selection');
      setMessage(saved ? 'Optional diagnostics enabled. Binder records only fixed technical event fields.' : 'Optional diagnostics disabled. Existing optional client diagnostics were deleted.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update beta diagnostics.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await submitBetaFeedback(category, rating, details); setDetails(''); await haptic('selection'); setMessage('Feedback received. Thank you for testing Binder.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not submit beta feedback.'); }
    finally { setBusy(false); }
  }

  if (loading) return <ScreenState kind="loading" message="Loading beta program…" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <BinderIconButton name="back" accessibilityLabel="Back to profile" onPress={onClose} />
      <SectionHeader eyebrow="BETA PROGRAM" title="Make Binder measurable, not invasive." copy="Ranking quality comes from Binder's own server events. Optional client diagnostics are a separate choice and stay off by default." />

      <BinderCard style={{ marginTop: theme.spacing.x6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
          <View style={{ flex: 1 }}><BinderText variant="title">Optional diagnostics</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>Useful for load-time and render-failure debugging during beta.</BinderText></View>
          <Switch accessibilityLabel="Optional Binder beta diagnostics" disabled={!settings || busy} value={settings?.diagnostics_enabled ?? false} onValueChange={(value) => void toggleDiagnostics(value)} trackColor={{ false: theme.colors.borderStrong, true: theme.accent.accent }} thumbColor={theme.colors.textPrimary} />
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.borderSubtle, marginVertical: theme.spacing.x5 }} />
        <BinderText variant="micro" tone="muted">CAN RECORD</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Fixed screen/event name, duration, small count, success/error outcome, platform and app version.</BinderText>
        <BinderText variant="micro" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>NEVER IN OPTIONAL DIAGNOSTICS</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Message text, bio/profile text, photos, exact location, contacts, free-form metadata, raw exception messages or stack traces.</BinderText>
        {settings ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x4 }}>Client diagnostics: {settings.client_retention_days} days · ranking observations: {settings.ranking_retention_days} days</BinderText> : null}
      </BinderCard>

      <BinderCard style={{ marginTop: theme.spacing.x3, borderColor: theme.accent.accent }}>
        <BinderText variant="micro" tone="accent">RANKING OBSERVABILITY</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x3 }}>What Binder learns from the deck.</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>The server records rank position, shared-interest count, a 10-km distance bucket and later Bind/Pass outcome. Exact coordinates and profile content are not copied into ranking telemetry.</BinderText>
      </BinderCard>

      <View style={{ marginTop: theme.spacing.x8 }}>
        <SectionHeader eyebrow="PRIVATE BETA FEEDBACK" title="Tell us what failed or felt wrong." copy="For an abusive or unsafe person, use Report & Block on their profile or chat. This form is product feedback, not the moderation queue." />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x5 }}>{CATEGORIES.map((item) => <BinderChip key={item.value} label={item.label} selected={category === item.value} onPress={() => setCategory(item.value)} />)}</View>
      <BinderText variant="label" tone="secondary" style={{ marginTop: theme.spacing.x5, marginBottom: theme.spacing.x2 }}>Overall experience</BinderText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.x2 }}>{[1,2,3,4,5].map((value) => <View key={value} style={{ flex: 1 }}><BinderChip label={String(value)} selected={rating === value} onPress={() => setRating(value)} /></View>)}</View>
      <View style={{ marginTop: theme.spacing.x5 }}><BinderInput label="Details" helper={`${details.length}/1500`} value={details} onChangeText={setDetails} maxLength={1500} multiline textAlignVertical="top" placeholder="What happened? What did you expect instead?" style={{ minHeight: 150 }} /></View>
      {message ? <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <BinderButton label="Send beta feedback" loading={busy} onPress={() => void submit()} style={{ marginTop: theme.spacing.x5 }} />
    </ScrollView>
  );
}
