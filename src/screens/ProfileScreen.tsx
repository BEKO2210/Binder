import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PhotoPager } from '../components/PhotoPager';
import { BinderButton, BinderCard, BinderIcon, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import { recordBetaEvent } from '../lib/beta';
import { listMyProfileMedia } from '../lib/media';
import { discoveryVisibility, type MediaState } from '../lib/discoveryVisibility';
import { profileCompleteness } from '../lib/profileCompleteness';
import { classifyError, isAbortError, type ReliabilityError } from '../lib/reliability';
import { fetchMySafetyNotice } from '../lib/safety';
import { prepareSafetyNotice, type SafetyNotice } from '../lib/safetyNotice';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = {
  userId: string;
  onEditProfile: () => void;
  onPreviewProfile: () => void;
  onSessionExpired: () => void;
};

export default function ProfileScreen({ userId, onEditProfile, onPreviewProfile, onSessionExpired }: Props) {
  const { theme, t, locale } = useBinderTheme();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrls, setPhotoUrls] = useState<readonly string[]>([]);
  const [media, setMedia] = useState<readonly MediaState[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [interestCount, setInterestCount] = useState(0);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState<ReliabilityError | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<SafetyNotice | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [userId]);

  async function load(signal?: AbortSignal) {
    const startedAt = Date.now();
    setLoading(true);
    setMessage('');
    setLoadError(null);
    try {
      const [profile, media, notice] = await Promise.all([
        supabase.from('profiles').select('first_name,bio,interests').eq('user_id', userId).abortSignal(signal ?? new AbortController().signal).single(),
        listMyProfileMedia(),
        fetchMySafetyNotice({ signal }),
      ]);
      if (profile.error) throw profile.error;
      setFirstName(profile.data.first_name);
      setBio(profile.data.bio);
      setPhotoUrls(media.map((item) => item.signedUrl).filter(Boolean));
      setMedia(media.map((item) => ({ position: item.position, moderationStatus: item.moderationStatus })));
      setPhotoCount(media.length);
      setInterestCount(profile.data.interests?.length ?? 0);
      setSafetyNotice(notice);
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'ok' });
    } catch (error) {
      if (isAbortError(error)) return;
      const failure = classifyError(error);
      if (failure.kind === 'permission-denied') onSessionExpired();
      else setLoadError(failure);
      void recordBetaEvent('profile_load', 'profile', { durationMs: Date.now() - startedAt, outcome: 'error' });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  if (loading) return <ScreenState kind="loading" message={t('profile.states.loading')} />;
  if (loadError) return <ScreenState kind={loadError.kind === 'offline' ? 'offline' : 'error'} icon="retry" title={loadError.kind === 'offline' ? t('profile.states.offlineTitle') : t('profile.states.errorTitle')} message={loadError.kind === 'offline' ? t('profile.states.offlineMessage') : t(loadError.messageKey)} actionLabel={t('profile.actions.tryAgain')} onAction={() => void load()} />;

  const completeness = profileCompleteness({ photoCount, bio, interestCount });
  // "3 of 3" is true and still not the whole truth: a photo is invisible until
  // it is reviewed, and the server only puts a profile into a deck once the
  // first one is approved. Somebody could otherwise finish their profile, see
  // an empty deck and never learn why.
  const visibility = discoveryVisibility(media);
  const notice = safetyNotice ? prepareSafetyNotice(safetyNotice, locale) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingBottom: theme.spacing.x16 + theme.spacing.x8 }}>
      <BinderScreenHeader title={t('profile.header.title')} eyebrow={t('profile.header.eyebrow')} />
      <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
      {notice ? <BinderCard style={{ marginBottom: theme.spacing.x5, borderColor: notice.kind === 'suspended' ? theme.semantic.warning : theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }}>
        <BinderText variant="micro" tone={notice.kind === 'suspended' ? 'warning' : 'muted'}>{t(notice.kind === 'suspended' ? 'profile.notice.suspendedEyebrow' : 'profile.notice.warningEyebrow')}</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x2 }}>{t(notice.kind === 'suspended' ? 'profile.notice.suspendedTitle' : 'profile.notice.warningTitle')}</BinderText>
        <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{notice.reason ?? t('profile.notice.reasonUnavailable')}</BinderText>
        {notice.kind === 'warning' && notice.date ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>{t('profile.notice.warnedOn', { date: notice.date })}</BinderText> : null}
        {notice.kind === 'suspended' ? <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>{t('profile.notice.suspendedEffect')}</BinderText> : null}
      </BinderCard> : null}
      {visibility === 'awaitingReview' || visibility === 'blocked' ? (
        <BinderCard style={{ marginBottom: theme.spacing.x5, borderColor: visibility === 'blocked' ? theme.semantic.destructive : theme.semantic.warning }}>
          <BinderText variant="micro" tone={visibility === 'blocked' ? 'destructive' : 'warning'}>{t(visibility === 'blocked' ? 'profile.visibility.blockedTitle' : 'profile.visibility.pendingTitle')}</BinderText>
          <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t(visibility === 'blocked' ? 'profile.visibility.blockedCopy' : 'profile.visibility.pendingCopy')}</BinderText>
        </BinderCard>
      ) : null}
      {/* The same pager a match swipes through, so the overview shows every
          photo rather than only the first one. It is the component that already
          knows how to page a photo safely — the profile must not grow a second
          one of those. */}
      {photoUrls.length > 0 ? (
        <View style={{ height: theme.layout.profileHeroHeight, borderRadius: theme.radii.hero, overflow: 'hidden' }}>
          <PhotoPager photos={photoUrls} name={firstName || t('profile.header.title')} swipeable />
        </View>
      ) : <BinderCard style={{ minHeight: theme.layout.onboardingPhotoHeight, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x3 }}><BinderIcon name="addPhoto" size={34} color={theme.accent.onSurface} /><BinderText variant="label" tone="accent">{t('profile.empty.addFirstPhoto')}</BinderText></BinderCard>}
      <BinderText variant="heading" style={{ marginTop: theme.spacing.x5 }}>{firstName || t('profile.header.title')}</BinderText>
      <BinderText variant="body" tone={bio ? 'secondary' : 'muted'} style={{ marginTop: theme.spacing.x2 }}>{bio || t('profile.empty.addBio')}</BinderText>
      {/* A finished profile has nothing left to nag about. The card used to
          stay at 100 % with every line ticked — a checklist telling somebody
          they are done, on the screen they open to look at themselves. */}
      {completeness.complete ? null : <BinderCard style={{ marginTop: theme.spacing.x5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View><BinderText variant="micro" tone="muted">{t('profile.completeness.eyebrow')}</BinderText><BinderText variant="title" style={{ marginTop: theme.spacing.x1 }}>{t('profile.completeness.percent', { percent: completeness.percent })}</BinderText></View><BinderText variant="label" tone="accent">{completeness.completed}/{completeness.total}</BinderText></View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: completeness.percent }} style={{ height: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.colors.borderStrong, overflow: 'hidden', marginTop: theme.spacing.x4 }}><View style={{ width: `${completeness.percent}%`, height: '100%', backgroundColor: theme.accent.accent }} /></View>
        <View style={{ marginTop: theme.spacing.x3, gap: theme.spacing.x2 }}>{completeness.items.map((item) => <View key={item.key} style={{ minHeight: theme.layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name={item.complete ? 'check' : 'chevronRight'} size={20} color={item.complete ? theme.semantic.success : theme.colors.textMuted} /><BinderText variant="label" tone={item.complete ? 'muted' : 'secondary'} style={{ flex: 1 }}>{item.complete ? t('profile.completeness.done', { item: t(item.label) }) : t(item.label)}</BinderText></View>)}</View>
        <BinderButton label={t('profile.actions.completeProfile')} variant="secondary" icon="edit" onPress={onEditProfile} style={{ marginTop: theme.spacing.x3 }} />
      </BinderCard>}
      <View style={{ gap: theme.spacing.x3, marginTop: theme.spacing.x5 }}>
        <HubRow icon="edit" title={t('profile.hub.profileTitle')} copy={t('profile.hub.profileCopy')} onPress={onEditProfile} />
      </View>
      <BinderButton label={t('profile.actions.preview')} icon="discover" variant="secondary" onPress={onPreviewProfile} style={{ marginTop: theme.spacing.x3 }} />
      {message ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{message}</BinderText> : null}
      </View>
    </ScrollView>
  );
}

function HubRow({ icon, title, copy, onPress }: { icon: 'edit' | 'settings' | 'beta' | 'info'; title: string; copy: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} pressedSurface={false}>
      {({ pressed }) => <BinderCard style={{ backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x4 }}>
        <View style={{ width: theme.layout.minimumTouchTarget, height: theme.layout.minimumTouchTarget, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderIcon name={icon} color={theme.accent.onSurface} /></View>
        <View style={{ flex: 1 }}><BinderText variant="label">{title}</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{copy}</BinderText></View>
        <BinderIcon name="chevronRight" color={theme.colors.textMuted} />
      </BinderCard>}
    </Pressable>
  );
}
