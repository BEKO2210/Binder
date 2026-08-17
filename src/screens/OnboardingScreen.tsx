import { useEffect, useRef, useState } from 'react';
import { Animated, Image, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { DiscoveryPreferences, discoveryDefaults } from '../components/DiscoveryPreferences';
import { MotionPressable as Pressable } from '../components/ui';
import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderInput, BinderText } from '../components/ui';
import { assessBirthDate, sanitizeDigits } from '../lib/birthdate';
import { pickAndPrepareProfileImage, type PreparedImage } from '../lib/images';
import { addProfileImage } from '../lib/media';
import { resolveSpring } from '../lib/motionPolicy';
import { hasErrors, onboardingPosition, ONBOARDING_STEPS, type OnboardingStep, validateDiscovery, validateIdentity } from '../lib/onboardingFlow';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender } from '../lib/validation';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { userId: string; onComplete: () => void };
const STEP_COPY: Record<OnboardingStep, { eyebrow: string; title: string; copy: string; next: string }> = {
  eligibility: { eyebrow: 'ELIGIBILITY · 18+', title: 'First, confirm your age.', copy: 'Binder is only for adults. Your birth date is checked once, locked after onboarding, and never shown to other people.', next: 'Next: your name and gender' },
  identity: { eyebrow: 'THE BASICS', title: 'How should people know you?', copy: 'Use the first name you go by. These details appear on your profile.', next: 'Next: your bio and interests' },
  profile: { eyebrow: 'ABOUT YOU', title: 'Give people a reason to say hello.', copy: 'A short, specific bio and a few interests make starting a real conversation easier.', next: 'Next: who you want to meet' },
  discovery: { eyebrow: 'DISCOVERY', title: 'Choose who feels relevant.', copy: 'These preferences shape Discovery and can be changed later.', next: 'Next: add your first photo' },
  photo: { eyebrow: 'YOUR PHOTO', title: 'Put a face to the profile.', copy: 'Your first photo is what people see first. It is optimized, then reviewed for safety before appearing.', next: 'Finish and enter Binder' },
};

