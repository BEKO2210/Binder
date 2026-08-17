import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, Dimensions, Image, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import DiscoveryFilterSheet from '../components/DiscoveryFilterSheet';
import { DiscoveryLoading } from '../components/DiscoveryLoading';
import type { DiscoveryPreferenceValues } from '../components/DiscoveryPreferences';
import { MatchCelebration } from '../components/MatchCelebration';
import { BinderBrand, BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderText, ScreenState } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { fetchDiscoveryBatch, recordDecision, refreshDiscoveryLocation, type DiscoveryProfile } from '../lib/discovery';
import { advanceDeck, decideSwipe, discoveryDeckPhysics, type SwipeDirection } from '../lib/discoveryDeck';
import { listMyProfileMedia } from '../lib/media';
import { resolveSpring } from '../lib/motionPolicy';
import { reportAndBlockDiscoveryProfile, type DiscoveryReportReason } from '../lib/safety';
import { supabase } from '../lib/supabase';
import type { Gender } from '../lib/validation';
import PartnerProfileScreen from './PartnerProfileScreen';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * discoveryDeckPhysics.distanceRatio;
const SWIPE_OUT = SCREEN_WIDTH * discoveryDeckPhysics.dismissDistanceRatio;
const HINGE_OFFSET = SCREEN_WIDTH * discoveryDeckPhysics.hingeOffsetRatio;
const BACK_CARD_OFFSET = SCREEN_WIDTH * discoveryDeckPhysics.backCardOffsetRatio;
const profilePlaceholder = require('../../assets/brand/icon.png');

const REPORT_REASONS: { value: DiscoveryReportReason; label: string; detail: string }[] = [
  { value: 'underage', label: 'May be under 18', detail: 'Highest-priority safety review.' },
  { value: 'harassment', label: 'Harassment or threats', detail: 'Abusive, coercive or threatening behavior.' },
  { value: 'fake', label: 'Fake or impersonation', detail: 'Identity or profile appears deceptive.' },
  { value: 'spam', label: 'Spam or scam', detail: 'Commercial spam, fraud or suspicious solicitation.' },
  { value: 'sexual_content', label: 'Sexual content', detail: 'Explicit or unwanted sexual profile content.' },
  { value: 'violence', label: 'Violence', detail: 'Threats or graphic violent content.' },
  { value: 'other', label: 'Other safety concern', detail: 'A concern not covered above.' },
];

