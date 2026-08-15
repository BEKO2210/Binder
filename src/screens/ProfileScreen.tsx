import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { pickAndPrepareProfileImage } from '../lib/images';
import { replaceProfileImage, signedProfileImageUrl } from '../lib/media';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender } from '../lib/validation';

export default function ProfileScreen({ userId }: { userId: string }) {
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

  useEffect(() => {
    void load();
  }, [userId]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [profileResult, preferenceResult, mediaResult] = await Promise.all([
        supabase.from('profiles').select('first_name,bio,gender,interests').eq('user_id', userId).single(),
        supabase.from('user_preferences').select('interested_in,min_age,max_age,max_distance_km').eq('user_id', userId).single(),
        supabase.from('profile_media').select('storage_path').eq('user_id', userId).eq('position', 0).maybeSingle(),
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

      if (mediaResult.error) throw mediaResult.error;
      if (mediaResult.data?.storage_path) setPhotoUrl(await signedProfileImageUrl(mediaResult.data.storage_path));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load profile.');
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
      setMessage('Photo updated.');
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
      <Pressable disabled={busy} onPress={() => supabase.auth.signOut()} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function SmallInput({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <View style={styles.small}><Text style={styles.smallLabel}>{label}</Text><TextInput value={value} onChangeText={setValue} keyboardType="number-pad" style={styles.smallInput} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 60 },
  loading: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#C7FF4A', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 8 },
  privateCopy: { color: '#858590', lineHeight: 19, marginTop: 7, marginBottom: 18 },
  photoBox: { height: 300, borderRadius: 24, overflow: 'hidden', backgroundColor: '#17171D', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  photo: { width: '100%', height: '100%' },
  photoAction: { color: '#C7FF4A', fontWeight: '900' },
  photoBadge: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(10,10,14,.82)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  photoBadgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  input: { color: '#FFFFFF', backgroundColor: '#17171D', borderWidth: 1, borderColor: '#2B2B34', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 10 },
  bio: { minHeight: 95, textAlignVertical: 'top' },
  label: { color: '#D8D8DE', fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#30303A', backgroundColor: '#17171D', paddingHorizontal: 12, paddingVertical: 9 },
  chipActive: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' },
  chipText: { color: '#B1B1BA', fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: '#111216' },
  row: { flexDirection: 'row', gap: 8, marginTop: 20 },
  small: { flex: 1 },
  smallLabel: { color: '#757580', fontSize: 10, marginBottom: 5 },
  smallInput: { color: '#FFFFFF', textAlign: 'center', backgroundColor: '#17171D', borderWidth: 1, borderColor: '#2B2B34', borderRadius: 13, paddingVertical: 12 },
  message: { color: '#D9D9DF', lineHeight: 19, marginTop: 16 },
  primary: { height: 54, borderRadius: 17, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryText: { color: '#101115', fontWeight: '900' },
  signOut: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  signOutText: { color: '#FF8EA2', fontWeight: '800' },
});