export default function OnboardingScreen({ userId, onComplete }: Props) {
  const { theme } = useBinderTheme();
  const [step, setStep] = useState<OnboardingStep>('eligibility');
  const [firstName, setFirstName] = useState(''); const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | null>(null); const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]); const [preferences, setPreferences] = useState(discoveryDefaults);
  const [photo, setPhoto] = useState<PreparedImage | null>(null); const [uploadedPhotoUri, setUploadedPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [submitError, setSubmitError] = useState('');
  const [identityErrors, setIdentityErrors] = useState<ReturnType<typeof validateIdentity>>({ firstName: undefined, gender: undefined });
  const [discoveryErrors, setDiscoveryErrors] = useState<ReturnType<typeof validateDiscovery>>({ audience: undefined, age: undefined, distance: undefined });
  const position = onboardingPosition(step); const copy = STEP_COPY[step];

  function goBack() { if (position.index > 0) setStep(ONBOARDING_STEPS[position.index - 1] ?? 'eligibility'); }
  function advance() {
    setSubmitError('');
    if (step === 'eligibility' && !birthDate) return;
    if (step === 'identity') { const errors = validateIdentity(firstName, gender); setIdentityErrors(errors); if (hasErrors(errors)) return; }
    if (step === 'discovery') { const errors = validateDiscovery(preferences.interestedIn, preferences.minAge, preferences.maxAge, preferences.distance); setDiscoveryErrors(errors); if (hasErrors(errors)) return; }
    const next = ONBOARDING_STEPS[position.index + 1]; if (next) setStep(next);
  }
  async function choosePhoto() { try { setSubmitError(''); const next = await pickAndPrepareProfileImage(); if (next) setPhoto(next); } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Could not prepare photo.'); } }
  async function finish() {
    if (!photo) return setSubmitError('Add a profile photo to continue.');
    if (!gender) return;
    setBusy(true); setSubmitError('');
    try {
      const { error } = await supabase.rpc('complete_my_onboarding', { p_first_name: firstName.trim(), p_birth_date: birthDate, p_gender: gender, p_bio: bio.trim(), p_interests: interests, p_interested_in: preferences.interestedIn, p_min_age: preferences.minAge, p_max_age: preferences.maxAge, p_max_distance_km: preferences.distance });
      if (error) throw error;
      if (uploadedPhotoUri !== photo.uri) { await addProfileImage(userId, photo); setUploadedPhotoUri(photo.uri); }
      const { error: finalizeError } = await supabase.rpc('finalize_my_onboarding'); if (finalizeError) throw finalizeError;
      onComplete();
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Onboarding could not be completed.'); } finally { setBusy(false); }
  }

  return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
    <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x3, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><BinderText variant="micro" tone="accent">STEP {position.number} OF {position.total}</BinderText><BinderText variant="caption" tone="muted">{copy.next}</BinderText></View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: position.total, now: position.number }} style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>{ONBOARDING_STEPS.map((item, index) => <View key={item} style={{ flex: 1, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: index <= position.index ? theme.accent.accent : theme.colors.borderStrong }} />)}</View>
    </View>
    <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x8, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled" bottomOffset={theme.spacing.x6}>
      <BinderText variant="micro" tone="muted">{copy.eyebrow}</BinderText><BinderText variant="heading" style={{ marginTop: theme.spacing.x2 }}>{copy.title}</BinderText><BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>{copy.copy}</BinderText>
      <View style={{ marginTop: theme.spacing.x8 }}>{step === 'eligibility' ? <BirthDateField onValidDate={setBirthDate} /> : null}
        {step === 'identity' ? <View style={{ gap: theme.spacing.x6 }}><BinderInput label="First name" value={firstName} error={identityErrors.firstName} onChangeText={(value) => { setFirstName(value); if (identityErrors.firstName) setIdentityErrors(validateIdentity(value, gender)); }} maxLength={40} autoCapitalize="words" returnKeyType="done" /><Choice label="I am" error={identityErrors.gender}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={gender === item.value} onPress={() => { setGender(item.value); setIdentityErrors(validateIdentity(firstName, item.value)); }} />)}</View></Choice></View> : null}
        {step === 'profile' ? <View style={{ gap: theme.spacing.x6 }}><BinderInput label="Bio · optional" helper={`${bio.length}/500 · You can change this later`} value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="For example: Sunday hikes, live music, and excellent coffee." style={{ minHeight: theme.layout.multilineInputHeight, textAlignVertical: 'top' }} /><Choice label={`Interests · choose up to 12 (${interests.length})`}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{INTERESTS.map((item) => <BinderChip key={item} label={item} selected={interests.includes(item)} onPress={() => setInterests((current) => current.includes(item) ? current.filter((value) => value !== item) : current.length < 12 ? [...current, item] : current)} />)}</View></Choice></View> : null}
        {step === 'discovery' ? <DiscoveryPreferences {...preferences} errors={discoveryErrors} onChange={(next) => { setPreferences(next); setDiscoveryErrors(validateDiscovery(next.interestedIn, next.minAge, next.maxAge, next.distance)); }} /> : null}
        {step === 'photo' ? <View><Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Replace primary profile photo' : 'Choose primary profile photo'} onPress={() => void choosePhoto()}>{({ pressed }) => <BinderCard style={{ padding: 0, minHeight: theme.layout.onboardingPhotoHeight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>{photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: theme.layout.onboardingPhotoHeight }} resizeMode="cover" /> : <View style={{ alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="addPhoto" size={34} color={theme.accent.onSurface} /><BinderText variant="label" tone="accent">Choose photo</BinderText><BinderText variant="caption" tone="muted">Tap to open your photo library</BinderText></View>}</BinderCard>}</Pressable>{submitError ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x3 }}>{submitError}</BinderText> : null}</View> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.x3, marginTop: theme.spacing.x8 }}>{position.index > 0 ? <BinderButton label="Back" variant="secondary" disabled={busy} onPress={goBack} style={{ flex: 1 }} /> : null}<BinderButton label={step === 'photo' ? 'Finish profile' : 'Continue'} loading={busy} disabled={step === 'eligibility' && !birthDate} onPress={step === 'photo' ? () => void finish() : advance} style={{ flex: 2 }} /></View>
    </KeyboardAwareScrollView>
  </View>;
}

