import { useEffect, useRef, useState } from 'react';
import { Animated as NativeAnimated, Image, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';

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
  eligibility: { eyebrow: 'onboarding.steps.eligibility.eyebrow', title: 'onboarding.steps.eligibility.title', copy: 'onboarding.steps.eligibility.copy', next: 'onboarding.steps.eligibility.next' },
  identity: { eyebrow: 'onboarding.steps.identity.eyebrow', title: 'onboarding.steps.identity.title', copy: 'onboarding.steps.identity.copy', next: 'onboarding.steps.identity.next' },
  profile: { eyebrow: 'onboarding.steps.profile.eyebrow', title: 'onboarding.steps.profile.title', copy: 'onboarding.steps.profile.copy', next: 'onboarding.steps.profile.next' },
  discovery: { eyebrow: 'onboarding.steps.discovery.eyebrow', title: 'onboarding.steps.discovery.title', copy: 'onboarding.steps.discovery.copy', next: 'onboarding.steps.discovery.next' },
  photo: { eyebrow: 'onboarding.steps.photo.eyebrow', title: 'onboarding.steps.photo.title', copy: 'onboarding.steps.photo.copy', next: 'onboarding.steps.photo.next' },
};

export default function OnboardingScreen({ userId, onComplete }: Props) {
  const { theme, reduceMotion, t } = useBinderTheme();
  const [step, setStep] = useState<OnboardingStep>('eligibility');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [photoBusy, setPhotoBusy] = useState(false);
  const inFlight = useRef(false);
  const [firstName, setFirstName] = useState(''); const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | null>(null); const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]); const [preferences, setPreferences] = useState(discoveryDefaults);
  const [photo, setPhoto] = useState<PreparedImage | null>(null); const [uploadedPhotoUri, setUploadedPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [submitError, setSubmitError] = useState('');
  const [identityErrors, setIdentityErrors] = useState<ReturnType<typeof validateIdentity>>({ firstName: undefined, gender: undefined });
  const [discoveryErrors, setDiscoveryErrors] = useState<ReturnType<typeof validateDiscovery>>({ audience: undefined, age: undefined, distance: undefined });
  const position = onboardingPosition(step); const copy = STEP_COPY[step];

  function goBack() { if (position.index > 0) { setDirection('backward'); setStep(ONBOARDING_STEPS[position.index - 1] ?? 'eligibility'); } }
  function advance() {
    setSubmitError('');
    if (step === 'eligibility' && !birthDate) return;
    if (step === 'identity') { const errors = validateIdentity(firstName, gender); setIdentityErrors(errors); if (hasErrors(errors)) return; }
    if (step === 'discovery') { const errors = validateDiscovery(preferences.interestedIn, preferences.minAge, preferences.maxAge, preferences.distance); setDiscoveryErrors(errors); if (hasErrors(errors)) return; }
    const next = ONBOARDING_STEPS[position.index + 1]; if (next) { setDirection('forward'); setStep(next); }
  }
  async function choosePhoto() {
    if (photoBusy) return;
    setPhotoBusy(true);
    setSubmitError('');
    try {
      const next = await pickAndPrepareProfileImage();
      if (next) setPhoto(next);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('onboarding.errors.preparePhoto'));
    } finally { setPhotoBusy(false); }
  }
  async function finish() {
    if (!photo) return setSubmitError(t('onboarding.errors.photoRequired'));
    if (!gender) return;
    // Finishing runs three server calls; a double tap must not start them twice.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setSubmitError('');
    try {
      const { error } = await supabase.rpc('complete_my_onboarding', { p_first_name: firstName.trim(), p_birth_date: birthDate, p_gender: gender, p_bio: bio.trim(), p_interests: interests, p_interested_in: preferences.interestedIn, p_min_age: preferences.minAge, p_max_age: preferences.maxAge, p_max_distance_km: preferences.distance });
      if (error) throw error;
      if (uploadedPhotoUri !== photo.uri) { await addProfileImage(userId, photo); setUploadedPhotoUri(photo.uri); }
      const { error: finalizeError } = await supabase.rpc('finalize_my_onboarding'); if (finalizeError) throw finalizeError;
      onComplete();
    } catch (error) { setSubmitError(error instanceof Error ? error.message : t('onboarding.errors.complete')); } finally { inFlight.current = false; setBusy(false); }
  }

  return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
    <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x3, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><BinderText variant="micro" tone="accent">{t('onboarding.progress', { number: position.number, total: position.total })}</BinderText><BinderText variant="caption" tone="muted">{t(copy.next)}</BinderText></View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: position.total, now: position.number }} style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>{ONBOARDING_STEPS.map((item, index) => <View key={item} style={{ flex: 1, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: index <= position.index ? theme.accent.accent : theme.colors.borderStrong }} />)}</View>
    </View>
    <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x8, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled" bottomOffset={theme.spacing.x6}>
      <Animated.View key={step} entering={reduceMotion ? undefined : (direction === 'forward' ? SlideInRight : SlideInLeft).duration(theme.motion.deliberate)} exiting={reduceMotion ? undefined : (direction === 'forward' ? SlideOutLeft : SlideOutRight).duration(theme.motion.deliberate)}>
      <BinderText variant="micro" tone="muted">{t(copy.eyebrow)}</BinderText><BinderText variant="heading" style={{ marginTop: theme.spacing.x2 }}>{t(copy.title)}</BinderText><BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>{t(copy.copy)}</BinderText>
      <View style={{ marginTop: theme.spacing.x8 }}>{step === 'eligibility' ? <BirthDateField onValidDate={setBirthDate} /> : null}
        {step === 'identity' ? <View style={{ gap: theme.spacing.x6 }}><BinderInput label={t('onboarding.identity.firstName')} value={firstName} error={identityErrors.firstName} onChangeText={(value) => { setFirstName(value); if (identityErrors.firstName) setIdentityErrors(validateIdentity(value, gender)); }} maxLength={40} autoCapitalize="words" returnKeyType="done" /><Choice label={t('onboarding.identity.gender')} error={identityErrors.gender}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={gender === item.value} onPress={() => { setGender(item.value); setIdentityErrors(validateIdentity(firstName, item.value)); }} />)}</View></Choice></View> : null}
        {step === 'profile' ? <View style={{ gap: theme.spacing.x6 }}><BinderInput label={t('onboarding.profile.bioLabel')} helper={t('onboarding.profile.bioHelper', { count: bio.length })} value={bio} onChangeText={setBio} maxLength={500} multiline placeholder={t('onboarding.profile.bioPlaceholder')} style={{ minHeight: theme.layout.multilineInputHeight, textAlignVertical: 'top' }} /><Choice label={t('onboarding.profile.interests', { count: interests.length })}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{INTERESTS.map((item) => <BinderChip key={item} label={item} selected={interests.includes(item)} onPress={() => setInterests((current) => current.includes(item) ? current.filter((value) => value !== item) : current.length < 12 ? [...current, item] : current)} />)}</View></Choice></View> : null}
        {step === 'discovery' ? <DiscoveryPreferences {...preferences} errors={discoveryErrors} onChange={(next) => { setPreferences(next); setDiscoveryErrors(validateDiscovery(next.interestedIn, next.minAge, next.maxAge, next.distance)); }} /> : null}
        {step === 'photo' ? <View><Pressable accessibilityRole="button" accessibilityState={{ busy: photoBusy, disabled: photoBusy }} disabled={photoBusy} accessibilityLabel={t(photo ? 'onboarding.photo.replaceAccessibility' : 'onboarding.photo.chooseAccessibility')} onPress={() => void choosePhoto()}>{({ pressed }) => <BinderCard style={{ padding: 0, minHeight: theme.layout.onboardingPhotoHeight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>{photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: theme.layout.onboardingPhotoHeight }} resizeMode="cover" /> : <View style={{ alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="addPhoto" size={34} color={theme.accent.onSurface} /><BinderText variant="label" tone="accent">{t(photoBusy ? 'onboarding.photo.preparing' : 'onboarding.photo.choose')}</BinderText><BinderText variant="caption" tone="muted">{t(photoBusy ? 'onboarding.photo.resizing' : 'onboarding.photo.openLibrary')}</BinderText></View>}</BinderCard>}</Pressable>{submitError ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x3 }}>{submitError}</BinderText> : null}</View> : null}
      </View></Animated.View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.x3, marginTop: theme.spacing.x8 }}>{position.index > 0 ? <BinderButton label={t('onboarding.actions.back')} variant="secondary" disabled={busy || photoBusy} onPress={goBack} style={{ flex: 1 }} /> : null}<BinderButton label={t(step === 'photo' ? 'onboarding.actions.finish' : 'onboarding.actions.continue')} loading={busy} disabled={photoBusy || (step === 'eligibility' && !birthDate)} onPress={step === 'photo' ? () => void finish() : advance} style={{ flex: 2 }} /></View>
    </KeyboardAwareScrollView>
  </View>;
}

