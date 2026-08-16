import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';

import { BinderBrand, BinderButton, BinderCard, BinderIcon, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { recordBetaEvent } from '../lib/beta';
import { listMyProfileMedia } from '../lib/media';
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
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, [userId]);

  async function load() {
    const startedAt = Date.now();
    setLoading(true);
    setMessage('');
    try {
      const [profile, media] = await Promise.all([
        supabase.from('profiles').select('first_name,bio').eq('user_id', userId).single(),
        listMyProfileMedia(),
      ]);
      if (profile.error) throw profile.error;
      setFirstName(profile.data.first_name);
      setBio(profile.data.bio);
      setPhotoUrl(media[0]?.signedUrl ?? '');
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

  async function performDeletion() {
    setBusy(true);
    setMessage('');
    try { await deleteCurrentAccount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete your account.'); setBusy(false); }
  }

  if (loading) return <ScreenState kind="loading" message="Loading your profile…" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }}>
      <BinderBrand compact />
      <View style={{ marginTop: theme.spacing.x6 }}>
        <SectionHeader eyebrow="YOUR BINDER" title={firstName || 'Your profile'} copy={bio || 'Add a few real lines about yourself.'} />
      </View>
      {photoUrl ? <Image source={{ uri: photoUrl }} style={{ width: '100%', height: 360, borderRadius: theme.radii.hero, marginTop: theme.spacing.x5 }} resizeMode="cover" /> : null}
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
      <BinderButton label="Sign out" icon="logout" variant="secondary" disabled={busy} onPress={() => void supabase.auth.signOut()} style={{ marginTop: theme.spacing.x6 }} />
      <BinderCard style={{ marginTop: theme.spacing.x6, borderColor: theme.semantic.destructive, backgroundColor: theme.mode === 'dark' ? theme.semantic.destructiveSoftDark : theme.semantic.destructiveSoftLight }}>
        <BinderText variant="micro" tone="destructive">IRREVERSIBLE</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x2 }}>Delete Binder account</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Stops discovery and conversations, removes profile media and deletes your authentication identity.</BinderText>
        <BinderButton label="Delete account" icon="delete" variant="destructive" disabled={busy} onPress={confirmDeletion} style={{ marginTop: theme.spacing.x4 }} />
      </BinderCard>
    </ScrollView>
  );
}

function HubRow({ icon, title, copy, onPress }: { icon: 'edit' | 'settings' | 'beta' | 'info'; title: string; copy: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {({ pressed }) => <BinderCard style={{ backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
        <View style={{ width: 44, height: 44, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderIcon name={icon} color={theme.accent.accent} /></View>
        <View style={{ flex: 1 }}><BinderText variant="label">{title}</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText></View>
        <BinderIcon name="chevronRight" color={theme.colors.textMuted} />
      </BinderCard>}
    </Pressable>
  );
}

function PolicyRow({ icon, label, onPress }: { icon: 'legal' | 'privacy' | 'info'; label: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle, backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' })}><BinderIcon name={icon} size={20} color={theme.colors.textSecondary} /><BinderText variant="label" tone="secondary" style={{ flex: 1 }}>{label}</BinderText><BinderIcon name="chevronRight" size={20} color={theme.colors.textMuted} /></Pressable>;
}
