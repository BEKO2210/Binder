import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';

import { RangeSlider, SingleSlider } from '../components/RangeSlider';
import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderInput, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { pickAndPrepareProfileImage } from '../lib/images';
import { addProfileImage, listMyProfileMedia, removeProfileMedia, reorderProfileMedia, setPrimaryProfileMedia, type GalleryMedia } from '../lib/media';
import { supabase } from '../lib/supabase';
import { GENDERS, INTERESTS, type Gender } from '../lib/validation';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

export default function ProfileSettingsScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { theme } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('error');
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender>('nonbinary');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('45');
  const [distance, setDistance] = useState('50');
  const [media, setMedia] = useState<GalleryMedia[]>([]);

  useEffect(() => { void load(); }, [userId]);

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
      setMinAge(String(preferences.data.min_age));
      setMaxAge(String(preferences.data.max_age));
      setDistance(String(preferences.data.max_distance_km));
      setMedia(gallery);
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not load profile settings.'); }
    finally { setLoading(false); }
  }

  async function addPhoto() {
    if (media.length >= 6 || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const image = await pickAndPrepareProfileImage();
      if (!image) return;
      await addProfileImage(userId, image);
      await haptic('selection');
      setMedia(await listMyProfileMedia());
      setMessage('Photo optimized, uploaded and sent for safety review.'); setMessageKind('success');
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not add photo.'); }
    finally { setBusy(false); }
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
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not reorder photos.'); }
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
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not make this photo primary.'); }
    finally { setBusy(false); }
  }

  function confirmRemove(item: GalleryMedia) {
    Alert.alert('Remove profile photo?', item.position === 0 ? 'Binder will only remove the primary photo if another approved photo can replace it.' : 'This photo will be removed from your profile and storage.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove(item) },
    ]);
  }

  async function remove(item: GalleryMedia) {
    setBusy(true);
    setMessage('');
    try {
      await removeProfileMedia(item.id);
      await haptic('destructive');
      setMedia(await listMyProfileMedia());
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not remove photo.'); }
    finally { setBusy(false); }
  }

  async function save() {
    const min = Number(minAge); const max = Number(maxAge); const maxDistance = Number(distance);
    if (!firstName.trim() || interestedIn.length === 0 || !Number.isInteger(min) || !Number.isInteger(max) || min < 18 || max > 100 || min > max || !Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 500) {
      setMessage('Check your profile and discovery settings.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('update_my_profile', { p_first_name: firstName.trim(), p_gender: gender, p_bio: bio.trim(), p_interests: interests, p_interested_in: interestedIn, p_min_age: min, p_max_age: max, p_max_distance_km: maxDistance });
      if (error) throw error;
      await haptic('selection');
      setMessage('Profile settings saved.');
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not save profile settings.'); }
    finally { setBusy(false); }
  }

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  if (loading) return <ScreenState kind="loading" message="Loading profile settings…" />;

  if (viewerUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <View style={{ paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2 }}>
          <BinderIconButton name="close" accessibilityLabel="Close full photo" onPress={() => setViewerUrl(null)} />
        </View>
        <Image source={{ uri: viewerUrl }} style={{ flex: 1 }} resizeMode="contain" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x16 }} keyboardShouldPersistTaps="handled">
      <BinderIconButton name="back" accessibilityLabel="Back to profile" onPress={onClose} />
      <SectionHeader eyebrow="PROFILE SETTINGS" title="Profile, discovery and photos." copy="Your birth date stays locked. Photos are optimized before upload and reviewed independently." />

      <View style={{ marginTop: theme.spacing.x8 }}>
        <BinderText variant="micro" tone="muted">PHOTOS · {media.length}/6</BinderText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x3, marginTop: theme.spacing.x3 }}>
          {media.map((item, index) => <PhotoTile key={item.id} item={item} index={index} total={media.length} busy={busy} onLeft={() => void movePhoto(index, -1)} onRight={() => void movePhoto(index, 1)} onPrimary={() => void makePrimary(item)} onRemove={() => confirmRemove(item)} onView={() => setViewerUrl(item.signedUrl)} />)}
          {media.length < 6 ? <AddPhotoTile disabled={busy} onPress={() => void addPhoto()} /> : null}
        </View>
        {message ? <BinderText variant="caption" tone={messageKind === 'success' ? 'accent' : 'destructive'} style={{ marginTop: theme.spacing.x3 }}>{message}</BinderText> : null}
      </View>

      <View style={{ gap: theme.spacing.x5, marginTop: theme.spacing.x8 }}>
        <BinderInput label="First name" value={firstName} onChangeText={setFirstName} maxLength={40} />
        <BinderInput label="Bio" helper={`${bio.length}/500`} value={bio} onChangeText={setBio} maxLength={500} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
        <Choice label="I am"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={gender === item.value} onPress={() => setGender(item.value)} />)}</View></Choice>
        <Choice label="Interests"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{INTERESTS.map((item) => <BinderChip key={item} label={item} selected={interests.includes(item)} onPress={() => setInterests((current) => current.includes(item) ? current.filter((value) => value !== item) : current.length < 12 ? [...current, item] : current)} />)}</View></Choice>
        <Choice label="I want to meet"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={interestedIn.includes(item.value)} onPress={() => setInterestedIn((current) => current.includes(item.value) ? current.filter((value) => value !== item.value) : [...current, item.value])} />)}</View></Choice>
        <Choice label="Discovery range">
          <View style={{ gap: theme.spacing.x5 }}>
            <RangeSlider min={18} max={100} lowValue={Number(minAge) || 18} highValue={Number(maxAge) || 45} label={(lowest, highest) => `Age ${lowest} – ${highest}`} onChange={(lowest, highest) => { setMinAge(String(lowest)); setMaxAge(String(highest)); }} />
            <SingleSlider min={1} max={500} value={Number(distance) || 50} label={(value) => `Distance up to ${value} km`} onChange={(value) => setDistance(String(value))} />
          </View>
        </Choice>
      </View>
      <BinderButton label="Save profile" loading={busy} onPress={() => void save()} style={{ marginTop: theme.spacing.x6 }} />
    </ScrollView>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <View><BinderText variant="label" tone="secondary" style={{ marginBottom: theme.spacing.x2 }}>{label}</BinderText>{children}</View>;
}