export default function DiscoveryScreen({ onOpenMatch }: { onOpenMatch?: (match: MatchSummary) => void }) {
  const { theme, reduceMotion } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionPending, setDecisionPending] = useState(false);
  const [error, setError] = useState('');
  const [match, setMatch] = useState<DiscoveryProfile | null>(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<DiscoveryProfile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<DiscoveryPreferenceValues | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyReason, setSafetyReason] = useState<DiscoveryReportReason | null>(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const intentX = useSharedValue(0);
  const thresholdDirection = useSharedValue(0);
  const profile = profiles[0];
  const nextProfile = profiles[1];
  const spring = resolveSpring(reduceMotion, 'professional');

  async function loadDiscovery(refreshLocation = true) {
    setLoading(true);
    setError('');
    try {
      if (refreshLocation) await refreshDiscoveryLocation();
      setProfiles(await fetchDiscoveryBatch(20));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load discovery.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadDiscovery(true); }, []);

  useEffect(() => {
    const nextPhoto = profiles[1]?.photoUrls[0] ?? profiles[1]?.photoUrl;
    if (nextPhoto) void Image.prefetch(nextPhoto).catch(() => undefined);
  }, [profiles]);

  useEffect(() => {
    let active = true;
    async function loadFilterSummary() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase.from('user_preferences').select('interested_in,min_age,max_age,max_distance_km').eq('user_id', userData.user.id).single();
      if (active && data) setFilterValues({ interestedIn: data.interested_in as Gender[], minAge: data.min_age, maxAge: data.max_age, distance: data.max_distance_km });
    }
    void loadFilterSummary();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    listMyProfileMedia()
      .then((media) => { if (active) setMyPhotoUrl(media[0]?.signedUrl ?? null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!viewingProfile && !match && !safetyOpen && !filtersOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewingProfile) setViewingProfile(null);
      else if (filtersOpen) setFiltersOpen(false);
      else if (safetyOpen) { setSafetyOpen(false); setSafetyReason(null); }
      else setMatch(null);
      return true;
    });
    return () => subscription.remove();
  }, [viewingProfile, match, safetyOpen, filtersOpen]);

  // The celebration CTA jumps straight into the fresh conversation.
  async function openConversation(current: DiscoveryProfile) {
    if (openingConversation) return;
    setOpeningConversation(true);
    try {
      const summaries = await fetchMatches();
      const target = summaries.find((item) => item.otherUserId === current.id);
      setMatch(null);
      if (target && onOpenMatch) onOpenMatch(target);
    } catch {
      // Keep the moment; the match is safe under Matches either way.
      setError('Could not open the conversation. You will find it under Matches.');
      setMatch(null);
    } finally { setOpeningConversation(false); }
  }

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: reduceMotion ? 0 : x.value },
      { translateY: reduceMotion ? 0 : y.value },
      { translateY: HINGE_OFFSET },
      { rotate: reduceMotion ? '0deg' : `${interpolate(x.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-discoveryDeckPhysics.maximumRotationDegrees, 0, discoveryDeckPhysics.maximumRotationDegrees], Extrapolation.CLAMP)}deg` },
      { translateY: -HINGE_OFFSET },
    ],
  }));
  const bindStampStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? (intentX.value >= SWIPE_THRESHOLD ? 1 : 0) : interpolate(intentX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP) }));
  const passStampStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? (intentX.value <= -SWIPE_THRESHOLD ? 1 : 0) : interpolate(intentX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP) }));
  // The card underneath grows toward full size as the top card leaves.
  const backCardStyle = useAnimatedStyle(() => {
    const progress = interpolate(Math.abs(x.value), [0, SWIPE_THRESHOLD * 1.6], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(progress, [0, 1], [discoveryDeckPhysics.backCardOpacity, 1]),
      transform: [
        { scale: interpolate(progress, [0, 1], [discoveryDeckPhysics.backCardScale, 1]) },
        { translateY: interpolate(progress, [0, 1], [BACK_CARD_OFFSET, 0]) },
      ],
    };
  });

  function springBack() {
    if (reduceMotion) {
      x.value = 0;
      y.value = 0;
      intentX.value = 0;
      return;
    }
    x.value = withSpring(0, spring);
    y.value = withSpring(0, spring);
    intentX.value = withSpring(0, spring);
  }

  function finishDismiss(current: DiscoveryProfile, matched: boolean) {
    setProfiles((value) => advanceDeck(value));
    if (matched) setMatch(current);
    // Reset only after React committed the new top card — resetting in the
    // same frame flashed the dismissed card back to center.
    requestAnimationFrame(() => {
      x.value = 0;
      y.value = 0;
      intentX.value = 0;
      thresholdDirection.value = 0;
      setDecisionPending(false);
    });
  }

  // The card flies out immediately for instant feel; it is only REMOVED from
  // the stack after the server confirms. On failure it springs back in.
  async function submitDecision(direction: SwipeDirection) {
    if (!profile || decisionPending || safetyOpen) return;
    const current = profile;
    setDecisionPending(true);
    setError('');
    void haptic('impact');
    if (reduceMotion) {
      x.value = direction === 'right' ? SWIPE_OUT : -SWIPE_OUT;
      intentX.value = direction === 'right' ? SWIPE_OUT : -SWIPE_OUT;
    } else {
      x.value = withTiming(direction === 'right' ? SWIPE_OUT : -SWIPE_OUT, { duration: theme.motion.deliberate });
      intentX.value = withTiming(direction === 'right' ? SWIPE_OUT : -SWIPE_OUT, { duration: theme.motion.deliberate });
    }
    try {
      const result = await recordDecision(current.id, direction === 'right' ? 'bind' : 'pass');
      if (result.matched) await haptic('match');
      finishDismiss(current, result.matched);
    } catch (cause) {
      setDecisionPending(false);
      setError(cause instanceof Error ? cause.message : 'Could not save your decision.');
      springBack();
    }
  }

  function openSafety() {
    if (!profile || decisionPending) return;
    springBack();
    setSafetyReason(null);
    setError('');
    setSafetyOpen(true);
  }

  async function submitSafetyReport() {
    if (!profile || !safetyReason || safetyBusy) return;
    const targetId = profile.id;
    setSafetyBusy(true);
    setError('');
    try {
      await reportAndBlockDiscoveryProfile(targetId, safetyReason);
      await haptic('destructive');
      setSafetyOpen(false);
      setSafetyReason(null);
      x.value = 0;
      y.value = 0;
      setProfiles((current) => current.filter((item) => item.id !== targetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the safety report.');
    } finally { setSafetyBusy(false); }
  }

  const panGesture = Gesture.Pan()
    .enabled(!decisionPending && !safetyOpen && Boolean(profile))
    .activeOffsetX([-theme.spacing.x2, theme.spacing.x2])
    .onBegin(() => {
      thresholdDirection.value = 0;
    })
    .onUpdate((event) => {
      x.value = reduceMotion ? 0 : event.translationX;
      intentX.value = event.translationX;
      y.value = reduceMotion ? 0 : event.translationY * 0.18;
      const direction = decideSwipe(event.translationX, event.velocityX, SCREEN_WIDTH);
      const nextDirection = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
      if (nextDirection !== thresholdDirection.value) {
        if (nextDirection !== 0) runOnJS(pulseThreshold)();
        thresholdDirection.value = nextDirection;
      }
    })
    .onEnd((event) => {
      const direction = decideSwipe(event.translationX, event.velocityX, SCREEN_WIDTH);
      if (direction) runOnJS(submitFromGesture)(direction);
      else {
        x.value = withSpring(0, spring);
        y.value = withSpring(0, spring);
        intentX.value = reduceMotion ? 0 : withSpring(0, spring);
      }
    });

  function pulseThreshold() {
    void haptic('selection');
  }

  function submitFromGesture(direction: SwipeDirection) {
    void submitDecision(direction);
  }

  if (loading && profiles.length === 0) return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}><DiscoveryLoading /></View>;
  if (error && profiles.length === 0) {
    const locationRelated = /location|permission|denied|gps/i.test(error);
    if (locationRelated) return <ScreenState kind="permission" icon="discover" title="Discovery paused" message={`${error}\n\nBinder uses foreground location only to calculate nearby candidates. Exact coordinates are never sent to another user.`} actionLabel="Try again" onAction={() => void loadDiscovery(true)} />;
    return <ScreenState kind="error" icon="retry" title="Discovery did not load" message="No connection. Check your internet and try again." actionLabel="Try again" onAction={() => void loadDiscovery(true)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ minHeight: 74, paddingHorizontal: theme.spacing.screen, paddingVertical: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View><BinderBrand compact /><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>People who fit both sides.</BinderText></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
          {decisionPending ? <BinderText variant="caption" tone="accent">Saving…</BinderText> : null}
          <BinderChip label={filterValues ? `${filterValues.minAge}–${filterValues.maxAge} · ${filterValues.distance} km` : 'Filters'} selected={filtersOpen} accessibilityLabel="Open discovery filters" onPress={() => setFiltersOpen(true)} />
        </View>
      </View>

      <View style={{ flex: 1, marginHorizontal: theme.spacing.x4, marginTop: theme.spacing.x1, marginBottom: theme.spacing.x3, justifyContent: 'center' }}>
        {loading ? <View style={{ position: 'absolute', inset: 0, zIndex: 2, backgroundColor: theme.colors.canvas }}><DiscoveryLoading compact /></View> : null}
        {!profile ? (
          <BinderCard>
            <BinderText variant="micro" tone="accent">YOU'RE CAUGHT UP</BinderText>
            <BinderText variant="heading" style={{ marginTop: theme.spacing.x2 }}>No more people right now.</BinderText>
            <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>Binder only shows profiles that pass mutual age, preference, distance and safety filters.</BinderText>
            <BinderButton label="Refresh nearby" icon="retry" onPress={() => void loadDiscovery(true)} style={{ marginTop: theme.spacing.x5 }} />
          </BinderCard>
        ) : (
          <>
            {nextProfile ? (
              <Animated.View style={[{ position: 'absolute', inset: 0 }, reduceMotion ? undefined : backCardStyle]}>
                <ProfileCard key={nextProfile.id} profile={nextProfile} back={reduceMotion} />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[{ position: 'absolute', inset: 0 }, topCardStyle]}>
                <ProfileCard key={profile.id} profile={profile} onOpenProfile={() => { if (!decisionPending && !safetyOpen) setViewingProfile(profile); }} />
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, borderRightWidth: theme.spacing.x1, borderColor: theme.accent.accent, alignItems: 'flex-end', justifyContent: 'center', paddingRight: theme.spacing.x5 }, bindStampStyle]}><BinderText variant="title" tone="accent">BIND</BinderText></Animated.View>
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, borderLeftWidth: theme.spacing.x1, borderColor: theme.semantic.destructive, justifyContent: 'center', paddingLeft: theme.spacing.x5 }, passStampStyle]}><BinderText variant="title" tone="destructive">PASS</BinderText></Animated.View>
              </Animated.View>
            </GestureDetector>
            <View style={{ position: 'absolute', top: theme.spacing.x3, right: theme.spacing.x3 }}><BinderIconButton name="safety" accessibilityLabel={`Safety options for ${profile.name}`} onPress={openSafety} /></View>
          </>
        )}
      </View>

      {error ? <BinderText variant="caption" tone="destructive" align="center" style={{ paddingHorizontal: theme.spacing.x5, paddingBottom: theme.spacing.x1 }}>{error}</BinderText> : null}
      <View style={{ minHeight: 82, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: theme.spacing.x3, paddingBottom: theme.spacing.x3 }}>
        {/* Two buttons, one axis: a trailing spacer used to sit here and pushed
            the pair off the screen's centre line by half a button. */}
        <View style={{ width: theme.spacing.x16 }}><DiscoveryAction kind="pass" disabled={!profile || decisionPending || safetyOpen} onPress={() => void submitDecision('left')} /></View>
        <View style={{ width: theme.spacing.x16 }}><DiscoveryAction kind="bind" disabled={!profile || decisionPending || safetyOpen} onPress={() => void submitDecision('right')} /></View>
      </View>

      {viewingProfile ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.canvas }}>
          <PartnerProfileScreen userId={viewingProfile.id} fallbackName={viewingProfile.name} onClose={() => setViewingProfile(null)} />
        </View>
      ) : null}

      {match ? (
        <MatchCelebration
          profile={match}
          myPhotoUrl={myPhotoUrl}
          busy={openingConversation}
          onSaySomething={() => void openConversation(match)}
          onKeepDiscovering={() => setMatch(null)}
        />
      ) : null}

      {filtersOpen ? (
        <DiscoveryFilterSheet
          initialValues={filterValues}
          onClose={() => setFiltersOpen(false)}
          onApplied={(values) => { setFilterValues(values); setFiltersOpen(false); void loadDiscovery(false); }}
        />
      ) : null}

      {safetyOpen && profile ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
          <BinderCard style={{ maxHeight: '92%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: theme.colors.borderStrong }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="safety" color={theme.semantic.destructive} /><View style={{ flex: 1 }}><BinderText variant="micro" tone="destructive">SAFETY · {profile.name.toUpperCase()}</BinderText><BinderText variant="heading" style={{ marginTop: theme.spacing.x1 }}>What should Binder review?</BinderText></View><BinderIconButton name="close" accessibilityLabel="Close safety options" onPress={() => { setSafetyOpen(false); setSafetyReason(null); }} /></View>
            <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Reporting also blocks this profile immediately. They are not told who reported or blocked them.</BinderText>
            <ScrollView style={{ marginTop: theme.spacing.x4 }} contentContainerStyle={{ gap: theme.spacing.x2 }}>
              {REPORT_REASONS.map((reason) => (
                <Pressable key={reason.value} accessibilityRole="radio" accessibilityState={{ selected: safetyReason === reason.value }} onPress={() => setSafetyReason(reason.value)}>
                  {({ pressed }) => <BinderCard style={{ padding: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, borderColor: safetyReason === reason.value ? theme.semantic.destructive : theme.colors.borderSubtle, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}><View style={{ flex: 1 }}><BinderText variant="label">{reason.label}</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{reason.detail}</BinderText></View>{safetyReason === reason.value ? <BinderIcon name="check" size={20} color={theme.semantic.destructive} /> : null}</BinderCard>}
                </Pressable>
              ))}
            </ScrollView>
            <BinderButton label="Report & block" icon="report" variant="destructive" disabled={!safetyReason} loading={safetyBusy} onPress={() => void submitSafetyReport()} style={{ marginTop: theme.spacing.x4 }} />
            <BinderButton label="Cancel" variant="ghost" disabled={safetyBusy} onPress={() => { setSafetyOpen(false); setSafetyReason(null); }} style={{ marginTop: theme.spacing.x2 }} />
          </BinderCard>
        </View>
      ) : null}
    </View>
  );
}

