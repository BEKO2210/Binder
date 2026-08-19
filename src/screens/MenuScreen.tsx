import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { BinderButton, BinderCard, BinderIcon, BinderScreenHeader, BinderText } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL, deleteCurrentAccount, openBinderUrl } from '../lib/safety';
import { confirmDestructive } from '../lib/confirmDestructive';
import { markIntentionalSignOut } from '../lib/sessionEnd';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = {
  onOpenSettings: () => void;
  onOpenBeta: () => void;
  onOpenAbout: () => void;
};

// Everything that is not the profile itself. It used to sit under the profile,
// which meant the screen showing a person their own photo and bio also held the
// language picker, the beta programme, the policies, signing out and deleting
// the account. Two different jobs on one screen, and the destructive one at the
// bottom of the one people open to look at themselves.
export default function MenuScreen({ onOpenSettings, onOpenBeta, onOpenAbout }: Props) {
  const { theme, t } = useBinderTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function open(url: string) {
    setMessage('');
    try { await openBinderUrl(url); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('profile.errors.openInformation')); }
  }

  function confirmSignOut() {
    Alert.alert(t('profile.alerts.signOutTitle'), t('profile.alerts.signOutMessage'), [
      { text: t('profile.actions.staySignedIn'), style: 'cancel' },
      // Signing out can fail, and a sign-out that silently did not happen is
      // worse than one that says so — on a shared phone the next person would
      // still be signed in as somebody else.
      { text: t('profile.actions.signOut'), onPress: () => void signOut() },
    ]);
  }

  async function signOut() {
    setMessage('');
    // Says "this one was on purpose", so Root does not treat it as a session
    // that expired on its own.
    markIntentionalSignOut();
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
  }

  function confirmDeletion() {
    confirmDestructive({ title: t('profile.alerts.deleteTitle'), message: t('profile.alerts.deleteMessage'), cancelText: t('profile.actions.cancel'), destructiveText: t('profile.actions.deleteAccount'), onConfirm: () => void performDeletion() });
  }

  async function performDeletion() {
    setBusy(true);
    setMessage('');
    try { await deleteCurrentAccount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('profile.errors.deleteAccount')); setBusy(false); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingBottom: theme.spacing.x16 + theme.spacing.x8 }}>
      <BinderScreenHeader title={t('menu.header.title')} eyebrow={t('menu.header.eyebrow')} />
      <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
        <View style={{ gap: theme.spacing.x3 }}>
          <MenuRow icon="settings" title={t('profile.hub.settingsTitle')} copy={t('profile.hub.settingsCopy')} onPress={onOpenSettings} />
          <MenuRow icon="beta" title={t('profile.hub.betaTitle')} copy={t('profile.hub.betaCopy')} onPress={onOpenBeta} />
          <MenuRow icon="info" title={t('profile.hub.aboutTitle')} copy={t('profile.hub.aboutCopy')} onPress={onOpenAbout} />
        </View>

        <View style={{ marginTop: theme.spacing.x8 }}>
          <BinderText variant="eyebrow" tone="accent">{t('profile.safety.eyebrow')}</BinderText>
          <View style={{ marginTop: theme.spacing.x2 }}>
            <PolicyRow icon="legal" label={t('profile.safety.terms')} onPress={() => void open(TERMS_URL)} />
            <PolicyRow icon="privacy" label={t('profile.safety.privacy')} onPress={() => void open(PRIVACY_URL)} />
            <PolicyRow icon="info" label={t('profile.safety.deletionDetails')} onPress={() => void open(DELETE_ACCOUNT_URL)} />
          </View>
        </View>

        {message ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}

        <View style={{ marginTop: theme.spacing.x10, paddingTop: theme.spacing.x6, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle }}>
          <BinderText variant="eyebrow" tone="accent">{t('profile.account.eyebrow')}</BinderText>
          <BinderButton label={t('profile.actions.signOut')} icon="logout" variant="secondary" disabled={busy} onPress={confirmSignOut} style={{ marginTop: theme.spacing.x4 }} />
        </View>

        <BinderCard style={{ marginTop: theme.spacing.x8, borderColor: theme.semantic.destructive, backgroundColor: theme.mode === 'dark' ? theme.semantic.destructiveSoftDark : theme.semantic.destructiveSoftLight }}>
          <BinderText variant="micro" tone="destructive">{t('profile.account.irreversible')}</BinderText>
          <BinderText variant="title" style={{ marginTop: theme.spacing.x2 }}>{t('profile.account.deleteTitle')}</BinderText>
          <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('profile.account.deleteCopy')}</BinderText>
          <BinderButton label={t('profile.actions.deleteAccount')} icon="delete" variant="destructive" disabled={busy} onPress={confirmDeletion} style={{ marginTop: theme.spacing.x4 }} />
        </BinderCard>
      </View>
    </ScrollView>
  );
}

function MenuRow({ icon, title, copy, onPress }: { icon: 'settings' | 'beta' | 'info'; title: string; copy: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={copy} onPress={onPress} style={{ minHeight: theme.layout.minimumTouchTarget, borderRadius: theme.radii.card, borderWidth: 1, borderColor: theme.colors.borderSubtle, padding: theme.spacing.x4, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
      <BinderIcon name={icon} size={22} color={theme.accent.onSurface} />
      <View style={{ flex: 1 }}>
        <BinderText variant="label">{title}</BinderText>
        <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText>
      </View>
      <BinderIcon name="chevronRight" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function PolicyRow({ icon, label, onPress }: { icon: 'legal' | 'privacy' | 'info'; label: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={{ minHeight: theme.layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
      <BinderIcon name={icon} size={20} color={theme.colors.textSecondary} />
      <BinderText variant="label" tone="secondary" style={{ flex: 1 }}>{label}</BinderText>
      <BinderIcon name="chevronRight" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}
