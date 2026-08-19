import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, FadeOut, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import DiscoveryFilterSheet from '../components/DiscoveryFilterSheet';
import { DiscoveryLoading } from '../components/DiscoveryLoading';
import { discoveryDefaults, type DiscoveryPreferenceValues } from '../components/DiscoveryPreferences';
import { MatchCelebration } from '../components/MatchCelebration';
import { PhotoPager } from '../components/PhotoPager';
import { MotionPressable as Pressable } from '../components/ui';
import { BinderBrand, BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { announce } from '../lib/announce';
import { countDiscoveryCandidates, fetchDiscoveryBatch, loadAttributeFilterCount, loadDiscoveryPreferences, recordDecision, refreshDiscoveryLocation, type DiscoveryProfile } from '../lib/discovery';
import { classifyEmptyDiscovery, type EmptyDiscoveryKind } from '../lib/discoveryAvailability';
import { advanceDeck, decideSwipe, discoveryDeckPhysics, resistedTranslation, type SwipeDirection } from '../lib/discoveryDeck';
import { formatCount, formatDistanceKm } from '../lib/format';
import { listMyProfileMedia } from '../lib/media';
import { matchCelebrationPhotoUrls } from '../lib/matchCelebrationAssets';
import { interestLabel } from '../lib/validation';
import { resolveSpring } from '../lib/motionPolicy';
import { reportAndBlockDiscoveryProfile, type DiscoveryReportReason } from '../lib/safety';
import { supabase } from '../lib/supabase';
import { classifyError, type ReliabilityError } from '../lib/reliability';
import PartnerProfileScreen from './PartnerProfileScreen';
import { useBinderHaptics } from '../theme/haptics';
import { darkPalette } from '../theme/tokens';
import { useBinderTheme } from '../theme/ThemeProvider';


export default function DiscoveryScreen({ onOpenMatch, onSessionExpired }: { onOpenMatch?: (match: MatchSummary) => void; onSessionExpired: () => void }) {
  const { theme, reduceMotion, locale, t } = useBinderTheme();
  const reportReasons: { value: DiscoveryReportReason; label: string; detail: string }[] = [
    { value: 'underage', label: t('discovery.safety.reasons.underage.label'), detail: t('discovery.safety.reasons.underage.detail') },
    { value: 'harassment', label: t('discovery.safety.reasons.harassment.label'), detail: t('discovery.safety.reasons.harassment.detail') },
    { value: 'fake', label: t('discovery.safety.reasons.fake.label'), detail: t('discovery.safety.reasons.fake.detail') },
    { value: 'spam', label: t('discovery.safety.reasons.spam.label'), detail: t('discovery.safety.reasons.spam.detail') },
    { value: 'sexual_content', label: t('discovery.safety.reasons.sexualContent.label'), detail: t('discovery.safety.reasons.sexualContent.detail') },
    { value: 'violence', label: t('discovery.safety.reasons.violence.label'), detail: t('discovery.safety.reasons.violence.detail') },
    { value: 'other', label: t('discovery.safety.reasons.other.label'), detail: t('discovery.safety.reasons.other.detail') },
  ];
  // Read from the live window: rotation and split-screen change the width, and
  // a threshold measured at import time would decide swipes by the old one.
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const SWIPE_THRESHOLD = SCREEN_WIDTH * discoveryDeckPhysics.distanceRatio;
  const SWIPE_OUT = SCREEN_WIDTH * discoveryDeckPhysics.dismissDistanceRatio;
  const HINGE_OFFSET = SCREEN_WIDTH * discoveryDeckPhysics.hingeOffsetRatio;
  const BACK_CARD_OFFSET = SCREEN_WIDTH * discoveryDeckPhysics.backCardOffsetRatio;
  const haptic = useBinderHaptics();
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionPending, setDecisionPending] = useState(false);
  const [error, setError] = useState<ReliabilityError | null>(null);
  const [match, setMatch] = useState<DiscoveryProfile | null>(null);
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<DiscoveryProfile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<DiscoveryPreferenceValues | null>(null);
  const [attributeFilterCount, setAttributeFilterCount] = useState(0);
  const [emptyKind, setEmptyKind] = useState<EmptyDiscoveryKind | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyReason, setSafetyReason] = useState<DiscoveryReportReason | null>(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const intentX = useSharedValue(0);
  const buttonStamp = useSharedValue(0);
  const thresholdDirection = useSharedValue(0);
  const profileOpenProgress = useSharedValue(0);
  const profile = profiles[0];
  const nextProfile = profiles[1];
  const spring = resolveSpring(reduceMotion, 'professional');

  // Only the newest load may write the deck. An older response finishing last
  // used to overwrite a freshly filtered deck with the previous one.
  const loadToken = useRef(0);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const discoveryReloadDeferred = useRef(false);
  useEffect(() => () => {
    mounted.current = false;
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
  }, []);

  async function loadDiscovery(refreshLocation = true) {
    const token = ++loadToken.current;
    const current = () => mounted.current && loadToken.current === token;
    setLoading(true);
    setError(null);
    setLocationPermissionDenied(false);
    try {
      if (refreshLocation && !await refreshDiscoveryLocation()) {
        if (current()) setLocationPermissionDenied(true);
        return;
      }
      const batch = await fetchDiscoveryBatch(20);
      if (!current()) return;
      setProfiles(batch);
      if (batch.length === 0) {
        const values = filterValues ?? await loadDiscoveryPreferences();
        const [currentCount, standardCount] = await Promise.all([
          countDiscoveryCandidates(values),
          countDiscoveryCandidates(discoveryDefaults),
        ]);
        if (!current()) return;
        setFilterValues(values);
        setEmptyKind(classifyEmptyDiscovery(currentCount, standardCount));
      } else setEmptyKind(null);
    } catch (cause) {
      if (!current()) return;
      const failure = classifyError(cause);
      if (failure.kind === 'permission-denied') onSessionExpired();
      else setError(failure);
    } finally { if (current()) setLoading(false); }
  }

  useEffect(() => { void loadDiscovery(true); }, []);

  useEffect(() => {
    const nextPhoto = profiles[1]?.photoUrls[0] ?? profiles[1]?.photoUrl;
    if (nextPhoto) void Image.prefetch(nextPhoto).catch(() => undefined);
  }, [profiles]);

  useEffect(() => {
    let active = true;
    async function loadFilterSummary() {
      const values = await loadDiscoveryPreferences();
      void loadAttributeFilterCount().then((count) => { if (active) setAttributeFilterCount(count); }).catch(() => undefined);
      if (active) setFilterValues(values);
    }
    void loadFilterSummary().catch(() => undefined);
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
      setError(classifyError(t('discovery.errors.openConversation')));
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
  const bindStampStyle = useAnimatedStyle(() => ({ opacity: Math.max(reduceMotion ? (intentX.value >= SWIPE_THRESHOLD ? 1 : 0) : interpolate(intentX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP), Math.max(0, buttonStamp.value)) }));
  const passStampStyle = useAnimatedStyle(() => ({ opacity: Math.max(reduceMotion ? (intentX.value <= -SWIPE_THRESHOLD ? 1 : 0) : interpolate(intentX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP), Math.max(0, -buttonStamp.value)) }));
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
  const expandedProfileStyle = useAnimatedStyle(() => ({
    opacity: profileOpenProgress.value,
    transform: [{ scale: interpolate(profileOpenProgress.value, [0, 1], [discoveryDeckPhysics.backCardScale, 1]) }],
  }));

  function openProfile(current: DiscoveryProfile) {
    if (decisionPending || safetyOpen) return;
    profileOpenProgress.value = reduceMotion ? 1 : 0;
    setViewingProfile(current);
    if (!reduceMotion) profileOpenProgress.value = withTiming(1, { duration: theme.motion.context });
  }

  function closeProfile() {
    if (reduceMotion) {
      setViewingProfile(null);
      return;
    }
    profileOpenProgress.value = withTiming(0, { duration: theme.motion.deliberate }, (finished) => {
      if (finished) runOnJS(setViewingProfile)(null);
    });
  }

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
    setProfiles((value) => advanceDeck(value, current.id));
    if (matched) {
      announce(t('discovery.accessibility.matchCreated', { name: current.name }));
      // The card is still flying out. Mounting the celebration on top of that
      // animation put two entrances in the same frames and cost 7 % janky
      // frames; it starts once the card has left instead. The match itself was
      // confirmed by the server before any of this ran.
      const celebrateAfter = reduceMotion ? 0 : theme.motion.deliberate;
      celebrationTimer.current = setTimeout(() => setMatch(current), celebrateAfter);
    }
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
    setError(null);
    if (direction === 'right') {
      for (const photoUrl of matchCelebrationPhotoUrls(myPhotoUrl, current.photoUrl)) {
        void Image.prefetch(photoUrl).catch(() => undefined);
      }
    }
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
      if (profiles.length === 1) {
        if (result.matched) discoveryReloadDeferred.current = true;
        else void loadDiscovery(false);
      }
    } catch (cause) {
      setDecisionPending(false);
      const failure = classifyError(cause);
      if (failure.kind === 'permission-denied') onSessionExpired();
      else setError(failure);
      springBack();
    }
  }

  function keepDiscoveringAfterMatch() {
    setMatch(null);
    if (discoveryReloadDeferred.current) {
      discoveryReloadDeferred.current = false;
      void loadDiscovery(false);
    }
  }

  function openSafety() {
    if (!profile || decisionPending) return;
    springBack();
    setSafetyReason(null);
    setError(null);
    setSafetyOpen(true);
  }

  async function submitSafetyReport() {
    if (!profile || !safetyReason || safetyBusy) return;
    const targetId = profile.id;
    setSafetyBusy(true);
    setError(null);
    try {
      await reportAndBlockDiscoveryProfile(targetId, safetyReason);
      await haptic('destructive');
      setSafetyOpen(false);
      setSafetyReason(null);
      x.value = 0;
      y.value = 0;
      setProfiles((current) => current.filter((item) => item.id !== targetId));
    } catch (cause) {
      const failure = classifyError(cause);
      if (failure.kind === 'permission-denied') onSessionExpired();
      else setError(failure);
    } finally { setSafetyBusy(false); }
  }

  const panGesture = Gesture.Pan()
    .enabled(!decisionPending && !safetyOpen && Boolean(profile))
    .activeOffsetX([-theme.spacing.x2, theme.spacing.x2])
    .onBegin(() => {
      thresholdDirection.value = 0;
    })
    .onUpdate((event) => {
      x.value = reduceMotion ? 0 : resistedTranslation(event.translationX, SCREEN_WIDTH);
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

  function previewDecision(direction: SwipeDirection | null) {
    const target = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
    buttonStamp.value = reduceMotion ? target : withTiming(target, { duration: theme.motion.standard });
  }

  if (locationPermissionDenied) return <ScreenState kind="permission" icon="discover" title={t('discovery.location.title')} message={t('discovery.location.message')} actionLabel={t('discovery.actions.allowLocation')} onAction={() => void loadDiscovery(true)} />;

  if (error && profiles.length === 0) {
    return <ScreenState kind={error.kind === 'offline' ? 'offline' : 'error'} icon="retry" title={error.kind === 'offline' ? t('discovery.states.offlineTitle') : t('discovery.states.loadErrorTitle')} message={error.kind === 'offline' ? t('discovery.states.offlineMessage') : t(error.messageKey)} actionLabel={t('discovery.actions.tryAgain')} onAction={() => void loadDiscovery(true)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('discovery.header.title')} titleVisual={<View><BinderBrand compact /><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>{t('discovery.header.copy')}</BinderText>{filterValues ? <BinderText variant="caption" tone="accent" style={{ marginTop: theme.spacing.x2, marginBottom: theme.spacing.x1 }}>{t('discovery.filters.summary', { minAge: formatCount(filterValues.minAge, locale), maxAge: formatCount(filterValues.maxAge, locale), distance: formatDistanceKm(filterValues.distance, locale) })}{attributeFilterCount > 0 ? ` · ${t(attributeFilterCount === 1 ? 'discovery.filters.moreOne' : 'discovery.filters.moreOther', { count: formatCount(attributeFilterCount, locale) })}` : ''}</BinderText> : null}</View>} trailing={<View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
          {decisionPending ? <BinderText accessibilityLiveRegion="polite" variant="caption" tone="accent">{t('discovery.states.saving')}</BinderText> : null}
          <Animated.View key={filterValues ? `${filterValues.minAge}-${filterValues.maxAge}-${filterValues.distance}` : 'filters'} entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.standard)} exiting={reduceMotion ? undefined : FadeOut.duration(theme.motion.fast)}><BinderChip icon="settings" label={t('discovery.filters.label')} selected={filtersOpen} disabled={decisionPending} accessibilityLabel={t('discovery.accessibility.openFilters')} onPress={() => setFiltersOpen(true)} /></Animated.View>
        </View>} />

      <View style={{ flex: 1, marginHorizontal: theme.spacing.x4, marginTop: theme.spacing.x1, marginBottom: theme.spacing.x3, justifyContent: 'center' }}>
        {loading ? <View style={{ position: 'absolute', inset: 0, zIndex: 2, backgroundColor: theme.colors.canvas }}><DiscoveryLoading /></View> : null}
        {!profile ? (
          <BinderCard>
            <BinderText variant="micro" tone="accent">{t(emptyKind === 'filtered' ? 'discovery.empty.filteredEyebrow' : 'discovery.empty.genuineEyebrow')}</BinderText>
            <BinderText variant="heading" style={{ marginTop: theme.spacing.x2 }}>{t(emptyKind === 'filtered' ? 'discovery.empty.filteredTitle' : 'discovery.empty.genuineTitle')}</BinderText>
            <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>{t(emptyKind === 'filtered' ? 'discovery.empty.filteredMessage' : 'discovery.empty.genuineMessage')}</BinderText>
            {emptyKind === 'filtered' ? <BinderButton label={t('discovery.actions.changeFilters')} icon="discover" onPress={() => setFiltersOpen(true)} style={{ marginTop: theme.spacing.x5 }} /> : null}
          </BinderCard>
        ) : (
          <>
            {nextProfile ? (
              <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', inset: 0 }, reduceMotion ? undefined : backCardStyle]}>
                <ProfileCard key={nextProfile.id} profile={nextProfile} back={reduceMotion} />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[{ position: 'absolute', inset: 0 }, topCardStyle]}>
                <ProfileCard key={profile.id} profile={profile} onOpenProfile={() => openProfile(profile)} />
                <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, borderRightWidth: theme.spacing.x1, borderColor: theme.accent.accent, alignItems: 'flex-end', justifyContent: 'center', paddingRight: theme.spacing.x5 }, bindStampStyle]}><BinderText variant="title" tone="accent">{t('discovery.actions.bindStamp')}</BinderText></Animated.View>
                <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, borderLeftWidth: theme.spacing.x1, borderColor: theme.semantic.destructive, justifyContent: 'center', paddingLeft: theme.spacing.x5 }, passStampStyle]}><BinderText variant="title" tone="destructive">{t('discovery.actions.passStamp')}</BinderText></Animated.View>
              </Animated.View>
            </GestureDetector>
            <View style={{ position: 'absolute', top: theme.spacing.x3, right: theme.spacing.x3 }}><BinderIconButton name="safety" accessibilityLabel={t('discovery.accessibility.safetyOptions', { name: profile.name })} onPress={openSafety} /></View>
          </>
        )}
      </View>

      {error ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive" align="center" style={{ paddingHorizontal: theme.spacing.x5, paddingBottom: theme.spacing.x1 }}>{t(error.messageKey)}</BinderText> : null}
      <View style={{ minHeight: theme.layout.discoveryActionBarHeight, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: theme.spacing.x3, paddingBottom: theme.spacing.x3 }}>
        {/* Two buttons, one axis: a trailing spacer used to sit here and pushed
            the pair off the screen's centre line by half a button. */}
        <View style={{ width: theme.spacing.x16 }}><DiscoveryAction kind="pass" disabled={!profile || decisionPending || safetyOpen} onPressIn={() => previewDecision('left')} onPressOut={() => previewDecision(null)} onPress={() => void submitDecision('left')} /></View>
        <View style={{ width: theme.spacing.x16 }}><DiscoveryAction kind="bind" disabled={!profile || decisionPending || safetyOpen} onPressIn={() => previewDecision('right')} onPressOut={() => previewDecision(null)} onPress={() => void submitDecision('right')} /></View>
      </View>

      {viewingProfile ? (
        <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: theme.colors.canvas }, expandedProfileStyle]}>
          <PartnerProfileScreen userId={viewingProfile.id} fallbackName={viewingProfile.name} initialProfile={viewingProfile} onClose={closeProfile} />
        </Animated.View>
      ) : null}

      {match ? (
        <MatchCelebration
          profile={match}
          myPhotoUrl={myPhotoUrl}
          busy={openingConversation}
          onSaySomething={() => void openConversation(match)}
          onKeepDiscovering={keepDiscoveringAfterMatch}
        />
      ) : null}

      {filtersOpen ? (
        <DiscoveryFilterSheet
          initialValues={filterValues}
          onClose={() => setFiltersOpen(false)}
          onApplied={(values) => { setFilterValues(values); setFiltersOpen(false); void loadAttributeFilterCount().then(setAttributeFilterCount).catch(() => undefined); void loadDiscovery(false); }}
        />
      ) : null}

      {safetyOpen && profile ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
          <BinderCard style={{ maxHeight: '92%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: theme.colors.borderStrong }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="safety" color={theme.semantic.destructive} /><View style={{ flex: 1 }}><BinderText variant="micro" tone="destructive">{t('discovery.safety.eyebrow', { name: profile.name.toUpperCase() })}</BinderText><BinderText variant="heading" style={{ marginTop: theme.spacing.x1 }}>{t('discovery.safety.title')}</BinderText></View><BinderIconButton name="close" accessibilityLabel={t('discovery.accessibility.closeSafetyOptions')} onPress={() => { setSafetyOpen(false); setSafetyReason(null); }} /></View>
            <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('discovery.safety.message')}</BinderText>
            <ScrollView style={{ marginTop: theme.spacing.x4 }} contentContainerStyle={{ gap: theme.spacing.x2 }}>
              {reportReasons.map((reason) => (
                <Pressable key={reason.value} accessibilityRole="radio" accessibilityState={{ selected: safetyReason === reason.value }} onPress={() => setSafetyReason(reason.value)}>
                  {({ pressed }) => <BinderCard style={{ padding: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, borderColor: safetyReason === reason.value ? theme.semantic.destructive : theme.colors.borderSubtle, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}><View style={{ flex: 1 }}><BinderText variant="label">{reason.label}</BinderText><BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>{reason.detail}</BinderText></View>{safetyReason === reason.value ? <BinderIcon name="check" size={20} color={theme.semantic.destructive} /> : null}</BinderCard>}
                </Pressable>
              ))}
            </ScrollView>
            <BinderButton label={t('discovery.actions.reportAndBlock')} icon="report" variant="destructive" disabled={!safetyReason} loading={safetyBusy} onPress={() => void submitSafetyReport()} style={{ marginTop: theme.spacing.x4 }} />
            <BinderButton label={t('discovery.actions.cancel')} variant="ghost" disabled={safetyBusy} onPress={() => { setSafetyOpen(false); setSafetyReason(null); }} style={{ marginTop: theme.spacing.x2 }} />
          </BinderCard>
        </View>
      ) : null}
    </View>
  );
}

