import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderInput, BinderText, SectionHeader } from '../components/ui';
import { assessBirthDate, sanitizeDigits } from '../lib/birthdate';
import { pickAndPrepareProfileImage, type PreparedImage } from '../lib/images';
import { resolveSpring } from '../lib/motionPolicy';
import { addProfileImage } from '../lib/media';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender, validateAdultBirthDate } from '../lib/validation';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { userId: string; onComplete: () => void };

export default function OnboardingScreen({ userId, onComplete }: Props) {
  const { theme } = useBinderTheme();
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
  const [uploadedPhotoUri, setUploadedPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleInterest(value: string) { setInterests((current) => current.includes(value) ? current.filter((item) => item !== value) : current.length < 12 ? [...current, value] : current); }
  function toggleInterestedIn(value: Gender) { setInterestedIn((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]); }

  async function choosePhoto() {
    try { setError(''); const next = await pickAndPrepareProfileImage(); if (next) setPhoto(next); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare photo.'); }
  }

  async function finish() {
    const ageError = validateAdultBirthDate(birthDate);
    const min = Number(minAge); const max = Number(maxAge); const maxDistance = Number(distance);
    if (!firstName.trim()) return setError('First name is required.');
    if (ageError) return setError(ageError);
    if (!gender) return setError('Choose your gender.');
    if (!photo) return setError('Add at least one profile photo.');
    if (interestedIn.length === 0) return setError('Choose who you want to meet.');
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 100 || min > max) return setError('Check your age range.');
    if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 500) return setError('Distance must be between 1 and 500 km.');
    setBusy(true); setError('');
    try {
      const { error: identityError } = await supabase.rpc('complete_my_onboarding', { p_first_name: firstName.trim(), p_birth_date: birthDate.trim(), p_gender: gender, p_bio: bio.trim(), p_interests: interests, p_interested_in: interestedIn, p_min_age: min, p_max_age: max, p_max_distance_km: maxDistance });
      if (identityError) throw identityError;
      // A retry after a later step failed must not upload the photo twice.
      if (uploadedPhotoUri !== photo.uri) {
        await addProfileImage(userId, photo);
        setUploadedPhotoUri(photo.uri);
      }
      const { error: finalizeError } = await supabase.rpc('finalize_my_onboarding');
      if (finalizeError) throw finalizeError;
      onComplete();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Onboarding failed.'); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingTop: theme.spacing.x5, paddingHorizontal: theme.spacing.screen, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <SectionHeader eyebrow="BINDER · 18+" title="Build a profile people can trust." copy="Your birth date and exact location stay private. Other people only receive the age and distance Binder calculates." />
      <View style={{ gap: theme.spacing.x6, marginTop: theme.spacing.x8 }}>
        <BinderInput label="First name" value={firstName} onChangeText={setFirstName} maxLength={40} placeholder="First name" />
        <BirthDateField onValidDate={setBirthDate} />
        <ChoiceField label="I am"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={gender === item.value} onPress={() => setGender(item.value)} />)}</View></ChoiceField>
        <BinderInput label="Bio" helper={`${bio.length}/500`} value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="A few real lines about you…" style={{ minHeight: theme.layout.multilineInputHeight, textAlignVertical: 'top' }} />
        <ChoiceField label="Interests"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{INTERESTS.map((item) => <BinderChip key={item} label={item} selected={interests.includes(item)} onPress={() => toggleInterest(item)} />)}</View></ChoiceField>
        <ChoiceField label="I want to meet"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={interestedIn.includes(item.value)} onPress={() => toggleInterestedIn(item.value)} />)}</View></ChoiceField>
        <ChoiceField label="Discovery range"><View style={{ flexDirection: 'row', gap: theme.spacing.x2 }}><CompactNumber label="Min age" value={minAge} setValue={setMinAge} /><CompactNumber label="Max age" value={maxAge} setValue={setMaxAge} /><CompactNumber label="Max km" value={distance} setValue={setDistance} /></View></ChoiceField>
        <ChoiceField label="Primary profile photo">
          <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Replace primary profile photo' : 'Choose primary profile photo'} onPress={() => void choosePhoto()}>
            {({ pressed }) => <BinderCard style={{ padding: 0, minHeight: theme.layout.onboardingPhotoHeight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>{photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: theme.layout.onboardingPhotoHeight }} resizeMode="cover" /> : <View style={{ alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="addPhoto" size={34} color={theme.accent.accent} /><BinderText variant="label" tone="accent">Choose photo</BinderText></View>}</BinderCard>}
          </Pressable>
          <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>Photos are optimized automatically before upload.</BinderText>
        </ChoiceField>
      </View>
      {error ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x5 }}>{error}</BinderText> : null}
      <BinderButton label="Enter Binder" loading={busy} onPress={() => void finish()} style={{ marginTop: theme.spacing.x6 }} />
    </KeyboardAwareScrollView>
  );
}

