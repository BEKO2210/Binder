import { useEffect, useRef, useState } from 'react';
import { Image, RefreshControl, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { PhotoPager } from '../components/PhotoPager';
import { announce } from '../lib/announce';
import { confirmDestructive } from '../lib/confirmDestructive';
import { DiscoveryPreferences } from '../components/DiscoveryPreferences';
import { MotionPressable as Pressable } from '../components/ui';
import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderInput, BinderScreenHeader, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { pickAndPrepareProfileImage, type PreparedImage } from '../lib/images';
import { addProfileImage, listMyProfileMedia, removeProfileMedia, reorderProfileMedia, setPrimaryProfileMedia, type GalleryMedia } from '../lib/media';
import { hasErrors, validateDiscovery, validateIdentity } from '../lib/onboardingFlow';
import { classifyError } from '../lib/reliability';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender } from '../lib/validation';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

export default function ProfileSettingsScreen({ userId, onClose, onSessionExpired }: { userId: string; onClose: () => void; onSessionExpired: () => void }) {
  const { theme, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('error');
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender>('nonbinary');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(45);
  const [distance, setDistance] = useState(50);
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [upload, setUpload] = useState<{ phase: 'preparing' | 'uploading' | 'error'; image: PreparedImage | null; error?: string } | null>(null);
  const uploadLockedRef = useRef(false);
  const [profileErrors, setProfileErrors] = useState<ReturnType<typeof validateIdentity>>({ firstName: undefined, gender: undefined });
  const [discoveryErrors, setDiscoveryErrors] = useState<ReturnType<typeof validateDiscovery>>({ audience: undefined, age: undefined, distance: undefined });

  useEffect(() => { void load(); }, [userId]);

  function errorMessage(error: unknown, fallback: string) {
    const failure = classifyError(error);
    if (failure.kind === 'permission-denied') onSessionExpired();
    return error instanceof Error ? error.message : fallback;
  }

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [profile, preferences, gallery] = await Promise.all([
        supabase.from('profiles').select('first_name,bio,gender,interests').eq('user_id', userId).single(),
        supabase.from('user_preferences').select('interested_in,min_age,max_age,max_distance_km').eq('user_id', userId).single(),
        listMyProfileMedia(),
      ]);
      if (profile.error) throw profile.error;
      if (preferences.error) throw preferences.error;
      setFirstName(profile.data.first_name);
      setBio(profile.data.bio);
      setGender(profile.data.gender as Gender);
      setInterests(profile.data.interests);
      setInterestedIn(preferences.data.interested_in as Gender[]);
      setMinAge(preferences.data.min_age);
      setMaxAge(preferences.data.max_age);
      setDistance(preferences.data.max_distance_km);
      setMedia(gallery);
    } catch (error) { setMessageKind('error'); setMessage(errorMessage(error, t('profileSettings.errors.load'))); }
    finally { setLoading(false); }
  }

  async function refreshGallery() {
    if (refreshing) return;
    setRefreshing(true);
    setMessage('');
    try {
      setMedia(await listMyProfileMedia());
    } catch (error) {
      setMessageKind('error');
      setMessage(errorMessage(error, t('profileSettings.errors.load')));
    } finally { setRefreshing(false); }
  }

  async function addPhoto() {
    if (media.length >= 6 || busy || uploadLockedRef.current) return;
    uploadLockedRef.current = true;
    setUpload({ phase: 'preparing', image: null });
    setMessage('');
    try {
      const image = await pickAndPrepareProfileImage();
      if (!image) { setUpload(null); return; }
      await uploadPhoto(image);
    } catch (error) {
      setUpload({ phase: 'error', image: null, error: errorMessage(error, t('profileSettings.errors.addPhoto')) });
    } finally { uploadLockedRef.current = false; }
  }

  async function uploadPhoto(image: PreparedImage) {
    try {
      await addProfileImage(userId, image, () => setUpload({ phase: 'uploading', image }));
      await haptic('selection');
      setMedia(await listMyProfileMedia());
      setUpload(null);
      setMessage(t('profileSettings.messages.photoAdded')); setMessageKind('success');
      announce(t('profileSettings.accessibility.photoUploaded'));
    } catch (error) {
      setUpload({ phase: 'error', image, error: errorMessage(error, t('profileSettings.errors.addPhoto')) });
    }
  }

  async function retryUpload() {
    if (uploadLockedRef.current || upload?.phase !== 'error' || !upload.image) return;
    uploadLockedRef.current = true;
    await uploadPhoto(upload.image);
    uploadLockedRef.current = false;
  }

  async function movePhoto(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= media.length || busy) return;
    const next = [...media];
    const currentItem = next[index];
    const targetItem = next[target];
    if (!currentItem || !targetItem) return;
    next[index] = targetItem;
    next[target] = currentItem;
    setBusy(true);
    setMessage('');
    try {
      await reorderProfileMedia(next.map((item) => item.id));
      await haptic('selection');
      setMedia(await listMyProfileMedia());
    } catch (error) { setMessageKind('error'); setMessage(errorMessage(error, t('profileSettings.errors.reorderPhotos'))); }
    finally { setBusy(false); }
  }

  async function makePrimary(item: GalleryMedia) {
    if (item.position === 0 || item.moderationStatus !== 'approved' || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await setPrimaryProfileMedia(item.id);
      await haptic('selection');
      setMedia(await listMyProfileMedia());
    } catch (error) { setMessageKind('error'); setMessage(errorMessage(error, t('profileSettings.errors.makePrimary'))); }
    finally { setBusy(false); }
  }

  function confirmRemove(item: GalleryMedia) {
    confirmDestructive({ title: t('profileSettings.alerts.removeTitle'), message: item.position === 0 ? t('profileSettings.alerts.removePrimaryMessage') : t('profileSettings.alerts.removeMessage'), cancelText: t('profileSettings.actions.cancel'), destructiveText: t('profileSettings.actions.remove'), onConfirm: () => void remove(item) });
  }

  async function remove(item: GalleryMedia) {
    setBusy(true);
    setMessage('');
    try {
      await removeProfileMedia(item.id);
      await haptic('destructive');
      setMedia(await listMyProfileMedia());
      announce(t('profileSettings.accessibility.photoRemoved'));
    } catch (error) { setMessageKind('error'); setMessage(errorMessage(error, t('profileSettings.errors.removePhoto'))); }
    finally { setBusy(false); }
  }

  async function save() {
    const identity = validateIdentity(firstName, gender); const discovery = validateDiscovery(interestedIn, minAge, maxAge, distance);
    setProfileErrors(identity); setDiscoveryErrors(discovery); if (hasErrors(identity) || hasErrors(discovery)) return;
    const min = minAge; const max = maxAge; const maxDistance = distance;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('update_my_profile', { p_first_name: firstName.trim(), p_gender: gender, p_bio: bio.trim(), p_interests: interests, p_interested_in: interestedIn, p_min_age: min, p_max_age: max, p_max_distance_km: maxDistance });
      if (error) throw error;
      await haptic('selection');
      setMessageKind('success'); setMessage(t('profileSettings.messages.saved'));
    } catch (error) { setMessageKind('error'); setMessage(errorMessage(error, t('profileSettings.errors.save'))); }
    finally { setBusy(false); }
  }

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (loading) return <ScreenState kind="loading" message={t('profileSettings.states.loading')} />;

  // The viewer is the gallery, not one photo: it opens on the photo that was
  // tapped and swipes through the rest, which is what every photo surface in
  // every app this one competes with does.
  if (viewerIndex !== null && media.length > 0) {
    const safeIndex = Math.min(Math.max(viewerIndex, 0), media.length - 1);
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <BinderScreenHeader
          title={media.length > 1 ? t('profileSettings.gallery.photoOf', { current: safeIndex + 1, total: media.length }) : t('profileSettings.gallery.photo')}
          leading={{ icon: 'close', accessibilityLabel: t('profileSettings.accessibility.closeFullPhoto'), onPress: () => setViewerIndex(null) }}
        />
        <PhotoPager
          photos={media.map((item) => item.signedUrl)}
          name={t('profileSettings.gallery.name')}
          height="100%"
          fit="contain"
          swipeable
          initialIndex={safeIndex}
          onPageChange={setViewerIndex}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('profileSettings.header.title')} leading={{ icon: 'back', accessibilityLabel: t('profileSettings.accessibility.backToProfile'), onPress: onClose }} />
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshGallery()} tintColor={theme.accent.onSurface} colors={[theme.accent.onSurface]} progressBackgroundColor={theme.colors.surfaceElevated} />}>
      <SectionHeader title={t('profileSettings.header.sectionTitle')} copy={t('profileSettings.header.sectionCopy')} />

      <View style={{ marginTop: theme.spacing.x8 }}>
        <BinderText variant="micro" tone="muted">{t('profileSettings.photos.eyebrow', { count: media.length })}</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('profileSettings.photos.orderCopy')}</BinderText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x3, marginTop: theme.spacing.x3 }}>
          {media.map((item, index) => <PhotoTile key={item.id} item={item} index={index} total={media.length} busy={busy} onLeft={() => void movePhoto(index, -1)} onRight={() => void movePhoto(index, 1)} onPrimary={() => void makePrimary(item)} onRemove={() => confirmRemove(item)} onView={() => setViewerIndex(index)} />)}
          {upload ? <UploadPhotoTile upload={upload} onRetry={() => void retryUpload()} /> : media.length < 6 ? <AddPhotoTile disabled={busy} onPress={() => void addPhoto()} /> : null}
        </View>
        {message ? <BinderText accessibilityLiveRegion={messageKind === 'success' ? 'polite' : 'assertive'} variant="caption" tone={messageKind === 'success' ? 'accent' : 'destructive'} style={{ marginTop: theme.spacing.x3 }}>{message}</BinderText> : null}
      </View>

      <BinderCard style={{ gap: theme.spacing.x5, marginTop: theme.spacing.x8 }}>
        <View><BinderText variant="micro" tone="muted">{t('profileSettings.details.eyebrow')}</BinderText><BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('profileSettings.details.copy')}</BinderText></View>
        <BinderInput label={t('profileSettings.fields.firstName')} error={profileErrors.firstName} value={firstName} onChangeText={(value) => { setFirstName(value); if (profileErrors.firstName) setProfileErrors(validateIdentity(value, gender)); }} maxLength={40} />
        <BinderInput label={t('profileSettings.fields.bio')} helper={t('profileSettings.fields.bioCount', { count: bio.length })} value={bio} onChangeText={setBio} maxLength={500} multiline style={{ minHeight: theme.layout.multilineInputHeight, textAlignVertical: 'top' }} />
        <Choice label={t('profileSettings.fields.gender')} error={profileErrors.gender}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={gender === item.value} onPress={() => { setGender(item.value); setProfileErrors(validateIdentity(firstName, item.value)); }} />)}</View></Choice>
        <Choice label={t('profileSettings.fields.interests')}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{INTERESTS.map((item) => <BinderChip key={item} label={item} selected={interests.includes(item)} onPress={() => setInterests((current) => current.includes(item) ? current.filter((value) => value !== item) : current.length < 12 ? [...current, item] : current)} />)}</View></Choice>
      </BinderCard>
      <BinderCard style={{ marginTop: theme.spacing.x5 }}><View><BinderText variant="micro" tone="muted">{t('profileSettings.discovery.eyebrow')}</BinderText><BinderText variant="title" style={{ marginTop: theme.spacing.x2 }}>{t('profileSettings.discovery.title')}</BinderText><BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2, marginBottom: theme.spacing.x6 }}>{t('profileSettings.discovery.copy')}</BinderText></View>
          <DiscoveryPreferences interestedIn={interestedIn} minAge={minAge} maxAge={maxAge} distance={distance} errors={discoveryErrors} onChange={(next) => { setInterestedIn(next.interestedIn); setMinAge(next.minAge); setMaxAge(next.maxAge); setDistance(next.distance); setDiscoveryErrors(validateDiscovery(next.interestedIn, next.minAge, next.maxAge, next.distance)); }} />
      </BinderCard>
      <BinderButton label={t('profileSettings.actions.saveProfile')} loading={busy} onPress={() => void save()} style={{ marginTop: theme.spacing.x6 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

function UploadPhotoTile({ upload, onRetry }: { upload: { phase: 'preparing' | 'uploading' | 'error'; error?: string }; onRetry: () => void }) {
  const { theme, t } = useBinderTheme();
  return <BinderCard style={{ width: '47%', minHeight: theme.layout.photoAddTileHeight, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x3 }}><BinderIcon name={upload.phase === 'error' ? 'retry' : 'addPhoto'} color={upload.phase === 'error' ? theme.semantic.destructive : theme.accent.onSurface} /><BinderText variant="label" tone={upload.phase === 'error' ? 'destructive' : 'accent'} align="center">{upload.phase === 'preparing' ? t('profileSettings.photos.preparing') : upload.phase === 'uploading' ? t('profileSettings.photos.uploading') : t('profileSettings.photos.uploadFailed')}</BinderText>{upload.phase === 'error' ? <><BinderText variant="caption" tone="destructive" align="center">{upload.error ?? t('profileSettings.errors.addPhoto')}</BinderText><BinderButton label={t('profileSettings.actions.retryUpload')} variant="secondary" onPress={onRetry} /></> : null}</BinderCard>;
}

function Choice({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <View><BinderText variant="label" tone={error ? 'destructive' : 'secondary'} style={{ marginBottom: theme.spacing.x2 }}>{label}</BinderText>{children}{error ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{error}</BinderText> : null}</View>;
}

function AddPhotoTile({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { theme, t } = useBinderTheme();
  // The tile paints its own pressed surface; the shared one would stack a
  // second tint on top of it.
  return <Pressable pressedSurface={false} accessibilityRole="button" accessibilityLabel={t('profileSettings.accessibility.addPhoto')} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: '47%', minHeight: theme.layout.photoAddTileHeight, borderRadius: theme.radii.card, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.borderStrong, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x2, opacity: disabled ? theme.feedback.disabledOpacity : 1 })}><BinderIcon name="addPhoto" size={30} color={theme.accent.onSurface} /><BinderText variant="label" tone="accent">{t('profileSettings.actions.addPhoto')}</BinderText><BinderText variant="caption" tone="muted" align="center">{t('profileSettings.photos.optimized')}</BinderText></Pressable>;
}

function PhotoTile({ item, index, total, busy, onLeft, onRight, onPrimary, onRemove, onView }: { item: GalleryMedia; index: number; total: number; busy: boolean; onLeft: () => void; onRight: () => void; onPrimary: () => void; onRemove: () => void; onView: () => void }) {
  const { theme, t } = useBinderTheme();
  const statusTone = item.moderationStatus === 'approved' ? theme.semantic.success : item.moderationStatus === 'pending' ? theme.semantic.warning : theme.semantic.destructive;
  const statusCopy = item.moderationStatus === 'approved' ? t('profileSettings.photos.status.approved') : item.moderationStatus === 'pending' ? t('profileSettings.photos.status.pending') : item.moderationStatus === 'rejected' ? t('profileSettings.photos.status.rejected') : t('profileSettings.photos.status.removed');
  return (
    <BinderCard style={{ width: '47%', padding: 0, overflow: 'hidden' }}>
      <Pressable pressedSurface={false} pressScale={false} accessibilityRole="imagebutton" accessibilityLabel={t('profileSettings.accessibility.viewPhoto', { number: index + 1 })} onPress={onView}>
        <Image source={{ uri: item.signedUrl }} resizeMethod="resize" style={{ width: '100%', height: theme.layout.photoTileHeight }} resizeMode="cover" />
      </Pressable>
      <View style={{ padding: theme.spacing.x3, gap: theme.spacing.x2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}><View style={{ width: theme.layout.statusDot, height: theme.layout.statusDot, borderRadius: theme.radii.pill, backgroundColor: statusTone }} /><BinderText variant="caption" style={{ color: statusTone }}>{statusCopy}</BinderText></View>
        {item.position === 0 ? <BinderText variant="micro" tone="accent">{t('profileSettings.photos.primary')}</BinderText> : item.moderationStatus === 'approved' ? <BinderButton label={t('profileSettings.actions.makePrimary')} variant="ghost" disabled={busy} onPress={onPrimary} /> : null}
        <BinderText variant="caption" tone="muted">{t('profileSettings.photos.dimensions', { size: Math.max(1, Math.round(item.byteSize / 1024)), width: item.width, height: item.height })}</BinderText>
        {item.moderationReason ? <BinderText variant="caption" tone="destructive">{item.moderationReason}</BinderText> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <BinderIconButton name="back" size={19} accessibilityLabel={t('profileSettings.accessibility.moveLeft', { number: index + 1 })} disabled={busy || index === 0} onPress={onLeft} />
          <BinderIconButton name="delete" size={19} accessibilityLabel={t('profileSettings.accessibility.removePhoto', { number: index + 1 })} destructive disabled={busy} onPress={onRemove} />
          <BinderIconButton name="chevronRight" size={19} accessibilityLabel={t('profileSettings.accessibility.moveRight', { number: index + 1 })} disabled={busy || index === total - 1} onPress={onRight} />
        </View>
      </View>
    </BinderCard>
  );
}
