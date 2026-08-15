import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { pickAndPrepareProfileImage, type PreparedImage } from '../lib/images';
import { replaceProfileImage } from '../lib/media';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender, validateAdultBirthDate } from '../lib/validation';

type Props = {
  userId: string;
  onComplete: () => void;
};

export default function OnboardingScreen({ userId, onComplete }: Props) {
  const [firstName, setFirstName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestedIn, setInterestedIn] = useState<Gender[]>(['woman', 'man', 'nonbinary']);
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('45');
  const [distance, setDistance] = useState('50');
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleInterest(value: string) {
    setInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : current.length < 12 ? [...current, value] : current,
    );
  }

  function toggleInterestedIn(value: Gender) {
    setInterestedIn((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function choosePhoto() {
    try {
      setError('');
      const next = await pickAndPrepareProfileImage();
      if (next) setPhoto(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare photo.');
    }
  }

  async function finish() {
    const ageError = validateAdultBirthDate(birthDate);
    const min = Number(minAge);
    const max = Number(maxAge);
    const maxDistance = Number(distance);

    if (!firstName.trim()) return setError('First name is required.');
    if (ageError) return setError(ageError);
    if (!gender) return setError('Choose your gender.');
    if (!photo) return setError('Add at least one profile photo.');
    if (interestedIn.length === 0) return setError('Choose who you want to meet.');
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 100 || min > max) return setError('Check your age range.');
    if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 500) return setError('Distance must be between 1 and 500 km.');

    setBusy(true);
    setError('');
    try {
      const { error: identityError } = await supabase.rpc('complete_my_onboarding', {
        p_first_name: firstName.trim(),
        p_birth_date: birthDate.trim(),
        p_gender: gender,
        p_bio: bio.trim(),
        p_interests: interests,
        p_interested_in: interestedIn,
        p_min_age: min,
        p_max_age: max,
        p_max_distance_km: maxDistance,
      });
      if (identityError) throw identityError;

      await replaceProfileImage(userId, photo, 0);

      const { error: finalizeError } = await supabase.rpc('finalize_my_onboarding');
      if (finalizeError) throw finalizeError;

      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Onboarding failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>BINDER · 18+</Text>
      <Text style={styles.title}>Build a profile people can trust.</Text>
      <Text style={styles.copy}>Your birth date and exact location stay private. Other people only receive the age and distance Binder calculates.</Text>

      <Field label="First name">
        <TextInput value={firstName} onChangeText={setFirstName} maxLength={40} placeholder="First name" placeholderTextColor="#6F6F79" style={styles.input} />
      </Field>

      <Field label="Birth date · YYYY-MM-DD">
        <TextInput value={birthDate} onChangeText={setBirthDate} keyboardType="numbers-and-punctuation" placeholder="1995-04-23" placeholderTextColor="#6F6F79" style={styles.input} />
      </Field>

      <Field label="I am">
        <View style={styles.chips}>{GENDERS.map((item) => <Chip key={item.value} label={item.label} active={gender === item.value} onPress={() => setGender(item.value)} />)}</View>
      </Field>

      <Field label="Bio">
        <TextInput value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="A few real lines about you…" placeholderTextColor="#6F6F79" style={[styles.input, styles.bio]} />
      </Field>

      <Field label="Interests">
        <View style={styles.chips}>{INTERESTS.map((item) => <Chip key={item} label={item} active={interests.includes(item)} onPress={() => toggleInterest(item)} />)}</View>
      </Field>

      <Field label="I want to meet">
        <View style={styles.chips}>{GENDERS.map((item) => <Chip key={item.value} label={item.label} active={interestedIn.includes(item.value)} onPress={() => toggleInterestedIn(item.value)} />)}</View>
      </Field>

      <Field label="Discovery range">
        <View style={styles.row}>
          <SmallInput label="Min age" value={minAge} setValue={setMinAge} />
          <SmallInput label="Max age" value={maxAge} setValue={setMaxAge} />
          <SmallInput label="Km" value={distance} setValue={setDistance} />
        </View>
      </Field>

      <Field label="Profile photo">
        <Pressable onPress={choosePhoto} style={styles.photoPicker}>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} /> : <Text style={styles.photoText}>Choose photo</Text>}
        </Pressable>
        <Text style={styles.help}>Before upload: max 1080 px edge, WebP, 80% quality.</Text>
      </Field>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable disabled={busy} onPress={finish} style={styles.primary}>
        {busy ? <ActivityIndicator color="#101115" /> : <Text style={styles.primaryText}>Enter Binder</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function SmallInput({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <View style={styles.small}><Text style={styles.smallLabel}>{label}</Text><TextInput value={value} onChangeText={setValue} keyboardType="number-pad" style={styles.smallInput} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 56 },
  eyebrow: { color: '#C7FF4A', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1.1, marginTop: 10 },
  copy: { color: '#9A9AA4', fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 20 },
  field: { marginTop: 18 },
  label: { color: '#D8D8DE', fontSize: 12, fontWeight: '800', marginBottom: 8 },
  input: { color: '#FFFFFF', backgroundColor: '#17171D', borderWidth: 1, borderColor: '#2B2B34', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  bio: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#30303A', backgroundColor: '#17171D', paddingHorizontal: 12, paddingVertical: 9 },
  chipActive: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' },
  chipText: { color: '#B1B1BA', fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: '#111216' },
  row: { flexDirection: 'row', gap: 8 },
  small: { flex: 1 },
  smallLabel: { color: '#757580', fontSize: 10, marginBottom: 5 },
  smallInput: { color: '#FFFFFF', textAlign: 'center', backgroundColor: '#17171D', borderWidth: 1, borderColor: '#2B2B34', borderRadius: 13, paddingVertical: 12 },
  photoPicker: { height: 260, backgroundColor: '#17171D', borderWidth: 1, borderColor: '#30303A', borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  photoText: { color: '#C7FF4A', fontWeight: '900' },
  help: { color: '#666671', fontSize: 11, marginTop: 7 },
  error: { color: '#FF8EA2', lineHeight: 20, marginTop: 18 },
  primary: { height: 56, borderRadius: 18, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryText: { color: '#101115', fontWeight: '900', fontSize: 15 },
});