function DiscoveryAction({ kind, disabled, onPress }: { kind: 'pass' | 'bind'; disabled: boolean; onPress: () => void }) {
  const { theme, reduceMotion } = useBinderTheme();
  const bind = kind === 'bind';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={bind ? 'Bind profile' : 'Pass profile'} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: bind ? theme.accent.accent : theme.colors.surface, borderWidth: 1, borderColor: bind ? theme.accent.accent : theme.colors.borderStrong, opacity: disabled ? 0.42 : pressed ? 0.78 : 1, transform: [{ scale: pressed && !reduceMotion ? theme.motion.pressScale : 1 }] })}>
      <BinderIcon name={bind ? 'matches' : 'close'} size={theme.spacing.x8} color={bind ? theme.accent.foreground : theme.semantic.destructive} />
    </Pressable>
  );
}

function ProfileCard({ profile, back = false, onOpenProfile }: { profile: DiscoveryProfile; back?: boolean; onOpenProfile?: () => void }) {
  const { theme } = useBinderTheme();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<number>>(() => new Set());
  const photos = profile.photoUrls.length > 0 ? profile.photoUrls : [profile.photoUrl];
  const hasGallery = photos.length > 1;
  const photoFailed = failedPhotos.has(photoIndex);
  const accessibilitySummary = `${profile.name}, ${profile.age}, ${profile.distanceKm} kilometers away`;

  function markPhotoFailed() {
    setFailedPhotos((current) => {
      const next = new Set(current);
      next.add(photoIndex);
      return next;
    });
  }

  return (
    <View style={{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, transform: back ? [{ scale: discoveryDeckPhysics.backCardScale }, { translateY: BACK_CARD_OFFSET }] : undefined, opacity: back ? discoveryDeckPhysics.backCardOpacity : 1 }}>
      <Image
        accessibilityIgnoresInvertColors
        source={photoFailed ? profilePlaceholder : { uri: photos[photoIndex] }}
        resizeMode={photoFailed ? 'contain' : 'cover'}
        onError={markPhotoFailed}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', backgroundColor: theme.colors.surfaceElevated }}
      />
      <LinearGradient pointerEvents="none" colors={[theme.colors.transparent, theme.colors.scrim, theme.colors.overlay]} locations={[0, 0.52, 1]} style={{ position: 'absolute', inset: 0 }} />

      {hasGallery ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: theme.spacing.x3, left: theme.spacing.x3, right: theme.spacing.x3, flexDirection: 'row', gap: theme.spacing.x1 }}>
          {photos.map((photo, index) => <View key={photo} style={{ flex: 1, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: index === photoIndex ? theme.accent.accent : theme.colors.textMuted }} />)}
        </View>
      ) : null}

      {!back ? (
        hasGallery ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={`Previous photo of ${profile.name}`} accessibilityState={{ disabled: photoIndex === 0 }} disabled={photoIndex === 0} onPress={() => setPhotoIndex((value) => Math.max(0, value - 1))} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '33.333%' }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Open full profile for ${accessibilitySummary}`} onPress={onOpenProfile} style={{ position: 'absolute', top: 0, bottom: 0, left: '33.333%', width: '33.333%' }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Next photo of ${profile.name}`} accessibilityState={{ disabled: photoIndex === photos.length - 1 }} disabled={photoIndex === photos.length - 1} onPress={() => setPhotoIndex((value) => Math.min(photos.length - 1, value + 1))} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '33.333%' }} />
          </>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open full profile for ${accessibilitySummary}`} onPress={onOpenProfile} style={{ position: 'absolute', inset: 0 }} />
        )
      ) : null}

      <View pointerEvents="none" style={{ position: 'absolute', left: theme.spacing.x5, right: theme.spacing.x5, bottom: theme.spacing.x5 }}>
        <BinderText variant="displayL" style={{ color: theme.colors.textPrimary }} numberOfLines={1}>{profile.name} <BinderText variant="heading" style={{ color: theme.colors.textPrimary }}>{profile.age}</BinderText></BinderText>
        <View style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.overlay, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2, marginTop: theme.spacing.x2 }}><BinderText variant="caption" tone="secondary">{profile.distanceKm} km away</BinderText></View>
        {profile.bio ? <BinderText variant="body" style={{ color: theme.colors.textPrimary, marginTop: theme.spacing.x2 }} numberOfLines={2}>{profile.bio}</BinderText> : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x3, overflow: 'hidden' }}>
          {profile.tags.slice(0, 3).map((tag) => <View key={tag} style={{ maxWidth: '32%', backgroundColor: theme.colors.overlay, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}><BinderText variant="caption" style={{ color: theme.colors.textPrimary }} numberOfLines={1} ellipsizeMode="tail">{tag}</BinderText></View>)}
        </View>
      </View>
    </View>
  );
}
