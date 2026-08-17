import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';

import { BinderButton, BinderCard, BinderIcon, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import { recordBetaEvent } from '../lib/beta';
import { listMyProfileMedia } from '../lib/media';
import { profileCompleteness } from '../lib/profileCompleteness';
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL, deleteCurrentAccount, openBinderUrl } from '../lib/safety';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = {
  userId: string;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  onOpenBeta: () => void;
  onOpenAbout: () => void;
};

export default function ProfileScreen({ userId, onEditProfile, onOpenSettings, onOpenBeta, onOpenAbout }: Props) {
  const { theme, t } = useBinderTheme();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCount, setPhotoCount] = useState(0);
  const [interestCount, setInterestCount] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, [userId]);

  async function load() {
    const startedAt = Date.now();
    setLoading(true);
    setMessage('');
    try {
      const [profile, media] = await Promise.all([
        supabase.from('profiles').select('first_name,bio,interests').eq('user_id', userId).single(),
        listMyProfileMedia(),
      ]);
      if (profile.error) throw profile.error;
      setFirstName(profile.data.first_name);
      setBio(profile.data.bio);
      setPhotoUrl(media[0]?.signedUrl ?? '');
      setPhotoCount(media.length);
      setInterestCount(profile.data.interests?.length ?? 0);
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'ok' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('profile.errors.load'));
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'error' });
    } finally { setLoading(false); }
  }

  async function open(url: string) {
    setMessage('');
    try { await openBinderUrl(url); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('profile.errors.openInformation')); }
  }

  function confirmDeletion() {
    Alert.alert(t('profile.alerts.deleteTitle'), t('profile.alerts.deleteMessage'), [
      { text: t('profile.actions.cancel'), style: 'cancel' },
      { text: t('profile.actions.deleteAccount'), style: 'destructive', onPress: () => void performDeletion() },
    ]);
  }

  function confirmSignOut() {
    Alert.alert(t('profile.alerts.signOutTitle'), t('profile.alerts.signOutMessage'), [
      { text: t('profile.actions.staySignedIn'), style: 'cancel' },
      { text: t('profile.actions.signOut'), onPress: () => void supabase.auth.signOut() },
    ]);
  }

  async function performDeletion() {
    setBusy(true);
    setMessage('');
    try { await deleteCurrentAccount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('profile.errors.deleteAccount')); setBusy(false); }
  }

  if (loading) return <ScreenState kind="loading" message={t('profile.states.loading')} />;

  const completeness = profileCompleteness({ photoCount, bio, interestCount });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingBottom: theme.spacing.x16 }}>
      <BinderScreenHeader title={t('profile.header.title')} eyebrow={t('profile.header.eyebrow')} />
      <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
      {photoUrl ? <Image source={{ uri: photoUrl }} accessibilityLabel={t('profile.accessibility.primaryPhoto')} style={{ width: '100%', height: theme.layout.profileHeroHeight, borderRadius: theme.radii.hero }} resizeMode="cover" /> : <BinderCard style={{ minHeight: theme.layout.onboardingPhotoHeight, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x3 }}><BinderIcon name="addPhoto" size={34} color={theme.accent.onSurface} /><BinderText variant="label" tone="accent">{t('profile.empty.addFirstPhoto')}</BinderText></BinderCard>}
      <BinderText variant="heading" style={{ marginTop: theme.spacing.x5 }}>{firstName || t('profile.header.title')}</BinderText>
      <BinderText variant="body" tone={bio ? 'secondary' : 'muted'} style={{ marginTop: theme.spacing.x2 }}>{bio || t('profile.empty.addBio')}</BinderText>
      <BinderCard style={{ marginTop: theme.spacing.x5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View><BinderText variant="micro" tone="muted">{t('profile.completeness.eyebrow')}</BinderText><BinderText variant="title" style={{ marginTop: theme.spacing.x1 }}>{t('profile.completeness.percent', { percent: completeness.percent })}</BinderText></View><BinderText variant="label" tone="accent">{completeness.completed}/{completeness.total}</BinderText></View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: completeness.percent }} style={{ height: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.colors.borderStrong, overflow: 'hidden', marginTop: theme.spacing.x4 }}><View style={{ width: `${completeness.percent}%`, height: '100%', backgroundColor: theme.accent.accent }} /></View>
        <View style={{ marginTop: theme.spacing.x3, gap: theme.spacing.x2 }}>{completeness.items.map((item) => <View key={item.key} style={{ minHeight: theme.layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name={item.complete ? 'check' : 'chevronRight'} size={20} color={item.complete ? theme.semantic.success : theme.colors.textMuted} /><BinderText variant="label" tone={item.complete ? 'muted' : 'secondary'} style={{ flex: 1 }}>{item.complete ? t('profile.completeness.done', { item: item.label }) : item.label}</BinderText></View>)}</View>
        {!completeness.complete ? <BinderButton label={t('profile.actions.completeProfile')} variant="secondary" icon="edit" onPress={onEditProfile} style={{ marginTop: theme.spacing.x3 }} /> : null}
      </BinderCard>
      <View style={{ gap: theme.spacing.x3, marginTop: theme.spacing.x5 }}>
        <HubRow icon="edit" title={t('profile.hub.profileTitle')} copy={t('profile.hub.profileCopy')} onPress={onEditProfile} />
        <HubRow icon="settings" title={t('profile.hub.settingsTitle')} copy={t('profile.hub.settingsCopy')} onPress={onOpenSettings} />
        <HubRow icon="beta" title={t('profile.hub.betaTitle')} copy={t('profile.hub.betaCopy')} onPress={onOpenBeta} />
        <HubRow icon="info" title={t('profile.hub.aboutTitle')} copy={t('profile.hub.aboutCopy')} onPress={onOpenAbout} />
      </View>
      <View style={{ marginTop: theme.spacing.x8 }}>
        <BinderText variant="micro" tone="muted">{t('profile.safety.eyebrow')}</BinderText>
        <View style={{ marginTop: theme.spacing.x2 }}>
          <PolicyRow icon="legal" label={t('profile.safety.terms')} onPress={() => void open(TERMS_URL)} />
          <PolicyRow icon="privacy" label={t('profile.safety.privacy')} onPress={() => void open(PRIVACY_URL)} />
          <PolicyRow icon="info" label={t('profile.safety.deletionDetails')} onPress={() => void open(DELETE_ACCOUNT_URL)} />
        </View>
      </View>
      {message ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <View style={{ marginTop: theme.spacing.x10, paddingTop: theme.spacing.x6, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle }}><BinderText variant="micro" tone="muted">{t('profile.account.eyebrow')}</BinderText><BinderButton label={t('profile.actions.signOut')} icon="logout" variant="secondary" disabled={busy} onPress={confirmSignOut} style={{ marginTop: theme.spacing.x4 }} /></View>
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

function HubRow({ icon, title, copy, onPress }: { icon: 'edit' | 'settings' | 'beta' | 'info'; title: string; copy: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} pressedSurface={false}>
      {({ pressed }) => <BinderCard style={{ backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
        <View style={{ width: theme.layout.minimumTouchTarget, height: theme.layout.minimumTouchTarget, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderIcon name={icon} color={theme.accent.onSurface} /></View>
        <View style={{ flex: 1 }}><BinderText variant="label">{title}</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText></View>
        <BinderIcon name="chevronRight" color={theme.colors.textMuted} />
      </BinderCard>}
    </Pressable>
  );
}

function PolicyRow({ icon, label, onPress }: { icon: 'legal' | 'privacy' | 'info'; label: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ minHeight: theme.layout.controlHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent })}><BinderIcon name={icon} size={20} color={theme.colors.textSecondary} /><BinderText variant="label" tone="secondary" style={{ flex: 1 }}>{label}</BinderText><BinderIcon name="chevronRight" size={20} color={theme.colors.textMuted} /></Pressable>;
}