function DiscoveryAction({ kind, disabled, onPress, onPressIn, onPressOut }: { kind: 'pass' | 'bind'; disabled: boolean; onPress: () => void; onPressIn: () => void; onPressOut: () => void }) {
  const { theme, reduceMotion, t } = useBinderTheme();
  const bind = kind === 'bind';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={bind ? t('discovery.accessibility.bindProfile') : t('discovery.accessibility.passProfile')} accessibilityState={{ disabled }} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress} style={({ pressed }) => ({ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: bind ? theme.accent.accent : theme.colors.surface, borderWidth: 1, borderColor: bind ? theme.accent.accent : theme.colors.borderStrong, opacity: disabled ? 0.42 : pressed ? 0.78 : 1, transform: [{ scale: pressed && !reduceMotion ? theme.motion.pressScale : 1 }] })}>
      <BinderIcon name={bind ? 'matches' : 'close'} size={theme.spacing.x8} color={bind ? theme.accent.foreground : theme.semantic.destructive} />
    </Pressable>
  );
}

function ProfileCard({ profile, back = false, onOpenProfile }: { profile: DiscoveryProfile; back?: boolean; onOpenProfile?: () => void }) {
  const { theme, locale, t } = useBinderTheme();
  const { width } = useWindowDimensions();
  const backCardOffset = width * discoveryDeckPhysics.backCardOffsetRatio;
  const photos = profile.photoUrls.length > 0 ? profile.photoUrls : [profile.photoUrl];
  // A photo is not a surface whose brightness the theme controls. In light mode
  // the card drew near-black text onto the dark scrim over the photo, which was
  // unreadable; text over media always comes from the dark palette.
  const onMedia = darkPalette;

  return (
    <View style={{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, transform: back ? [{ scale: discoveryDeckPhysics.backCardScale }, { translateY: backCardOffset }] : undefined, opacity: back ? discoveryDeckPhysics.backCardOpacity : 1 }}>
      <PhotoPager photos={photos} name={t('discovery.accessibility.profileSummary', { name: profile.name, age: formatCount(profile.age, locale), distance: formatDistanceKm(profile.distanceKm, locale) })} interactive={!back} onOpen={onOpenProfile ? () => onOpenProfile() : undefined} />
      <LinearGradient pointerEvents="none" colors={[theme.colors.transparent, theme.colors.scrim, theme.colors.overlay]} locations={[0, 0.52, 1]} style={{ position: 'absolute', inset: 0 }} />

      <View pointerEvents="none" style={{ position: 'absolute', left: theme.spacing.x5, right: theme.spacing.x5, bottom: theme.spacing.x5 }}>
        <BinderText variant="displayL" style={{ color: onMedia.textPrimary }} numberOfLines={1}>{profile.name} <BinderText variant="heading" style={{ color: onMedia.textPrimary }}>{formatCount(profile.age, locale)}</BinderText></BinderText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, marginTop: theme.spacing.x2 }}><BinderText variant="caption" style={{ color: onMedia.textSecondary }}>{t('discovery.profile.away', { distance: formatDistanceKm(profile.distanceKm, locale) })}</BinderText><BinderText variant="caption" style={{ color: onMedia.textMuted }}>{t('discovery.profile.photosReviewed')}</BinderText></View>
        {profile.bio ? <BinderText variant="body" style={{ color: onMedia.textPrimary, marginTop: theme.spacing.x2 }} numberOfLines={2}>{profile.bio}</BinderText> : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x3, overflow: 'hidden' }}>
          {profile.tags.slice(0, 3).map((tag) => <View key={tag} style={{ maxWidth: '32%', backgroundColor: theme.colors.overlay, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}><BinderText variant="caption" style={{ color: onMedia.textPrimary }} numberOfLines={1} ellipsizeMode="tail">{interestLabel(t, tag)}</BinderText></View>)}
        </View>
      </View>
    </View>
  );
}