function CompactNumber({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <View style={{ flex: 1 }}><BinderInput label={label} value={value} onChangeText={setValue} keyboardType="number-pad" style={{ textAlign: 'center' }} /></View>;
}

function AddPhotoTile({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Add profile photo" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: '47%', minHeight: 220, borderRadius: theme.radii.card, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.borderStrong, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x2, opacity: disabled ? 0.42 : 1 })}><BinderIcon name="addPhoto" size={30} color={theme.accent.accent} /><BinderText variant="label" tone="accent">Add photo</BinderText><BinderText variant="caption" tone="muted" align="center">Optimized before upload</BinderText></Pressable>;
}

function PhotoTile({ item, index, total, busy, onLeft, onRight, onPrimary, onRemove, onView }: { item: GalleryMedia; index: number; total: number; busy: boolean; onLeft: () => void; onRight: () => void; onPrimary: () => void; onRemove: () => void; onView: () => void }) {
  const { theme } = useBinderTheme();
  const statusTone = item.moderationStatus === 'approved' ? theme.semantic.success : item.moderationStatus === 'pending' ? theme.semantic.warning : theme.semantic.destructive;
  const statusCopy = item.moderationStatus === 'approved' ? 'Approved' : item.moderationStatus === 'pending' ? 'Pending review' : item.moderationStatus === 'rejected' ? 'Not approved' : 'Removed';
  return (
    <BinderCard style={{ width: '47%', padding: 0, overflow: 'hidden' }}>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={`View photo ${index + 1} in full`} onPress={onView}>
        <Image source={{ uri: item.signedUrl }} style={{ width: '100%', height: 190 }} resizeMode="cover" />
      </Pressable>
      <View style={{ padding: theme.spacing.x3, gap: theme.spacing.x2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusTone }} /><BinderText variant="caption" style={{ color: statusTone }}>{statusCopy}</BinderText></View>
        {item.position === 0 ? <BinderText variant="micro" tone="accent">PRIMARY</BinderText> : item.moderationStatus === 'approved' ? <BinderButton label="Make primary" variant="ghost" disabled={busy} onPress={onPrimary} /> : null}
        <BinderText variant="caption" tone="muted">{Math.max(1, Math.round(item.byteSize / 1024))} KB · {item.width} by {item.height}</BinderText>
        {item.moderationReason ? <BinderText variant="caption" tone="destructive">{item.moderationReason}</BinderText> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <BinderIconButton name="back" size={19} accessibilityLabel={`Move photo ${index + 1} left`} disabled={busy || index === 0} onPress={onLeft} />
          <BinderIconButton name="delete" size={19} accessibilityLabel={`Remove photo ${index + 1}`} destructive disabled={busy} onPress={onRemove} />
          <BinderIconButton name="chevronRight" size={19} accessibilityLabel={`Move photo ${index + 1} right`} disabled={busy || index === total - 1} onPress={onRight} />
        </View>
      </View>
    </BinderCard>
  );
}
