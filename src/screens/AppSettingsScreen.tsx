import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderButton, BinderCard, BinderChip, BinderInput, BinderScreenHeader, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { getBetaSettings, setBetaDiagnostics } from '../lib/beta';
import { disablePushNotifications, enablePushNotifications } from '../lib/notifications';
import { useBinderHaptics } from '../theme/haptics';
import type { AccentThemeId, MotionPreference } from '../theme/tokens';
import { useBinderTheme } from '../theme/ThemeProvider';

const ACCENT_OPTIONS: { id: AccentThemeId; label: string }[] = [
  { id: 'lime', label: 'Binder Lime' },
  { id: 'blue', label: 'Electric Blue' },
  { id: 'violet', label: 'Violet' },
  { id: 'coral', label: 'Coral' },
  { id: 'ice', label: 'Ice' },
];

export default function AppSettingsScreen({ onClose }: { onClose: () => void }) {
  const { theme, settings, hydrated, updateSettings, updateNotifications, updateQuietHours, resetSettings } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [diagnostics, setDiagnostics] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getBetaSettings().then((value) => { if (active) setDiagnostics(value.diagnostics_enabled); }).catch(() => { if (active) setMessage('Could not load diagnostics preference.'); }).finally(() => { if (active) setDiagnosticsLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggleDiagnostics(next: boolean) {
    setDiagnosticsLoading(true); setMessage('');
    try { setDiagnostics(await setBetaDiagnostics(next)); await haptic('selection'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update diagnostics.'); }
    finally { setDiagnosticsLoading(false); }
  }

  async function togglePush(next: boolean) {
    setMessage('');
    try {
      if (!next) {
        await disablePushNotifications();
        await updateNotifications({ enabled: false });
        setMessage('Push notifications are off on this installation.');
        return;
      }
      const result = await enablePushNotifications();
      if (result.status === 'registered') {
        await updateNotifications({ enabled: true });
        setMessage('Push notifications are active on this installation.');
      } else if (result.status === 'denied') {
        await updateNotifications({ enabled: false });
        setMessage('Android notification permission is denied. You can allow Binder in system settings.');
      } else if (result.status === 'missing-project-id') {
        await updateNotifications({ enabled: false });
        setMessage('This build is not connected to its EAS project yet.');
      } else if (result.status === 'offline') {
        setMessage('Could not reach the push service. Try again when you are online.');
      } else {
        setMessage('Remote push is available only in an Android or iOS development/release build.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update push notifications.');
    }
  }

  if (!hydrated) return <ScreenState kind="loading" message="Loading app settings…" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title="App settings" leading={{ icon: 'back', accessibilityLabel: 'Back to profile', onPress: onClose }} />
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <SectionHeader title="Make Binder feel right." copy="Visual preferences never change safety colors. Push delivery rules are enforced by Binder's server." />

      <SettingsSection title="Appearance" copy="Follow your device or keep Binder dark.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          <BinderChip label="System" selected={settings.appearance === 'system'} onPress={() => void updateSettings({ appearance: 'system' })} />
          <BinderChip label="Dark" selected={settings.appearance === 'dark'} onPress={() => void updateSettings({ appearance: 'dark' })} />
        </View>
      </SettingsSection>

      <SettingsSection title="Accent" copy="Only primary/trust accents change. Warning and destructive colors stay fixed.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          {ACCENT_OPTIONS.map((option) => <BinderChip key={option.id} label={option.label} selected={settings.accentTheme === option.id} onPress={() => { void updateSettings({ accentTheme: option.id }); void haptic('selection'); }} />)}
        </View>
      </SettingsSection>

      <SettingsSection title="Haptics & motion">
        <SwitchRow label="Haptics" copy="Subtle feedback for meaningful actions." value={settings.hapticsEnabled} onValueChange={(value) => void updateSettings({ hapticsEnabled: value })} />
        <BinderText variant="label" tone="secondary" style={{ marginTop: theme.spacing.x4, marginBottom: theme.spacing.x2 }}>Motion</BinderText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          {(['system','reduce','full'] as MotionPreference[]).map((value) => <BinderChip key={value} label={value === 'system' ? 'System' : value === 'reduce' ? 'Reduce' : 'Full'} selected={settings.motion === value} onPress={() => void updateSettings({ motion: value })} />)}
        </View>
      </SettingsSection>

      <SettingsSection title="Notifications" copy="Permission applies to this installation. Categories, sound and vibration follow your Binder account and are rechecked server-side before every send.">
        <SwitchRow label="Remote push" value={settings.notifications.enabled} onValueChange={(value) => void togglePush(value)} />
        <SwitchRow label="New matches" value={settings.notifications.newMatches} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ newMatches: value })} />
        <SwitchRow label="Messages" value={settings.notifications.messages} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ messages: value })} />
        <SwitchRow label="Moderation" value={settings.notifications.moderation} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ moderation: value })} />
        <SwitchRow label="Safety" value={settings.notifications.safety} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ safety: value })} />
        <SwitchRow label="Product updates" copy="Off by default." value={settings.notifications.product} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ product: value })} />
        <SwitchRow label="Sound" value={settings.notifications.sound} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ sound: value })} />
        <SwitchRow label="Vibration" value={settings.notifications.vibration} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ vibration: value })} />
      </SettingsSection>

      <SettingsSection title="Quiet hours" copy="Match, message, moderation and product pushes wait until the local end time. Urgent safety alerts remain immediate.">
        <SwitchRow label="Use quiet hours" value={settings.quietHours.enabled} onValueChange={(value) => void updateQuietHours({ enabled: value })} />
        <View style={{ flexDirection: 'row', gap: theme.spacing.x3, marginTop: theme.spacing.x3 }}>
          <View style={{ flex: 1 }}><BinderInput label="Start" value={settings.quietHours.start} onChangeText={(value) => void updateQuietHours({ start: value })} placeholder="22:00" /></View>
          <View style={{ flex: 1 }}><BinderInput label="End" value={settings.quietHours.end} onChangeText={(value) => void updateQuietHours({ end: value })} placeholder="08:00" /></View>
        </View>
      </SettingsSection>

      <SettingsSection title="Diagnostics" copy="Optional technical events only. No bio, messages, raw stack traces or precise location.">
        {diagnosticsLoading ? <ScreenState kind="loading" message="Checking diagnostics…" /> : <SwitchRow label="Share optional diagnostics" value={diagnostics} onValueChange={(value) => void toggleDiagnostics(value)} />}
      </SettingsSection>

      {message ? <BinderText variant="caption" tone={/are active|are off/.test(message) ? 'accent' : 'destructive'} style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <BinderButton label="Reset app settings" variant="secondary" onPress={() => void resetSettings()} style={{ marginTop: theme.spacing.x6 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

function SettingsSection({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <BinderCard style={{ marginTop: theme.spacing.x5 }}><BinderText variant="title">{title}</BinderText>{copy ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1, marginBottom: theme.spacing.x4 }}>{copy}</BinderText> : <View style={{ height: theme.spacing.x4 }} />}{children}</BinderCard>;
}

function SwitchRow({ label, copy, value, disabled, onValueChange }: { label: string; copy?: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  const { theme } = useBinderTheme();
  return <View style={{ minHeight: theme.layout.controlHeight + theme.spacing.x1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, opacity: disabled ? theme.feedback.disabledOpacity : 1 }}><View style={{ flex: 1 }}><BinderText variant="label">{label}</BinderText>{copy ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText> : null}</View><Switch accessibilityLabel={label} accessibilityHint={copy} disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: theme.colors.borderStrong, true: theme.accent.accent }} thumbColor={theme.colors.textPrimary} /></View>;
}
