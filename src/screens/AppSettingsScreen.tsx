import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import { BinderButton, BinderCard, BinderChip, BinderIconButton, BinderInput, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { getBetaSettings, setBetaDiagnostics } from '../lib/beta';
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

  if (!hydrated) return <ScreenState kind="loading" message="Loading app settings…" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x16 }}>
      <BinderIconButton name="back" accessibilityLabel="Back to profile" onPress={onClose} />
      <SectionHeader eyebrow="APP SETTINGS" title="Make Binder feel right." copy="Visual preferences never change safety colors. Notification controls are ready for Phase 7 push delivery." />

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

      <SettingsSection title="Notifications" copy="These preferences become delivery rules when real push is enabled in Phase 7.">
        <SwitchRow label="Notifications" value={settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ enabled: value })} />
        <SwitchRow label="New matches" value={settings.notifications.newMatches} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ newMatches: value })} />
        <SwitchRow label="Messages" value={settings.notifications.messages} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ messages: value })} />
        <SwitchRow label="Moderation" value={settings.notifications.moderation} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ moderation: value })} />
        <SwitchRow label="Safety" value={settings.notifications.safety} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ safety: value })} />
        <SwitchRow label="Product updates" copy="Off by default." value={settings.notifications.product} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ product: value })} />
        <SwitchRow label="Sound" value={settings.notifications.sound} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ sound: value })} />
        <SwitchRow label="Vibration" value={settings.notifications.vibration} disabled={!settings.notifications.enabled} onValueChange={(value) => void updateNotifications({ vibration: value })} />
      </SettingsSection>

      <SettingsSection title="Quiet hours" copy="Delivery scheduling is applied by Phase 7; keep your preferred window here now.">
        <SwitchRow label="Use quiet hours" value={settings.quietHours.enabled} onValueChange={(value) => void updateQuietHours({ enabled: value })} />
        <View style={{ flexDirection: 'row', gap: theme.spacing.x3, marginTop: theme.spacing.x3 }}>
          <View style={{ flex: 1 }}><BinderInput label="Start" value={settings.quietHours.start} onChangeText={(value) => void updateQuietHours({ start: value })} placeholder="22:00" /></View>
          <View style={{ flex: 1 }}><BinderInput label="End" value={settings.quietHours.end} onChangeText={(value) => void updateQuietHours({ end: value })} placeholder="08:00" /></View>
        </View>
      </SettingsSection>

      <SettingsSection title="Diagnostics" copy="Optional technical events only. No bio, messages, raw stack traces or precise location.">
        {diagnosticsLoading ? <ScreenState kind="loading" message="Checking diagnostics…" /> : <SwitchRow label="Share optional diagnostics" value={diagnostics} onValueChange={(value) => void toggleDiagnostics(value)} />}
      </SettingsSection>

      {message ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <BinderButton label="Reset app settings" variant="secondary" onPress={() => void resetSettings()} style={{ marginTop: theme.spacing.x6 }} />
    </ScrollView>
  );
}

function SettingsSection({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <BinderCard style={{ marginTop: theme.spacing.x5 }}><BinderText variant="title">{title}</BinderText>{copy ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1, marginBottom: theme.spacing.x4 }}>{copy}</BinderText> : <View style={{ height: theme.spacing.x4 }} />}{children}</BinderCard>;
}

function SwitchRow({ label, copy, value, disabled, onValueChange }: { label: string; copy?: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  const { theme } = useBinderTheme();
  return <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, opacity: disabled ? 0.42 : 1 }}><View style={{ flex: 1 }}><BinderText variant="label">{label}</BinderText>{copy ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText> : null}</View><Switch disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: theme.colors.borderStrong, true: theme.accent.accent }} thumbColor={theme.colors.textPrimary} /></View>;
}
