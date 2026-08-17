import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderButton, BinderCard, BinderChip, BinderInput, BinderScreenHeader, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { getBetaSettings, setBetaDiagnostics, submitBetaFeedback, type BetaFeedbackCategory, type BetaSettings } from '../lib/beta';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

const CATEGORIES: { value: BetaFeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'beta.categories.bug' }, { value: 'ux', label: 'beta.categories.ux' }, { value: 'safety', label: 'beta.categories.safety' }, { value: 'performance', label: 'beta.categories.performance' }, { value: 'other', label: 'beta.categories.other' },
];

export default function BetaScreen({ onClose }: { onClose: () => void }) {
  const { theme, t } = useBinderTheme();
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
    getBetaSettings().then((value) => { if (active) setSettings(value); }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : t('beta.errors.load')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleDiagnostics = useCallback(async (enabled: boolean) => {
    if (!settings || busy) return;
    setBusy(true); setMessage('');
    try {
      const saved = await setBetaDiagnostics(enabled);
      setSettings((current) => current ? { ...current, diagnostics_enabled: saved } : current);
      await haptic('selection');
      setMessage(t(saved ? 'beta.messages.diagnosticsEnabled' : 'beta.messages.diagnosticsDisabled'));
    } catch (error) { setMessage(error instanceof Error ? error.message : t('beta.errors.updateDiagnostics')); }
    finally { setBusy(false); }
  }, [busy, haptic, settings]);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await submitBetaFeedback(category, rating, details); setDetails(''); await haptic('selection'); setMessage(t('beta.messages.feedbackReceived')); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('beta.errors.submitFeedback')); }
    finally { setBusy(false); }
  }, [busy, category, details, haptic, rating]);

  if (loading) return <ScreenState kind="loading" message={t('beta.loading')} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('beta.header.title')} leading={{ icon: 'back', accessibilityLabel: t('beta.header.backAccessibility'), onPress: onClose }} />
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={t('beta.intro.title')} copy={t('beta.intro.copy')} />

      <BinderCard style={{ marginTop: theme.spacing.x6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
          <View style={{ flex: 1 }}><BinderText variant="title">{t('beta.diagnostics.title')}</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{t('beta.diagnostics.copy')}</BinderText></View>
          <Switch accessibilityRole="switch" accessibilityLabel={t('beta.diagnostics.accessibilityLabel')} accessibilityState={{ checked: settings?.diagnostics_enabled ?? false, disabled: !settings || busy }} disabled={!settings || busy} value={settings?.diagnostics_enabled ?? false} onValueChange={toggleDiagnostics} trackColor={{ false: theme.colors.borderStrong, true: theme.accent.accent }} thumbColor={theme.colors.textPrimary} />
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.borderSubtle, marginVertical: theme.spacing.x5 }} />
        <BinderText variant="micro" tone="muted">{t('beta.diagnostics.canRecord')}</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('beta.diagnostics.recorded')}</BinderText>
        <BinderText variant="micro" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{t('beta.diagnostics.never')}</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('beta.diagnostics.excluded')}</BinderText>
        {settings ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x4 }}>{t('beta.diagnostics.retention', { clientDays: settings.client_retention_days, rankingDays: settings.ranking_retention_days })}</BinderText> : null}
      </BinderCard>

      <BinderCard style={{ marginTop: theme.spacing.x3, borderColor: theme.accent.accent }}>
        <BinderText variant="micro" tone="accent">{t('beta.ranking.eyebrow')}</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x3 }}>{t('beta.ranking.title')}</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('beta.ranking.copy')}</BinderText>
      </BinderCard>

      <View style={{ marginTop: theme.spacing.x8 }}>
        <SectionHeader eyebrow={t('beta.feedback.eyebrow')} title={t('beta.feedback.title')} copy={t('beta.feedback.copy')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x5 }}>{CATEGORIES.map((item) => <BinderChip key={item.value} label={t(item.label)} selected={category === item.value} onPress={() => setCategory(item.value)} />)}</View>
      <BinderText variant="label" tone="secondary" style={{ marginTop: theme.spacing.x5, marginBottom: theme.spacing.x2 }}>{t('beta.feedback.overallExperience')}</BinderText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.x2 }}>{[1,2,3,4,5].map((value) => <View key={value} style={{ flex: 1 }}><BinderChip label={String(value)} selected={rating === value} onPress={() => setRating(value)} /></View>)}</View>
      <View style={{ marginTop: theme.spacing.x5 }}><BinderInput label={t('beta.feedback.details')} helper={t('beta.feedback.characterCount', { count: details.length })} value={details} onChangeText={setDetails} maxLength={1500} multiline textAlignVertical="top" placeholder={t('beta.feedback.placeholder')} style={{ minHeight: theme.layout.feedbackInputHeight }} /></View>
      {message ? <BinderText accessibilityLiveRegion="polite" variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <BinderButton label={t('beta.feedback.send')} loading={busy} onPress={submit} style={{ marginTop: theme.spacing.x5 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}