// Research-backed birthday input: three labeled digit fields with
// auto-advance — no wheels, no calendar. A live age chip springs in once the
// date is real, and 18+/plausibility feedback appears inline.
function BirthDateField({ onValidDate }: { onValidDate: (iso: string) => void }) {
  const { theme, reduceMotion } = useBinderTheme();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const chipScale = useRef(new Animated.Value(0)).current;
  const assessment = assessBirthDate(day, month, year);

  useEffect(() => {
    onValidDate(assessment.kind === 'ok' ? assessment.iso : '');
    const target = assessment.kind === 'ok' ? 1 : 0;
    if (reduceMotion) {
      chipScale.setValue(target);
      return;
    }
    Animated.spring(chipScale, { toValue: target, useNativeDriver: true, ...resolveSpring(false, 'celebratory') }).start();
  }, [assessment.kind, assessment.kind === 'ok' ? assessment.iso : '']);

  return (
    <View>
      <BinderText variant="label" tone="secondary" style={{ marginBottom: theme.spacing.x2 }}>Birth date · locked after onboarding</BinderText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.x2, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <BinderInput label="Day" value={day} keyboardType="number-pad" maxLength={2} placeholder="23" style={{ textAlign: 'center' }}
            onChangeText={(value) => { const next = sanitizeDigits(value, 2); setDay(next); if (next.length === 2) monthRef.current?.focus(); }} />
        </View>
        <View style={{ flex: 1 }}>
          <BinderInput inputRef={monthRef} label="Month" value={month} keyboardType="number-pad" maxLength={2} placeholder="04" style={{ textAlign: 'center' }}
            onChangeText={(value) => { const next = sanitizeDigits(value, 2); setMonth(next); if (next.length === 2) yearRef.current?.focus(); }} />
        </View>
        <View style={{ flex: 1.4 }}>
          <BinderInput inputRef={yearRef} label="Year" value={year} keyboardType="number-pad" maxLength={4} placeholder="1995" style={{ textAlign: 'center' }}
            onChangeText={(value) => setYear(sanitizeDigits(value, 4))} />
        </View>
      </View>
      <View style={{ minHeight: 34, marginTop: theme.spacing.x2, justifyContent: 'center' }}>
        {assessment.kind === 'ok' ? (
          <Animated.View style={{ alignSelf: 'flex-start', transform: [{ scale: chipScale }], backgroundColor: theme.accent.accent, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}>
            <BinderText variant="label" style={{ color: theme.accent.foreground }}>You are {assessment.age}</BinderText>
          </Animated.View>
        ) : assessment.kind === 'underage' ? (
          <BinderText variant="caption" tone="destructive">Binder is 18+ only.</BinderText>
        ) : assessment.kind === 'invalid' ? (
          <BinderText variant="caption" tone="destructive">That date does not exist — check day and month.</BinderText>
        ) : assessment.kind === 'implausible' ? (
          <BinderText variant="caption" tone="destructive">Please check the year.</BinderText>
        ) : (
          <BinderText variant="caption" tone="muted">Other people only ever see your age, never the date.</BinderText>
        )}
      </View>
    </View>
  );
}

function ChoiceField({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <View><BinderText variant="label" tone="secondary" style={{ marginBottom: theme.spacing.x2 }}>{label}</BinderText>{children}</View>;
}

function CompactNumber({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <View style={{ flex: 1 }}><BinderInput label={label} value={value} onChangeText={setValue} keyboardType="number-pad" style={{ textAlign: 'center' }} /></View>;
}
