import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, useCallback } from 'react';
import { BackHandler, Image, PixelRatio, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, FadeOut, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import DiscoveryFilterSheet from '../components/DiscoveryFilterSheet';
import { DiscoveryLoading } from '../components/DiscoveryLoading';
import { discoveryDefaults, type DiscoveryPreferenceValues } from '../components/DiscoveryPreferences';
import { MatchCelebration } from '../components/MatchCelebration';
import { PhotoPager } from '../components/PhotoPager';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { MotionPressable as Pressable } from '../components/ui';
import { BinderBrand, BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { announce } from '../lib/announce';
import { countDiscoveryCandidates, fetchDiscoveryBatch, loadAttributeFilterCount, loadDiscoveryPreferences, recordDecision, refreshDiscoveryLocation, type DiscoveryProfile } from '../lib/discovery';
import { classifyEmptyDiscovery, filterValuesToCountWith, type EmptyDiscoveryKind } from '../lib/discoveryAvailability';
import { deckIsCovered, discoveryLoadingVisible } from '../lib/discoveryOverlays';
import { advanceDeck, decideSwipe, discoveryDeckPhysics, resistedTranslation, stampProgress, stampScale, type SwipeDirection } from '../lib/discoveryDeck';
import { formatCount, formatDistanceKm } from '../lib/format';
import { listMyProfileMedia } from '../lib/media';
import { matchCelebrationPhotoUrls } from '../lib/matchCelebrationAssets';
import { interestEntry } from '../lib/interestCatalog';
import { interestLabel } from '../lib/validation';
import { resolveSpring } from '../lib/motionPolicy';
import { reportAndBlockDiscoveryProfile, type DiscoveryReportReason } from '../lib/safety';
import { supabase } from '../lib/supabase';
import { classifyError, withDeadline, withRetry, type ReliabilityError } from '../lib/reliability';
import { askFor, openGate, stillWaitingFor, stopWaiting } from '../lib/lateAnswer';
import { addPending, loadPending, nextToSend, removePending, savePending, shouldKeepAfterFailure, withQueueLock, type PendingDecision } from '../lib/decisionQueue';
import { outcomeForConfirmation, outcomeForFailure, outcomeForQueueFailure, shouldReloadDeck, type DecisionOutcome } from '../lib/decisionOutcome';
import PartnerProfileScreen from './PartnerProfileScreen';
import { useBinderHaptics } from '../theme/haptics';
// The stamps sit on a photograph, and a photograph is not a surface whose
// brightness the theme controls: in light mode the lime stamp on a bright
// picture was almost invisible — reported after a bind on a sunny portrait.
// Both stamps therefore take the dark palette and carry their own backing,
// the same rule the card's name and bio already follow.
import { darkPalette, semanticPalettes } from '../theme/tokens';
import { useBinderTheme } from '../theme/ThemeProvider';


// A request that never answers is worse than one that fails: the deck kept
// "Wird gespeichert…" on screen with both buttons dead for as long as the
// socket stayed quiet — measured at over seventy seconds on a stalled network,
// with no way out and no error. Every await here that holds a blocking state
// gets the same ceiling the profile screen already has.
// At a doubled system font the two supporting lines above the deck took a third
// of the screen: five lines of "people who suit both sides", four of the filter
// summary, and the card underneath squeezed until the interest chips read
// "Fotog…". Supporting text may grow, but not without end — and the sentence
// that only explains what the screen already shows steps aside entirely when
// the font is large enough that it would cost a card.
const HEADER_TEXT_CAP = 1.3;
const HEADER_COPY_MAX_FONT_SCALE = 1.5;

const DISCOVERY_DEADLINE_MS = 12_000;
// Refreshing the location is not a query: it asks for a permission and then
// waits for a position fix, and a cold fix on a phone that has just been
// unlocked takes longer than any request does. Measured on the S23 — twelve
// seconds turned a normal first start into "Binder hat zu lange gebraucht".
const DISCOVERY_LOCATION_DEADLINE_MS = 30_000;

export default function DiscoveryScreen({ onOpenMatch, onSessionExpired }: { onOpenMatch?: (match: MatchSummary) => void; onSessionExpired: () => void }) {
  const { theme, reduceMotion, locale, t } = useBinderTheme();
  // The system font scale decides whether the explaining sentence still earns
  // its space. PixelRatio reads the live value, so it follows a change in
  // Android's settings without a restart.
  const headerCopyFits = PixelRatio.getFontScale() < HEADER_COPY_MAX_FONT_SCALE;
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
  const [pendingCount, setPendingCount] = useState(0);
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
  const overlays = { filtersOpen, safetyOpen, profileOpen: Boolean(viewingProfile), celebrating: Boolean(match) };
  const deckCovered = deckIsCovered(overlays);
  const loadingVisible = discoveryLoadingVisible(loading, overlays);

  // Only the newest load may write the deck. An older response finishing last
  // used to overwrite a freshly filtered deck with the previous one.
  const loadToken = useRef(0);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const discoveryReloadDeferred = useRef(false);
  const flushing = useRef(false);
  const conversationGate = useRef(openGate());
  useEffect(() => () => {
    mounted.current = false;
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
  }, []);

  // appliedValues: what the filter sheet just saved. Without it the reload
  // counts with the values still in state and explains the empty deck wrongly.
  async function loadDiscovery(refreshLocation = true, appliedValues?: DiscoveryPreferenceValues) {
    const token = ++loadToken.current;
    const current = () => mounted.current && loadToken.current === token;
    setLoading(true);
    setError(null);
    setLocationPermissionDenied(false);
    try {
      if (refreshLocation && !await withDeadline(refreshDiscoveryLocation(), DISCOVERY_LOCATION_DEADLINE_MS)) {
        if (current()) setLocationPermissionDenied(true);
        return;
      }
      // The first request after a cold start has to wake the server as well as
      // answer, and twice on a freshly installed app that took longer than the
      // deadline — a person who had just signed up was told Binder had taken
      // too long before they had seen a single card. One silent second attempt
      // covers the wake-up; a server that is genuinely unreachable still fails,
      // just as loudly and only a moment later.
      const batch = await withRetry(() => withDeadline(fetchDiscoveryBatch(20), DISCOVERY_DEADLINE_MS), { attempts: 2, baseDelayMs: 400 });
      if (!current()) return;
      // The server only knows about decisions it has received. Anything still
      // waiting on disk would otherwise come back into the deck and be decided
      // a second time — the same person, asked twice, the first answer quietly
      // replaced by the second.
      const waiting = new Set((await loadPending()).map((entry) => entry.targetUserId));
      const fresh = waiting.size === 0 ? batch : batch.filter((candidate) => !waiting.has(candidate.id));
      if (!current()) return;
      setProfiles(fresh);
      if (fresh.length === 0) {
        const values = filterValuesToCountWith(appliedValues, filterValues) ?? await withDeadline(loadDiscoveryPreferences(), DISCOVERY_DEADLINE_MS);
        // Same ceiling as everything else that holds the loading state: a
        // socket that stalls here left the deck under its own overlay forever,
        // with no error and no way to retry.
        const [currentCount, standardCount] = await Promise.all([
          withDeadline(countDiscoveryCandidates(values), DISCOVERY_DEADLINE_MS),
          withDeadline(countDiscoveryCandidates(discoveryDefaults), DISCOVERY_DEADLINE_MS),
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
      const values = await withDeadline(loadDiscoveryPreferences(), DISCOVERY_DEADLINE_MS);
      void withDeadline(loadAttributeFilterCount(), DISCOVERY_DEADLINE_MS).then((count) => { if (active) setAttributeFilterCount(count); }).catch(() => undefined);
      if (active) setFilterValues(values);
    }
    void loadFilterSummary().catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    withDeadline(listMyProfileMedia(), DISCOVERY_DEADLINE_MS)
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
      else dismissMatch();
      return true;
    });
    return () => subscription.remove();
  }, [viewingProfile, match, safetyOpen, filtersOpen]);

  // The celebration CTA jumps straight into the fresh conversation — but only
  // for as long as the celebration is the screen the person is looking at. A
  // reply that lands after they closed it is read and dropped; it used to
  // navigate, which opened a chat by itself half a minute later.
  async function openConversation(current: DiscoveryProfile) {
    if (openingConversation) return;
    const ticket = askFor(conversationGate.current);
    setOpeningConversation(true);
    try {
      const summaries = await withDeadline(fetchMatches(), DISCOVERY_DEADLINE_MS);
      if (!mounted.current || !stillWaitingFor(conversationGate.current, ticket)) return;
      const target = summaries.find((item) => item.otherUserId === current.id);
      setMatch(null);
      if (target && onOpenMatch) onOpenMatch(target);
    } catch {
      if (!mounted.current || !stillWaitingFor(conversationGate.current, ticket)) return;
      // Keep the moment; the match is safe under Matches either way.
      setError(classifyError(t('discovery.errors.openConversation')));
      setMatch(null);
    } finally { if (mounted.current) setOpeningConversation(false); }
  }

  /**
   * Leaving the celebration voids whatever it asked for. It is also the only
   * place that may switch the celebration off, so the person always has a way
   * out even while a request is still in the air.
   */
  function dismissMatch() {
    stopWaiting(conversationGate.current);
    setOpeningConversation(false);
    setMatch(null);
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
  // The verdict has to be legible while the thumb can still take it back, so
  // the stamp is solid at half the distance that commits the card — not at the
  // moment the card leaves, which is what "I only see it once it is gone"
  // means.
  const bindStampStyle = useAnimatedStyle(() => {
    const progress = Math.max(reduceMotion ? (intentX.value >= SWIPE_THRESHOLD ? 1 : 0) : stampProgress(intentX.value, SCREEN_WIDTH, 'right'), Math.max(0, buttonStamp.value));
    return { opacity: progress, transform: [{ scale: stampScale(progress) }] };
  });
  const passStampStyle = useAnimatedStyle(() => {
    const progress = Math.max(reduceMotion ? (intentX.value <= -SWIPE_THRESHOLD ? 1 : 0) : stampProgress(intentX.value, SCREEN_WIDTH, 'left'), Math.max(0, -buttonStamp.value));
    return { opacity: progress, transform: [{ scale: stampScale(progress) }] };
  });
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

  // The decision table lives in src/lib/decisionOutcome.ts and has no side
  // effects; this is the part that touches the screen. Keeping the two apart is
  // why the branches can be tested at all — both of the bugs this path had were
  // in the table, not in the animation.
  async function applyOutcome(current: DiscoveryProfile, direction: SwipeDirection, outcome: DecisionOutcome) {
    if (outcome.sessionExpired) { onSessionExpired(); springBack(); return; }

    if (outcome.queue) {
      try {
        await queueDecision({ targetUserId: current.id, decision: direction === 'right' ? 'bind' : 'pass', decidedAt: Date.now() });
      } catch (queueFailure) {
        const failed = outcomeForQueueFailure(queueFailure);
        setError(failed.error);
        springBack();
        return;
      }
    }

    if (!outcome.dismiss) {
      if (outcome.error) setError(outcome.error);
      springBack();
      return;
    }

    if (outcome.matched) await haptic('match');
    finishDismiss(current, outcome.matched);

    const reload = shouldReloadDeck(profiles.length, outcome.matched);
    if (reload === 'after-celebration') discoveryReloadDeferred.current = true;
    else if (reload === 'now') void loadDiscovery(false);
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
      const result = await withDeadline(recordDecision(current.id, direction === 'right' ? 'bind' : 'pass'), DISCOVERY_DEADLINE_MS);
      await applyOutcome(current, direction, outcomeForConfirmation(result.matched));
    } catch (cause) {
      setDecisionPending(false);
      await applyOutcome(current, direction, outcomeForFailure(cause));
    }
  }

  async function queueDecision(entry: PendingDecision) {
    // Under the lock, because the flush is doing the same thing from the other
    // side and the last writer would win.
    const queue = await withQueueLock(async () => {
      const next = addPending(await loadPending(), entry);
      await savePending(next);
      return next;
    });
    setPendingCount(queue.length);
  }

  // Whatever is waiting goes out as soon as the app is open and the network
  // answers again — oldest first, so a later pass cannot overtake an earlier
  // bind on the same evening.
  const flushPending = useCallback(async () => {
    // Two flushes sending the same decision twice is worse than one flush
    // waiting: the server would be asked the same question under two requests.
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (true) {
        // Read under the lock and never hold the queue across the network. The
        // flush used to keep its own copy while it waited for the server, and
        // then wrote that copy back over a swipe queued in the meantime — the
        // card was gone from the deck and the decision was never sent.
        const entry = await withQueueLock(async () => nextToSend(await loadPending()));
        if (!entry) break;
        let keep = false;
        try {
          await withDeadline(recordDecision(entry.targetUserId, entry.decision), DISCOVERY_DEADLINE_MS);
        } catch (cause) {
          const failure = classifyError(cause);
          // A refusal is final; keeping it would retry forever. Only a lost
          // connection is worth waiting for.
          keep = shouldKeepAfterFailure(failure.kind);
        }
        if (keep) break;
        // Re-read, so whatever was queued while the request was in flight is
        // still there afterwards.
        const remaining = await withQueueLock(async () => {
          const next = removePending(await loadPending(), entry.targetUserId);
          await savePending(next);
          return next;
        }).catch(() => null);
        // The server already has this decision; a failed write only means the
        // queue is retried later, so it must not send it a second time now.
        if (remaining === null) break;
        setPendingCount(remaining.length);
      }
      const left = await withQueueLock(async () => loadPending());
      setPendingCount(left.length);
    } finally {
      flushing.current = false;
    }
  }, []);

  // Whatever waited from an earlier session goes out as soon as this screen
  // is alive again.
  useEffect(() => { void flushPending(); }, [flushPending]);

  function keepDiscoveringAfterMatch() {
    dismissMatch();
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
      await withDeadline(reportAndBlockDiscoveryProfile(targetId, safetyReason), DISCOVERY_DEADLINE_MS);
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
      {/* Everything the sheets cover. A screen reader used to keep reading the
          deck and its header while a sheet was open on top of them. */}
      <View style={{ flex: 1 }} accessibilityElementsHidden={deckCovered} importantForAccessibility={deckCovered ? 'no-hide-descendants' : 'auto'}>
      <BinderScreenHeader title={t('discovery.header.title')} titleVisual={<View><BinderBrand compact />{headerCopyFits ? <BinderText variant="caption" tone="muted" maxFontSizeMultiplier={HEADER_TEXT_CAP} style={{ marginTop: theme.spacing.x2 }}>{t('discovery.header.copy')}</BinderText> : null}{filterValues ? <BinderText variant="caption" tone="accent" maxFontSizeMultiplier={HEADER_TEXT_CAP} style={{ marginTop: theme.spacing.x2, marginBottom: theme.spacing.x1 }}>{t('discovery.filters.summary', { minAge: formatCount(filterValues.minAge, locale), maxAge: formatCount(filterValues.maxAge, locale), distance: formatDistanceKm(filterValues.distance, locale) })}{attributeFilterCount > 0 ? ` · ${t(attributeFilterCount === 1 ? 'discovery.filters.moreOne' : 'discovery.filters.moreOther', { count: formatCount(attributeFilterCount, locale) })}` : ''}</BinderText> : null}{pendingCount > 0 ? <BinderText variant="caption" tone="muted" maxFontSizeMultiplier={HEADER_TEXT_CAP} style={{ marginTop: theme.spacing.x1 }}>{t(pendingCount === 1 ? 'discovery.pending.one' : 'discovery.pending.other', { count: formatCount(pendingCount, locale) })}</BinderText> : null}</View>} trailing={<View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
          {decisionPending ? <BinderText accessibilityLiveRegion="polite" variant="caption" tone="accent">{t('discovery.states.saving')}</BinderText> : null}
          <Animated.View key={filterValues ? `${filterValues.minAge}-${filterValues.maxAge}-${filterValues.distance}` : 'filters'} entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.standard)} exiting={reduceMotion ? undefined : FadeOut.duration(theme.motion.fast)}><BinderChip icon="settings" label={t('discovery.filters.label')} selected={filtersOpen} disabled={decisionPending} accessibilityLabel={t('discovery.accessibility.openFilters')} onPress={() => setFiltersOpen(true)} /></Animated.View>
        </View>} />

      <View style={{ flex: 1, marginHorizontal: theme.spacing.x4, marginTop: theme.spacing.x1, marginBottom: theme.spacing.x3, justifyContent: 'center' }}>
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
                <ProfileCard key={nextProfile.id} profile={nextProfile} back={reduceMotion} behind />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[{ position: 'absolute', inset: 0 }, topCardStyle]}>
                <ProfileCard key={profile.id} profile={profile} onOpenProfile={() => openProfile(profile)} />
                <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, borderRightWidth: theme.spacing.x1, borderColor: theme.accent.onDark, alignItems: 'flex-end', justifyContent: 'center', paddingRight: theme.spacing.x5 }, bindStampStyle]}><View style={{ backgroundColor: darkPalette.overlay, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x2 }}><BinderText variant="title" style={{ color: theme.accent.onDark }}>{t('discovery.actions.bindStamp')}</BinderText></View></Animated.View>
                <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, borderLeftWidth: theme.spacing.x1, borderColor: semanticPalettes.dark.destructive, justifyContent: 'center', paddingLeft: theme.spacing.x5 }, passStampStyle]}><View style={{ alignSelf: 'flex-start', backgroundColor: darkPalette.overlay, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x2 }}><BinderText variant="title" style={{ color: semanticPalettes.dark.destructive }}>{t('discovery.actions.passStamp')}</BinderText></View></Animated.View>
              </Animated.View>
            </GestureDetector>
            <View style={{ position: 'absolute', top: theme.spacing.x3, right: theme.spacing.x3 }}><BinderIconButton name="safety" accessibilityLabel={t('discovery.accessibility.safetyOptions', { name: profile.name })} onPress={openSafety} /></View>
          </>
        )}
        {/* Last child, so plain paint order puts it over the cards — a zIndex
            here is a promise about layers that only holds inside this parent. */}
        {loadingVisible ? <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.canvas }}><DiscoveryLoading /></View> : null}
      </View>

      {error ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive" align="center" style={{ paddingHorizontal: theme.spacing.x5, paddingBottom: theme.spacing.x1 }}>{t(error.messageKey)}</BinderText> : null}
      <View style={{ minHeight: theme.layout.discoveryActionBarHeight, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: theme.spacing.x3, paddingBottom: theme.spacing.x3 }}>
        {/* Two buttons, one axis: a trailing spacer used to sit here and pushed
            the pair off the screen's centre line by half a button. */}
        <View style={{ width: theme.spacing.x16 }}><DiscoveryAction kind="pass" disabled={!profile || decisionPending || safetyOpen} onPressIn={() => previewDecision('left')} onPressOut={() => previewDecision(null)} onPress={() => void submitDecision('left')} /></View>
        <View style={{ width: theme.spacing.x16 }}><DiscoveryAction kind="bind" disabled={!profile || decisionPending || safetyOpen} onPressIn={() => previewDecision('right')} onPressOut={() => previewDecision(null)} onPress={() => void submitDecision('right')} /></View>
      </View>

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
          onApplied={(values) => { setFilterValues(values); setFiltersOpen(false); void withDeadline(loadAttributeFilterCount(), DISCOVERY_DEADLINE_MS).then(setAttributeFilterCount).catch(() => undefined); void loadDiscovery(false, values); }}
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

// behind: the card under the top one. It is decoration until it is dealt —
// its photo hot zones must not be reachable and a screen reader must not read
// a second person while the first one is on screen, which it did.
function ProfileCard({ profile, back = false, behind = false, onOpenProfile }: { profile: DiscoveryProfile; back?: boolean; behind?: boolean; onOpenProfile?: () => void }) {
  const { theme, locale, t } = useBinderTheme();
  const { width } = useWindowDimensions();
  const backCardOffset = width * discoveryDeckPhysics.backCardOffsetRatio;
  const photos = profile.photoUrls.length > 0 ? profile.photoUrls : [profile.photoUrl];
  // A photo is not a surface whose brightness the theme controls. In light mode
  // the card drew near-black text onto the dark scrim over the photo, which was
  // unreadable; text over media always comes from the dark palette.
  const onMedia = darkPalette;

  return (
    <View accessibilityElementsHidden={behind} importantForAccessibility={behind ? 'no-hide-descendants' : 'auto'} style={{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, transform: back ? [{ scale: discoveryDeckPhysics.backCardScale }, { translateY: backCardOffset }] : undefined, opacity: back ? discoveryDeckPhysics.backCardOpacity : 1 }}>
      <PhotoPager photos={photos} name={t('discovery.accessibility.profileSummary', { name: profile.name, age: formatCount(profile.age, locale), distance: formatDistanceKm(profile.distanceKm, locale) })} interactive={!back && !behind} onOpen={onOpenProfile ? () => onOpenProfile() : undefined} />
      <LinearGradient pointerEvents="none" colors={[theme.colors.transparent, theme.colors.scrim, theme.colors.overlay]} locations={[0, 0.52, 1]} style={{ position: 'absolute', inset: 0 }} />

      <View pointerEvents="none" style={{ position: 'absolute', left: theme.spacing.x5, right: theme.spacing.x5, bottom: theme.spacing.x5 }}>
        <BinderText variant="displayL" style={{ color: onMedia.textPrimary }} numberOfLines={1}>{profile.name} <BinderText variant="heading" style={{ color: onMedia.textPrimary }}>{formatCount(profile.age, locale)}</BinderText></BinderText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, marginTop: theme.spacing.x2, flexWrap: 'wrap' }}><BinderText variant="caption" style={{ color: onMedia.textSecondary }}>{t('discovery.profile.away', { distance: formatDistanceKm(profile.distanceKm, locale) })}</BinderText><VerifiedBadge onMedia label={t('discovery.profile.photosReviewedBadgeOther')} accessibilityLabel={t('discovery.profile.photosReviewedBadgeOther')} /></View>
        {profile.bio ? <BinderText variant="body" style={{ color: onMedia.textPrimary, marginTop: theme.spacing.x2 }} numberOfLines={2}>{profile.bio}</BinderText> : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x3, overflow: 'hidden' }}>
          {/* The same chips as on the full profile, emoji included — the card was
              the one place that dropped them, so the deck and the profile read
              as two different apps. The emoji never scales with the system font
              here: it sits in a pill on a photograph, and a doubled glyph would
              push the label out of it. */}
          {profile.tags.slice(0, 3).map((tag) => <View key={tag} style={{ maxWidth: '32%', flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x1, backgroundColor: theme.colors.overlay, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}>{interestEntry(tag)?.emoji ? <BinderText variant="caption" maxFontSizeMultiplier={1} importantForAccessibility="no" accessibilityElementsHidden>{interestEntry(tag)?.emoji}</BinderText> : null}<BinderText variant="caption" style={{ color: onMedia.textPrimary, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{interestLabel(t, tag)}</BinderText></View>)}
        </View>
      </View>
    </View>
  );
}
