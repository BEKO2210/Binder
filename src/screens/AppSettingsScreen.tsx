import { memo, useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, Switch, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderInput, BinderScreenHeader, BinderText, MotionPressable as Pressable, ScreenState, SectionHeader } from '../components/ui';
import { availableLocales } from '../i18n';
import { getBetaSettings, setBetaDiagnostics } from '../lib/beta';
import { confirmDestructive } from '../lib/confirmDestructive';
import { disablePushNotifications, enablePushNotifications, getNotificationPermissionStatus, openSystemNotificationSettings, refreshPushRegistration } from '../lib/notifications';
import { pushBlockedOnThisDevice, pushSettingsWarning, type PushPermissionStatus, type PushRegistrationStatus } from '../lib/pushBanner';
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
  const { theme, settings, hydrated, locale, t, updateSettings, updateNotifications, updateQuietHours, resetSettings } = useBinderTheme();
  const languages = availableLocales();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  // The sub-screen owns the back gesture while it is open; without this the
  // hardware back closed the whole settings screen from inside the list.
  useEffect(() => {
    if (!languagePickerOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setLanguagePickerOpen(false); return true; });
    return () => subscription.remove();
  }, [languagePickerOpen]);
  const activeLocale = languages.find((entry) => entry.code === locale);
  const activeLanguage = settings.language === 'system'
    ? { label: t('settings.language.systemLabel'), detail: `${t('settings.language.systemCopy')} · ${activeLocale?.endonym ?? ''}`.trim(), flag: '🌐' }
    : { label: activeLocale?.endonym ?? '', detail: activeLocale?.name ?? '', flag: activeLocale?.flag ?? '🌐' };
  const haptic = useBinderHaptics();
  const [diagnostics, setDiagnostics] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [message, setMessage] = useState('');
  // The tone used to be guessed by matching the message against English words,
  // so on every other language a success read as a failure. What happened is
  // known where it happens; it does not need to be recovered from the text.
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('error');
  // One way in, so the tone can never be left behind on the previous outcome:
  // a failure after a success would otherwise still be painted as a success.
  const showMessage = useCallback((text: string, kind: 'success' | 'error' = 'error') => {
    setMessage(text); setMessageKind(kind);
  }, []);

  useEffect(() => {
    let active = true;
    getBetaSettings().then((value) => { if (active) setDiagnostics(value.diagnostics_enabled); }).catch(() => { if (active) showMessage(t('appSettings.errors.loadDiagnostics')); }).finally(() => { if (active) setDiagnosticsLoading(false); });
    return () => { active = false; };
  }, [t]);

  const toggleDiagnostics = useCallback(async (next: boolean) => {
    setDiagnosticsLoading(true); showMessage('');
    try { setDiagnostics(await setBetaDiagnostics(next)); await haptic('selection'); }
    catch (error) { showMessage(error instanceof Error ? error.message : t('appSettings.errors.updateDiagnostics')); }
    finally { setDiagnosticsLoading(false); }
  }, [haptic, t]);

  const [pushBusy, setPushBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermissionStatus | null>(null);
  const [pushHealth, setPushHealth] = useState<PushRegistrationStatus | null>(null);
  const [quietDraft, setQuietDraft] = useState<{ start: string; end: string } | null>(null);

  // Whether this phone allows a notification is decided outside Binder and can
  // change while the screen is open — the button below sends people to exactly
  // that switch, and Android does not re-mount the screen when they come back.
  //
  // The permission alone does not prove push works, though. A granted
  // permission with a registration that never reached the server looks
  // identical to a healthy one from the outside, and that is the state nobody
  // would ever notice. So this re-registers while it is here: the call is
  // idempotent, it repairs that case by itself, and what it returns is the
  // honest answer to put on the screen.
  useEffect(() => {
    let active = true;
    // Two reads can overlap when the screen is foregrounded twice in quick
    // succession, and the slower one may be the older one. Only the newest
    // read is allowed to land, or the row could settle on a stale answer.
    let newestRead = 0;
    const read = () => {
      const ticket = (newestRead += 1);
      void getNotificationPermissionStatus()
        .then((status) => { if (active && ticket === newestRead) setPushPermission(status); })
        .catch(() => undefined);
      if (!settings.notifications.enabled) { setPushHealth(null); return; }
      void refreshPushRegistration(t)
        .then((result) => { if (active && ticket === newestRead) setPushHealth(result.status); })
        .catch(() => { if (active && ticket === newestRead) setPushHealth('unsupported'); });
    };
    read();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') read(); });
    return () => { active = false; subscription.remove(); };
  }, [settings.notifications.enabled]);

  const togglePush = useCallback(async (next: boolean) => {
    if (pushBusy) return;
    showMessage('');
    setPushBusy(true);
    try {
      if (!next) {
        await disablePushNotifications();
        await updateNotifications({ enabled: false });
        showMessage(t('appSettings.messages.pushOff'), 'success');
        return;
      }
      const result = await enablePushNotifications(t);
      if (result.status === 'registered') {
        await updateNotifications({ enabled: true });
        showMessage(t('appSettings.messages.pushActive'), 'success');
      } else if (result.status === 'denied') {
        await updateNotifications({ enabled: false });
        showMessage(t('appSettings.messages.pushDenied'));
      } else if (result.status === 'missing-project-id') {
        await updateNotifications({ enabled: false });
        showMessage(t('appSettings.messages.missingProject'));
      } else if (result.status === 'offline') {
        showMessage(t('appSettings.messages.pushOffline'));
      } else {
        showMessage(t('appSettings.messages.pushUnavailable'));
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : t('appSettings.errors.updatePush'));
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
        showMessage('');
        void resetSettings()
          .then(() => showMessage(t('appSettings.reset.done'), 'success'))
          .catch((error: unknown) => showMessage(error instanceof Error ? error.message : t('appSettings.reset.failed')))
          .finally(() => setResetBusy(false));
      } });
  }, [resetBusy, resetSettings, t]);

  const toggleHaptics = useCallback((value: boolean) => void updateSettings({ hapticsEnabled: value }), [updateSettings]);
  const toggleQuietHours = useCallback((value: boolean) => void updateQuietHours({ enabled: value }), [updateQuietHours]);

  const pushWarningKey = pushSettingsWarning(settings.notifications.enabled, pushPermission, pushHealth);

  if (!hydrated) return <ScreenState kind="loading" message={t('appSettings.states.loading')} />;

  // The full list is a screen of its own: the settings screen keeps one row,
  // and languages can keep arriving without pushing everything else down.
  if (languagePickerOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <BinderScreenHeader
          title={t('settings.language.title')}
          leading={{ icon: 'back', accessibilityLabel: t('settings.language.back'), onPress: () => setLanguagePickerOpen(false) }}
        />
        <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.spacing.screen, paddingBottom: theme.spacing.x16 }}>
          <BinderText variant="body" tone="secondary" style={{ marginBottom: theme.spacing.x5 }}>{t('settings.language.copy')}</BinderText>
          <View style={{ borderRadius: theme.radii.card, borderWidth: 1, borderColor: theme.colors.borderSubtle, overflow: 'hidden' }}>
            <LanguageRow
              label={t('settings.language.systemLabel')}
              detail={`${t('settings.language.systemCopy')} · ${activeLocale?.endonym ?? ''}`.trim()}
              flag="🌐"
              selected={settings.language === 'system'}
              first
              onPress={() => { void updateSettings({ language: 'system' }); setLanguagePickerOpen(false); }}
            />
            {languages.map((language) => (
              <LanguageRow
                key={language.code}
                label={language.endonym}
                detail={language.name}
                flag={language.flag}
                selected={settings.language === language.code}
                onPress={() => { void updateSettings({ language: language.code }); setLanguagePickerOpen(false); }}
              />
            ))}
          </View>
        </KeyboardAwareScrollView>
      </View>
    );
  }


  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('appSettings.header.title')} leading={{ icon: 'back', accessibilityLabel: t('appSettings.accessibility.backToProfile'), onPress: onClose }} />
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={t('appSettings.header.sectionTitle')} copy={t('appSettings.header.sectionCopy')} />

      {/* The language section is not a placeholder: it appears the moment a
          second locale file is registered, and stays out of the way until then. */}
      {/* One row, not a list: languages keep arriving, and a settings screen
          that grows by one line per language stops being a settings screen.
          The full list lives one tap away. */}
      {languages.length > 1 ? (
        <SettingsSection title={t('settings.language.title')} copy={t('settings.language.copy')}>
          <View style={{ borderRadius: theme.radii.card, borderWidth: 1, borderColor: theme.colors.borderSubtle, overflow: 'hidden' }}>
            <LanguageRow
              label={activeLanguage.label}
              detail={activeLanguage.detail}
              flag={activeLanguage.flag}
              selected={false}
              first
              chevron
              onPress={() => setLanguagePickerOpen(true)}
            />
          </View>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('appSettings.appearance.title')} copy={t('appSettings.appearance.copy')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          <BinderChip label={t('appSettings.common.system')} selected={settings.appearance === 'system'} onPress={() => void updateSettings({ appearance: 'system' })} />
          <BinderChip label={t('appSettings.appearance.light')} selected={settings.appearance === 'light'} onPress={() => void updateSettings({ appearance: 'light' })} />
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
        {pushWarningKey ? (
          <View style={{ gap: theme.spacing.x2, marginBottom: theme.spacing.x3 }}>
            <BinderText variant="caption" tone="destructive">{t(pushWarningKey)}</BinderText>
            {pushPermission && pushBlockedOnThisDevice(settings.notifications.enabled, pushPermission) ? (
              <BinderButton label={t('matches.actions.openSettings')} icon="settings" variant="ghost" fullWidth={false} onPress={() => void openSystemNotificationSettings().catch(() => showMessage(t('appSettings.errors.updatePush')))} />
            ) : null}
          </View>
        ) : null}
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

      {message ? <BinderText accessibilityLiveRegion={messageKind === 'success' ? 'polite' : 'assertive'} variant="caption" tone={messageKind === 'success' ? 'accent' : 'destructive'} style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
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


const LanguageRow = memo(function LanguageRow({ label, detail, flag, selected, first = false, chevron = false, onPress }: {
  label: string;
  detail: string;
  flag: string;
  selected: boolean;
  first?: boolean;
  chevron?: boolean;
  onPress: () => void;
}) {
  const { theme } = useBinderTheme();
  return (
    <Pressable
      accessibilityRole={chevron ? 'button' : 'radio'}
      accessibilityState={chevron ? undefined : { selected }}
      accessibilityLabel={`${label} — ${detail}`}
      pressedSurface={false}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        minHeight: theme.layout.controlHeight + theme.spacing.x2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.x3,
        paddingHorizontal: theme.spacing.x4,
        paddingVertical: theme.spacing.x3,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.colors.borderSubtle,
        backgroundColor: pressed ? theme.colors.surfacePressed : selected ? theme.colors.surfaceElevated : theme.colors.transparent,
      })}
    >
      <BinderText variant="title" maxFontSizeMultiplier={theme.layout.chromeFontScaleCap}>{flag}</BinderText>
      <View style={{ flex: 1 }}>
        <BinderText variant="label" tone={selected ? 'accent' : 'primary'} numberOfLines={1}>{label}</BinderText>
        <BinderText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: theme.spacing.x1 }}>{detail}</BinderText>
      </View>
      {chevron ? <BinderIcon name="chevronRight" size={20} color={theme.colors.textMuted} />
        : selected ? <BinderIcon name="check" size={20} color={theme.accent.onSurface} /> : null}
    </Pressable>
  );
});
