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
  const { theme } = useBinderTheme();
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
      setMessage(error instanceof Error ? error.message : 'Could not load profile.');
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'error' });
    } finally { setLoading(false); }
  }

  async function open(url: string) {
    setMessage('');
    try { await openBinderUrl(url); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open Binder information.'); }
  }

  function confirmDeletion() {
    Alert.alert('Delete Binder account?', 'This permanently removes your Binder account and normal product data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => void performDeletion() },
    ]);
  }

  function confirmSignOut() {
    Alert.alert('Sign out of Binder?', 'You will stop receiving in-app updates on this device until you sign in again. Your profile, matches, and messages stay in Binder.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', onPress: () => void supabase.auth.signOut() },
    ]);
  }

  async function performDeletion() {
    setBusy(true);
    setMessage('');
    try { await deleteCurrentAccount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete your account.'); setBusy(false); }
  }

  if (loading) return <ScreenState kind="loading" message="Loading your profile…" />;

  const completeness = profileCompleteness({ photoCount, bio, interestCount });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingBottom: theme.spacing.x16 }}>
      <BinderScreenHeader title="Your profile" eyebrow="BINDER" />
      <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
      {photoUrl ? <Image source={{ uri: photoUrl }} accessibilityLabel="Your primary profile photo" style={{ width: '100%', height: theme.layout.profileHeroHeight, borderRadius: theme.radii.hero }} resizeMode="cover" /> : <BinderCard style={{ minHeight: theme.layout.onboardingPhotoHeight, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x3 }}><BinderIcon name="addPhoto" size={34} color={theme.accent.accent} /><BinderText variant="label" tone="accent">Add your first photo</BinderText></BinderCard>}
      <BinderText variant="heading" style={{ marginTop: theme.spacing.x5 }}>{firstName || 'Your profile'}</BinderText>
      <BinderText variant="body" tone={bio ? 'secondary' : 'muted'} style={{ marginTop: theme.spacing.x2 }}>{bio || 'Add a few real lines about yourself so people know what to ask you.'}</BinderText>
      <BinderCard style={{ marginTop: theme.spacing.x5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View><BinderText variant="micro" tone="muted">PROFILE STRENGTH</BinderText><BinderText variant="title" style={{ marginTop: theme.spacing.x1 }}>{completeness.percent}% complete</BinderText></View><BinderText variant="label" tone="accent">{completeness.completed}/{completeness.total}</BinderText></View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: completeness.percent }} style={{ height: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.colors.borderStrong, overflow: 'hidden', marginTop: theme.spacing.x4 }}><View style={{ width: `${completeness.percent}%`, height: '100%', backgroundColor: theme.accent.accent }} /></View>
        <View style={{ marginTop: theme.spacing.x3, gap: theme.spacing.x2 }}>{completeness.items.map((item) => <View key={item.key} style={{ minHeight: theme.layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name={item.complete ? 'check' : 'chevronRight'} size={20} color={item.complete ? theme.semantic.success : theme.colors.textMuted} /><BinderText variant="label" tone={item.complete ? 'muted' : 'secondary'} style={{ flex: 1 }}>{item.complete ? `${item.label} · done` : item.label}</BinderText></View>)}</View>
        {!completeness.complete ? <BinderButton label="Complete profile" variant="secondary" icon="edit" onPress={onEditProfile} style={{ marginTop: theme.spacing.x3 }} /> : null}
      </BinderCard>
      <View style={{ gap: theme.spacing.x3, marginTop: theme.spacing.x5 }}>
        <HubRow icon="edit" title="Profile & photos" copy="Edit your profile, discovery preferences and up to six moderated photos." onPress={onEditProfile} />
        <HubRow icon="settings" title="App settings" copy="Appearance, haptics, motion, notification preferences and quiet hours." onPress={onOpenSettings} />
        <HubRow icon="beta" title="Beta program" copy="Optional diagnostics and private feedback." onPress={onOpenBeta} />
        <HubRow icon="info" title="About & legal notice" copy="Impressum, policies and the version you are running." onPress={onOpenAbout} />
      </View>
      <View style={{ marginTop: theme.spacing.x8 }}>
        <BinderText variant="micro" tone="muted">SAFETY & PRIVACY</BinderText>
        <View style={{ marginTop: theme.spacing.x2 }}>
          <PolicyRow icon="legal" label="Terms & Community Rules" onPress={() => void open(TERMS_URL)} />
          <PolicyRow icon="privacy" label="Privacy Policy" onPress={() => void open(PRIVACY_URL)} />
          <PolicyRow icon="info" label="Deletion & retention details" onPress={() => void open(DELETE_ACCOUNT_URL)} />
        </View>
      </View>
      {message ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      <View style={{ marginTop: theme.spacing.x10, paddingTop: theme.spacing.x6, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle }}><BinderText variant="micro" tone="muted">ACCOUNT ACTIONS</BinderText><BinderButton label="Sign out" icon="logout" variant="secondary" disabled={busy} onPress={confirmSignOut} style={{ marginTop: theme.spacing.x4 }} /></View>
      <BinderCard style={{ marginTop: theme.spacing.x8, borderColor: theme.semantic.destructive, backgroundColor: theme.mode === 'dark' ? theme.semantic.destructiveSoftDark : theme.semantic.destructiveSoftLight }}>
        <BinderText variant="micro" tone="destructive">IRREVERSIBLE</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x2 }}>Delete Binder account</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Stops discovery and conversations, removes profile media and deletes your authentication identity.</BinderText>
        <BinderButton label="Delete account" icon="delete" variant="destructive" disabled={busy} onPress={confirmDeletion} style={{ marginTop: theme.spacing.x4 }} />
      </BinderCard>
      </View>
    </ScrollView>
  );
}

function HubRow({ icon, title, copy, onPress }: { icon: 'edit' | 'settings' | 'beta' | 'info'; title: string; copy: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {({ pressed }) => <BinderCard style={{ backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
        <View style={{ width: theme.layout.minimumTouchTarget, height: theme.layout.minimumTouchTarget, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderIcon name={icon} color={theme.accent.accent} /></View>
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
