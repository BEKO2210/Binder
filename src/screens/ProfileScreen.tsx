import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { recordBetaEvent } from '../lib/beta';
import { pickAndPrepareProfileImage } from '../lib/images';
import { replaceProfileImage, signedProfileImageUrl } from '../lib/media';
import {
  DELETE_ACCOUNT_URL,
  PRIVACY_URL,
  TERMS_URL,
  deleteCurrentAccount,
  getMyPrimaryMediaState,
  openBinderUrl,
  type MediaModerationState,
} from '../lib/safety';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender } from '../lib/validation';

export default function ProfileScreen({ userId, onOpenBeta }: { userId: string; onOpenBeta: () => void }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender>('nonbinary');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('45');
  const [distance, setDistance] = useState('50');
  const [photoUrl, setPhotoUrl] = useState('');
  const [mediaState, setMediaState] = useState<MediaModerationState | null>(null);

  useEffect(() => {
    void load();
  }, [userId]);

  async function load() {
    const startedAt = Date.now();
    setLoading(true);
    setMessage('');
    try {
      const [profileResult, preferenceResult, primaryMedia] = await Promise.all([
        supabase.from('profiles').select('first_name,bio,gender,interests').eq('user_id', userId).single(),
        supabase.from('user_preferences').select('interested_in,min_age,max_age,max_distance_km').eq('user_id', userId).single(),
        getMyPrimaryMediaState(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (preferenceResult.error) throw preferenceResult.error;

      setFirstName(profileResult.data.first_name);
      setBio(profileResult.data.bio);
      setGender(profileResult.data.gender as Gender);
      setInterests(profileResult.data.interests);
      setInterestedIn(preferenceResult.data.interested_in as Gender[]);
      setMinAge(String(preferenceResult.data.min_age));
      setMaxAge(String(preferenceResult.data.max_age));
      setDistance(String(preferenceResult.data.max_distance_km));
      setMediaState(primaryMedia);
      setPhotoUrl(primaryMedia?.storage_path ? await signedProfileImageUrl(primaryMedia.storage_path) : '');
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'ok' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load profile.');
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function toggleInterest(value: string) {
    setInterests((current) => current.includes(value) ? current.filter((item) => item !== value) : current.length < 12 ? [...current, value] : current);
  }

  function toggleInterestedIn(value: Gender) {
    setInterestedIn((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function changePhoto() {
    setBusy(true);
    setMessage('');
    try {
      const image = await pickAndPrepareProfileImage();
      if (!image) return;
      const path = await replaceProfileImage(userId, image, 0);
      setPhotoUrl(await signedProfileImageUrl(path));
      setMediaState({ storage_path: path, moderation_status: 'pending', moderation_reason: null });
      setMessage('Photo submitted for safety review. It stays private to other users until approved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Photo update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const min = Number(minAge);
    const max = Number(maxAge);
    const maxDistance = Number(distance);
    if (!firstName.trim() || interestedIn.length === 0 || !Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 100 || min > max || !Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 500) {
      setMessage('Check your profile and discovery settings.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('update_my_profile', {
        p_first_name: firstName.trim(),
        p_gender: gender,
        p_bio: bio.trim(),
        p_interests: interests,
        p_interested_in: interestedIn,
        p_min_age: min,
        p_max_age: max,
        p_max_distance_km: maxDistance,
      });
      if (error) throw error;
      setMessage('Profile saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDeletion() {
    Alert.alert(
      'Delete Binder account?',
      'This removes your Binder account, profile media and normal product data. Safety records may only be retained where legitimately required. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void performDeletion() },
      ],
    );
  }

  async function performDeletion() {
    setBusy(true);
    setMessage('');
    try {
      await deleteCurrentAccount();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete your account.');
      setBusy(false);
    }
  }

  async function openPolicy(url: string) {
    setMessage('');
    try {
      await openBinderUrl(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open Binder account information.');
    }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#C7FF4A" /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>YOUR PROFILE</Text>
      <Text style={styles.title}>Keep it current.</Text>
      <Text style={styles.privateCopy}>Birth date is locked after onboarding and never appears as a raw value to other users.</Text>

      <Pressable disabled={busy} onPress={changePhoto} style={styles.photoBox}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : <Text style={styles.photoAction}>Add photo</Text>}
        <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Change</Text></View>
      </Pressable>
      {mediaState ? <ModerationBadge state={mediaState} /> : null}

      <TextInput value={firstName} onChangeText={setFirstName} maxLength={40} placeholder="First name" placeholderTextColor="#6F6F79" style={styles.input} />
      <TextInput value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="Bio" placeholderTextColor="#6F6F79" style={[styles.input, styles.bio]} />

      <Text style={styles.label}>I am</Text>
      <View style={styles.chips}>{GENDERS.map((item) => <Chip key={item.value} label={item.label} active={gender === item.value} onPress={() => setGender(item.value)} />)}</View>

      <Text style={styles.label}>Interests</Text>
      <View style={styles.chips}>{INTERESTS.map((item) => <Chip key={item} label={item} active={interests.includes(item)} onPress={() => toggleInterest(item)} />)}</View>

      <Text style={styles.label}>I want to meet</Text>
      <View style={styles.chips}>{GENDERS.map((item) => <Chip key={item.value} label={item.label} active={interestedIn.includes(item.value)} onPress={() => toggleInterestedIn(item.value)} />)}</View>

      <View style={styles.row}>
        <SmallInput label="Min age" value={minAge} setValue={setMinAge} />
        <SmallInput label="Max age" value={maxAge} setValue={setMaxAge} />
        <SmallInput label="Km" value={distance} setValue={setDistance} />
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable disabled={busy} onPress={save} style={styles.primary}>{busy ? <ActivityIndicator color="#101115" /> : <Text style={styles.primaryText}>Save profile</Text>}</Pressable>

      <Pressable accessibilityRole="button" onPress={onOpenBeta} style={({ pressed }) => [styles.betaCard, pressed && styles.betaCardPressed]}>
        <View style={styles.betaTop}><Text style={styles.betaLabel}>PHASE 5 · BETA PROGRAM</Text><Text style={styles.betaArrow}>→</Text></View>
        <Text style={styles.betaTitle}>Diagnostics you control. Feedback we can use.</Text>
        <Text style={styles.betaCopy}>Review privacy-preserving ranking measurements, opt into technical diagnostics, and send private product feedback.</Text>
      </Pressable>

      <View style={styles.accountSection}>
        <Text style={styles.accountEyebrow}>ACCOUNT CONTROL</Text>
        <Text style={styles.accountTitle}>Rules, privacy and exit.</Text>
        <Text style={styles.accountCopy}>These controls stay visually separate from profile editing so destructive actions cannot be confused with everyday changes.</Text>
        <AccountLink label="Terms & Community Rules" onPress={() => void openPolicy(TERMS_URL)} />
        <AccountLink label="Privacy Policy" onPress={() => void openPolicy(PRIVACY_URL)} />
        <AccountLink label="Deletion & retention details" onPress={() => void openPolicy(DELETE_ACCOUNT_URL)} />
        <Pressable disabled={busy} onPress={() => void supabase.auth.signOut()} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerLabel}>IRREVERSIBLE</Text>
          <Text style={styles.dangerTitle}>Delete Binder account</Text>
          <Text style={styles.dangerCopy}>Immediately stop discovery and active conversations, then permanently remove the account through Binder's authenticated deletion service.</Text>
          <Pressable disabled={busy} onPress={confirmDeletion} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Delete account</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function ModerationBadge({ state }: { state: MediaModerationState }) {
  const copy = state.moderation_status === 'approved'
    ? 'Approved · visible to eligible people.'
    : state.moderation_status === 'pending'
      ? 'Review pending · only you can see this photo for now.'
      : state.moderation_status === 'rejected'
        ? `Not approved${state.moderation_reason ? ` · ${state.moderation_reason}` : ' · choose another photo.'}`
        : 'Removed for safety · choose another photo.';
  return <View style={[styles.moderation, styles[`moderation_${state.moderation_status}`]]}><Text style={[styles.moderationText, styles[`moderationText_${state.moderation_status}`]]}>{copy}</Text></View>;
}

function AccountLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.accountLink}><Text style={styles.accountLinkText}>{label}</Text><Text style={styles.accountArrow}>↗</Text></Pressable>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function SmallInput({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <View style={styles.small}><Text style={styles.smallLabel}>{label}</Text><TextInput value={value} onChangeText={setValue} keyboardType="number-pad" style={styles.smallInput} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' }, content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 80 },
  loading: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#C7FF4A', fontSize: 11, fontWeight: '900', letterSpacing: 2 }, title: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 8 },
  privateCopy: { color: '#858590', lineHeight: 19, marginTop: 7, marginBottom: 18 },
  photoBox: { height: 300, borderRadius: 24, overflow: 'hidden', backgroundColor: '#17171D', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  photo: { width: '100%', height: '100%' }, photoAction: { color: '#C7FF4A', fontWeight: '900' },
  photoBadge: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(10,10,14,.82)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, photoBadgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  moderation: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 }, moderationText: { fontSize: 11, fontWeight: '800', lineHeight: 16 },
  moderation_approved: { backgroundColor: '#151B13', borderColor: '#536B2C' }, moderationText_approved: { color: '#C7FF4A' },
  moderation_pending: { backgroundColor: '#1D1A12', borderColor: '#66562A' }, moderationText_pending: { color: '#F3C969' },
  moderation_rejected: { backgroundColor: '#211318', borderColor: '#66303D' }, moderationText_rejected: { color: '#FF8EA2' },
  moderation_removed: { backgroundColor: '#211318', borderColor: '#66303D' }, moderationText_removed: { color: '#FF8EA2' },
  input: { color: '#FFFFFF', backgroundColor: '#17171D', borderWidth: 1, borderColor: '#2B2B34', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 10 }, bio: { minHeight: 95, textAlignVertical: 'top' },
  label: { color: '#D8D8DE', fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#30303A', backgroundColor: '#17171D', paddingHorizontal: 12, paddingVertical: 9 }, chipActive: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' }, chipText: { color: '#B1B1BA', fontSize: 12, fontWeight: '800' }, chipTextActive: { color: '#111216' },
  row: { flexDirection: 'row', gap: 8, marginTop: 20 }, small: { flex: 1 }, smallLabel: { color: '#757580', fontSize: 10, marginBottom: 5 }, smallInput: { color: '#FFFFFF', textAlign: 'center', backgroundColor: '#17171D', borderWidth: 1, borderColor: '#2B2B34', borderRadius: 13, paddingVertical: 12 },
  message: { color: '#D9D9DF', lineHeight: 19, marginTop: 16 }, primary: { height: 54, borderRadius: 17, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginTop: 20 }, primaryText: { color: '#101115', fontWeight: '900' },
  betaCard: { marginTop: 28, borderRadius: 22, borderWidth: 1, borderColor: '#45562A', backgroundColor: '#141912', padding: 18 }, betaCardPressed: { backgroundColor: '#1A2115' }, betaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, betaLabel: { color: '#9BBC54', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, betaArrow: { color: '#C7FF4A', fontSize: 18, fontWeight: '800' }, betaTitle: { color: '#F2F5EB', fontSize: 18, lineHeight: 22, fontWeight: '900', marginTop: 12 }, betaCopy: { color: '#9FA990', fontSize: 12, lineHeight: 18, marginTop: 6 },
  accountSection: { borderTopWidth: 1, borderTopColor: '#282B34', marginTop: 36, paddingTop: 30 }, accountEyebrow: { color: '#777E89', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 }, accountTitle: { color: '#F7F8F3', fontSize: 25, fontWeight: '900', marginTop: 8 }, accountCopy: { color: '#858B96', fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 16 },
  accountLink: { minHeight: 52, borderBottomWidth: 1, borderBottomColor: '#272A33', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, accountLinkText: { color: '#D4D7DC', fontWeight: '800', fontSize: 13 }, accountArrow: { color: '#7D838E', fontSize: 16 },
  signOut: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#30343E' }, signOutText: { color: '#D7D9DE', fontWeight: '800' },
  dangerZone: { marginTop: 24, borderRadius: 22, borderWidth: 1, borderColor: '#5A2A35', backgroundColor: '#181015', padding: 18 }, dangerLabel: { color: '#FF718B', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }, dangerTitle: { color: '#FFF1F4', fontSize: 19, fontWeight: '900', marginTop: 7 }, dangerCopy: { color: '#A98B92', fontSize: 12, lineHeight: 18, marginTop: 7 }, deleteButton: { height: 50, borderRadius: 14, backgroundColor: '#FF5A76', alignItems: 'center', justifyContent: 'center', marginTop: 16 }, deleteText: { color: '#240A0F', fontWeight: '900' },
});