function BirthDateField({ onValidDate }: { onValidDate: (iso: string) => void }) {
  const { theme, reduceMotion, t } = useBinderTheme(); const [day, setDay] = useState(''); const [month, setMonth] = useState(''); const [year, setYear] = useState('');
  const monthRef = useRef<TextInput>(null); const yearRef = useRef<TextInput>(null); const chipScale = useRef(new NativeAnimated.Value(0)).current; const assessment = assessBirthDate(day, month, year);
  useEffect(() => { onValidDate(assessment.kind === 'ok' ? assessment.iso : ''); const target = assessment.kind === 'ok' ? 1 : 0; if (reduceMotion) chipScale.setValue(target); else NativeAnimated.spring(chipScale, { toValue: target, useNativeDriver: true, ...resolveSpring(false, 'celebratory') }).start(); }, [assessment.kind, assessment.kind === 'ok' ? assessment.iso : '', reduceMotion]);
  return <View><BinderText variant="title">{t('onboarding.birthDate.title')}</BinderText><BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2, marginBottom: theme.spacing.x5 }}>{t('onboarding.birthDate.copy')}</BinderText><View style={{ flexDirection: 'row', gap: theme.spacing.x2, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><BinderInput label={t('onboarding.birthDate.day')} value={day} keyboardType="number-pad" maxLength={2} placeholder="23" style={{ textAlign: 'center' }} onChangeText={(value) => { const next = sanitizeDigits(value, 2); setDay(next); if (next.length === 2) monthRef.current?.focus(); }} /></View><View style={{ flex: 1 }}><BinderInput inputRef={monthRef} label={t('onboarding.birthDate.month')} value={month} keyboardType="number-pad" maxLength={2} placeholder="04" style={{ textAlign: 'center' }} onChangeText={(value) => { const next = sanitizeDigits(value, 2); setMonth(next); if (next.length === 2) yearRef.current?.focus(); }} /></View><View style={{ flex: 1.4 }}><BinderInput inputRef={yearRef} label={t('onboarding.birthDate.year')} value={year} keyboardType="number-pad" maxLength={4} placeholder="1995" style={{ textAlign: 'center' }} onChangeText={(value) => setYear(sanitizeDigits(value, 4))} /></View></View><View style={{ minHeight: theme.layout.minimumTouchTarget, marginTop: theme.spacing.x2, justifyContent: 'center' }}>{assessment.kind === 'ok' ? <NativeAnimated.View style={{ alignSelf: 'flex-start', transform: [{ scale: chipScale }], backgroundColor: theme.accent.accent, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2 }}><BinderText variant="label" style={{ color: theme.accent.foreground }}>{t('onboarding.birthDate.eligible', { age: assessment.age })}</BinderText></NativeAnimated.View> : assessment.kind === 'underage' ? <BinderText variant="caption" tone="destructive">{t('onboarding.birthDate.underage')}</BinderText> : assessment.kind === 'invalid' ? <BinderText variant="caption" tone="destructive">{t('onboarding.birthDate.invalid')}</BinderText> : assessment.kind === 'implausible' ? <BinderText variant="caption" tone="destructive">{t('onboarding.birthDate.implausible')}</BinderText> : <BinderText variant="caption" tone="muted">{t('onboarding.birthDate.private')}</BinderText>}</View></View>;
}
function Choice({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { const { theme } = useBinderTheme(); return <View><BinderText variant="label" tone={error ? 'destructive' : 'secondary'} style={{ marginBottom: theme.spacing.x2 }}>{label}</BinderText>{children}{error ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{error}</BinderText> : null}</View>; }