function BirthDateField({ onValidDate }: { onValidDate: (iso: string) => void }) {
  const { theme, reduceMotion } = useBinderTheme(); const [day, setDay] = useState(''); const [month, setMonth] = useState(''); const [year, setYear] = useState('');
  const monthRef = useRef<TextInput>(null); const yearRef = useRef<TextInput>(null); const chipScale = useRef(new Animated.Value(0)).current; const assessment = assessBirthDate(day, month, year);
  useEffect(() => { onValidDate(assessment.kind === 'ok' ? assessment.iso : ''); const target = assessment.kind === 'ok' ? 1 : 0; if (reduceMotion) chipScale.setValue(target); else Animated.spring(chipScale, { toValue: target, useNativeDriver: true, ...resolveSpring(false, 'celebratory') }).start(); }, [assessment.kind, assessment.kind === 'ok' ? assessment.iso : '', reduceMotion]);
  return <View><BinderText variant="title">You must be 18 or older</BinderText><BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2, marginBottom: theme.spacing.x5 }}>Enter your real date of birth. If you are under 18, you cannot create a Binder profile.</BinderText><View style={{ flexDirection: 'row', gap: theme.spacing.x2, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><BinderInput label="Day" value={day} keyboardType="number-pad" maxLength={2} placeholder="23" style={{ textAlign: 'center' }} onChangeText={(value) => { const next = sanitizeDigits(value, 2); setDay(next); if (next.length === 2) monthRef.current?.focus(); }} /></View><View style={{ flex: 1 }}><BinderInput inputRef={monthRef} label="Month" value={month} keyboardType="number-pad" maxLength={2} placeholder="04" style={{ textAlign: 'center' }} onChangeText={(value) => { const next = sanitizeDigits(value, 2); setMonth(next); if (next.length === 2) yearRef.current?.focus(); }} /></View><View style={{ flex: 1.4 }}><BinderInput inputRef={yearRef} label="Year" value={year} keyboardType="number-pad" maxLength={4} placeholder="1995" style={{ textAlign: 'center' }} onChangeText={(value) => setYear(sanitizeDigits(value, 4))} /></View></View><View style={{ minHeight: theme.layout.minimumTouchTarget, marginTop: theme.spacing.x2, justifyContent: 'center' }}>{assessment.kind === 'ok' ? <Animated.View style={{ alignSelf: 'flex-start', transform: [{ scale: chipScale }], backgroundColor: theme.accent.accent, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2 }}><BinderText variant="label" style={{ color: theme.accent.foreground }}>Eligible · age {assessment.age}</BinderText></Animated.View> : assessment.kind === 'underage' ? <BinderText variant="caption" tone="destructive">You must be 18 or older to use Binder.</BinderText> : assessment.kind === 'invalid' ? <BinderText variant="caption" tone="destructive">That date does not exist. Check the day and month.</BinderText> : assessment.kind === 'implausible' ? <BinderText variant="caption" tone="destructive">Check the year you entered.</BinderText> : <BinderText variant="caption" tone="muted">Your exact birth date stays private.</BinderText>}</View></View>;
}
function Choice({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { const { theme } = useBinderTheme(); return <View><BinderText variant="label" tone={error ? 'destructive' : 'secondary'} style={{ marginBottom: theme.spacing.x2 }}>{label}</BinderText>{children}{error ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{error}</BinderText> : null}</View>; }
