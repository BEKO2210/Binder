import { memo, useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderButton, BinderCard, BinderChip, BinderInput, BinderScreenHeader, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { availableLocales } from '../i18n';
import { getBetaSettings, setBetaDiagnostics } from '../lib/beta';
import { confirmDestructive } from '../lib/confirmDestructive';
import { disablePushNotifications, enablePushNotifications } from '../lib/notifications';
import { useBinderHaptics } from '../theme/haptics';
import type { AccentThemeId, MotionPreference } from '../theme/tokens';
import { useBinderTheme } from '../theme/ThemeProvider';

const ACCENT_OPTIONS: { id: AccentThemeId; labelKey: string }[] = [
  { id: 'lime', labelKey: 'appSettings.accent.options.lime' },
  { id: 'blue', labelKey: 'appSettings.accent.options.blue' },
  { id: 'violet', labelKey: 'appSettings.accent.options.violet' },
  { id: 'coral', labelKey: 'appSettings.accent.options.coral' },
  { id: 'ice', labelKey: 'appSettings.accent.options.ice' },
];

// A quiet hour is a complete 24-hour time. Anything else is a keystroke on the
// way to one, not a value worth persisting.
function isQuietTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export default function AppSettingsScreen({ onClose }: { onClose: () => void }) {
  const { theme, settings, hydrated, t, updateSettings, updateNotifications, updateQuietHours, resetSettings } = useBinderTheme();
  const languages = availableLocales();
  const haptic = useBinderHaptics();
  const [diagnostics, setDiagnostics] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getBetaSettings().then((value) => { if (active) setDiagnostics(value.diagnostics_enabled); }).catch(() => { if (active) setMessage(t('appSettings.errors.loadDiagnostics')); }).finally(() => { if (active) setDiagnosticsLoading(false); });
    return () => { active = false; };
  }, [t]);

  const toggleDiagnostics = useCallback(async (next: boolean) => {
    setDiagnosticsLoading(true); setMessage('');
    try { setDiagnostics(await setBetaDiagnostics(next)); await haptic('selection'); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('appSettings.errors.updateDiagnostics')); }
    finally { setDiagnosticsLoading(false); }
  }, [haptic, t]);

  const [pushBusy, setPushBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [quietDraft, setQuietDraft] = useState<{ start: string; end: string } | null>(null);

  const togglePush = useCallback(async (next: boolean) => {
    if (pushBusy) return;
    setMessage('');
    setPushBusy(true);
    try {
      if (!next) {
        await disablePushNotifications();
        await updateNotifications({ enabled: false });
        setMessage(t('appSettings.messages.pushOff'));
        return;
      }
      const result = await enablePushNotifications();
      if (result.status === 'registered') {
        await updateNotifications({ enabled: true });
        setMessage(t('appSettings.messages.pushActive'));
      } else if (result.status === 'denied') {
        await updateNotifications({ enabled: false });
        setMessage(t('appSettings.messages.pushDenied'));
      } else if (result.status === 'missing-project-id') {
        await updateNotifications({ enabled: false });
        setMessage(t('appSettings.messages.missingProject'));
      } else if (result.status === 'offline') {
        setMessage(t('appSettings.messages.pushOffline'));
      } else {
        setMessage(t('appSettings.messages.pushUnavailable'));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('appSettings.errors.updatePush'));
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, t, updateNotifications]);

  // A half-typed time ("22:") is not a quiet hour. The draft lives here until
  // it is complete, so a keystroke never writes an unusable value.
  const commitQuietHours = useCallback(() => {
    if (!quietDraft) return;
    if (!isQuietTime(quietDraft.start) || !isQuietTime(quietDraft.end)) return;
    void updateQuietHours({ start: quietDraft.start, end: quietDraft.end });
    setQuietDraft(null);
  }, [quietDraft, updateQuietHours]);

  const confirmReset = useCallback(() => {
    if (resetBusy) return;
    confirmDestructive({ title: t('appSettings.reset.confirmTitle'), message: t('appSettings.reset.confirmCopy'), cancelText: t('appSettings.reset.cancel'), destructiveText: t('appSettings.reset.confirm'), onConfirm: () => {
        setResetBusy(true);
        setMessage('');
        void resetSettings()
          .then(() => setMessage(t('appSettings.reset.done')))
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('appSettings.reset.failed')))
          .finally(() => setResetBusy(false));
      } });
  }, [resetBusy, resetSettings, t]);

  const toggleHaptics = useCallback((value: boolean) => void updateSettings({ hapticsEnabled: value }), [updateSettings]);
  const toggleQuietHours = useCallback((value: boolean) => void updateQuietHours({ enabled: value }), [updateQuietHours]);

  if (!hydrated) return <ScreenState kind="loading" message={t('appSettings.states.loading')} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('appSettings.header.title')} leading={{ icon: 'back', accessibilityLabel: t('appSettings.accessibility.backToProfile'), onPress: onClose }} />
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={t('appSettings.header.sectionTitle')} copy={t('appSettings.header.sectionCopy')} />

      {/* The language section is not a placeholder: it appears the moment a
          second locale file is registered, and stays out of the way until then. */}
      {languages.length > 1 ? (
        <SettingsSection title={t('settings.language.title')} copy={t('settings.language.copy')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
            <BinderChip
              label={t('settings.language.systemLabel')}
              selected={settings.language === 'system'}
              accessibilityLabel={`${t('settings.language.systemLabel')} — ${t('settings.language.systemCopy')}`}
              onPress={() => void updateSettings({ language: 'system' })}
            />
            {languages.map((language) => (
              <BinderChip
                key={language.code}
                label={language.flag ? `${language.flag}  ${language.endonym}` : language.endonym}
                selected={settings.language === language.code}
                accessibilityLabel={language.name}
                onPress={() => void updateSettings({ language: language.code })}
              />
            ))}
          </View>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('appSettings.appearance.title')} copy={t('appSettings.appearance.copy')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          <BinderChip label={t('appSettings.common.system')} selected={settings.appearance === 'system'} onPress={() => void updateSettings({ appearance: 'system' })} />
          <BinderChip label={t('appSettings.appearance.dark')} selected={settings.appearance === 'dark'} onPress={() => void updateSettings({ appearance: 'dark' })} />
        </View>
      </SettingsSection>

      <SettingsSection title={t('appSettings.accent.title')} copy={t('appSettings.accent.copy')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          {ACCENT_OPTIONS.map((option) => <BinderChip key={option.id} label={t(option.labelKey)} selected={settings.accentTheme === option.id} onPress={() => { void updateSettings({ accentTheme: option.id }); void haptic('selection'); }} />)}
        </View>
      </SettingsSection>

      <SettingsSection title={t('appSettings.hapticsMotion.title')}>
        <SwitchRow label={t('appSettings.hapticsMotion.haptics')} copy={t('appSettings.hapticsMotion.copy')} value={settings.hapticsEnabled} onValueChange={toggleHaptics} />
        <BinderText variant="label" tone="secondary" style={{ marginTop: theme.spacing.x4, marginBottom: theme.spacing.x2 }}>{t('appSettings.hapticsMotion.motion')}</BinderText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          {(['system','reduce','full'] as MotionPreference[]).map((value) => <BinderChip key={value} label={value === 'system' ? t('appSettings.common.system') : value === 'reduce' ? t('appSettings.hapticsMotion.reduce') : t('appSettings.hapticsMotion.full')} selected={settings.motion === value} onPress={() => void updateSettings({ motion: value })} />)}
        </View>
      </SettingsSection>

      <SettingsSection title={t('appSettings.notifications.title')} copy={t('appSettings.notifications.copy')}>
        <SwitchRow disabled={pushBusy} label={t('appSettings.notifications.remotePush')} value={settings.notifications.enabled} onValueChange={togglePush} />
        <NotificationSwitchRow field="newMatches" label={t('appSettings.notifications.newMatches')} value={settings.notifications.newMatches} disabled={!settings.notifications.enabled} update={updateNotifications} />
        <NotificationSwitchRow field="messages" label={t('appSettings.notifications.messages')} value={settings.notifications.messages} disabled={!settings.notifications.enabled} update={updateNotifications} />
        <NotificationSwitchRow field="moderation" label={t('appSettings.notifications.moderation')} value={settings.notifications.moderation} disabled={!settings.notifications.enabled} update={updateNotifications} />
        <NotificationSwitchRow field="safety" label={t('appSettings.notifications.safety')} value={settings.notifications.safety} disabled={!settings.notifications.enabled} update={updateNotifications} />
        <NotificationSwitchRow field="product" label={t('appSettings.notifications.product')} copy={t('appSettings.notifications.productCopy')} value={settings.notifications.product} disabled={!settings.notifications.enabled} update={updateNotifications} />
        <NotificationSwitchRow field="sound" label={t('appSettings.notifications.sound')} value={settings.notifications.sound} disabled={!settings.notifications.enabled} update={updateNotifications} />
        <NotificationSwitchRow field="vibration" label={t('appSettings.notifications.vibration')} value={settings.notifications.vibration} disabled={!settings.notifications.enabled} update={updateNotifications} />
      </SettingsSection>

      <SettingsSection title={t('appSettings.quietHours.title')} copy={t('appSettings.quietHours.copy')}>
        <SwitchRow label={t('appSettings.quietHours.use')} value={settings.quietHours.enabled} onValueChange={toggleQuietHours} />
        <View style={{ flexDirection: 'row', gap: theme.spacing.x3, marginTop: theme.spacing.x3 }}>
          <View style={{ flex: 1 }}><BinderInput label={t('appSettings.quietHours.start')} keyboardType="numbers-and-punctuation" maxLength={5} value={quietDraft?.start ?? settings.quietHours.start} error={quietDraft && !isQuietTime(quietDraft.start) ? t('appSettings.quietHours.invalid') : undefined} onChangeText={(value) => setQuietDraft({ start: value, end: quietDraft?.end ?? settings.quietHours.end })} onBlur={commitQuietHours} placeholder={t('appSettings.quietHours.startPlaceholder')} /></View>
          <View style={{ flex: 1 }}><BinderInput label={t('appSettings.quietHours.end')} keyboardType="numbers-and-punctuation" maxLength={5} value={quietDraft?.end ?? settings.quietHours.end} error={quietDraft && !isQuietTime(quietDraft.end) ? t('appSettings.quietHours.invalid') : undefined} onChangeText={(value) => setQuietDraft({ start: quietDraft?.start ?? settings.quietHours.start, end: value })} onBlur={commitQuietHours} placeholder={t('appSettings.quietHours.endPlaceholder')} /></View>
        </View>
      </SettingsSection>

      <SettingsSection title={t('appSettings.diagnostics.title')} copy={t('appSettings.diagnostics.copy')}>
        {diagnosticsLoading ? <ScreenState kind="loading" message={t('appSettings.diagnostics.checking')} /> : <SwitchRow label={t('appSettings.diagnostics.share')} value={diagnostics} onValueChange={toggleDiagnostics} />}
      </SettingsSection>

      {message ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone={/are active|are off/.test(message) ? 'accent' : 'destructive'} style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <BinderButton label={t('appSettings.reset.action')} variant="secondary" loading={resetBusy} onPress={confirmReset} style={{ marginTop: theme.spacing.x6 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

function SettingsSection({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <BinderCard style={{ marginTop: theme.spacing.x5 }}><BinderText variant="title">{title}</BinderText>{copy ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1, marginBottom: theme.spacing.x4 }}>{copy}</BinderText> : <View style={{ height: theme.spacing.x4 }} />}{children}</BinderCard>;
}

const SwitchRow = memo(function SwitchRow({ label, copy, value, disabled, onValueChange }: { label: string; copy?: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  const { theme } = useBinderTheme();
  return <View style={{ minHeight: theme.layout.controlHeight + theme.spacing.x1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, opacity: disabled ? theme.feedback.disabledOpacity : 1 }}><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}><BinderText variant="label">{label}</BinderText>{copy ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText> : null}</View><Switch accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={copy} accessibilityState={{ checked: value, disabled }} disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: theme.colors.borderStrong, true: theme.accent.accent }} thumbColor={theme.colors.textPrimary} /></View>;
});

type NotificationField = 'newMatches' | 'messages' | 'moderation' | 'safety' | 'product' | 'sound' | 'vibration';

const NotificationSwitchRow = memo(function NotificationSwitchRow({ field, update, ...row }: { field: NotificationField; update: (patch: Partial<Record<NotificationField | 'enabled', boolean>>) => Promise<void>; label: string; copy?: string; value: boolean; disabled: boolean }) {
  const onValueChange = useCallback((value: boolean) => void update({ [field]: value }), [field, update]);
  return <SwitchRow {...row} onValueChange={onValueChange} />;
});
