import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, Dimensions, ImageBackground, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { MatchCelebration } from '../components/MatchCelebration';
import { BinderBrand, BinderButton, BinderCard, BinderIcon, BinderIconButton, BinderText, ScreenState } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { fetchDiscoveryBatch, recordDecision, refreshDiscoveryLocation, type DiscoveryProfile } from '../lib/discovery';
import { listMyProfileMedia } from '../lib/media';
import { resolveSpring } from '../lib/motionPolicy';
import { reportAndBlockDiscoveryProfile, type DiscoveryReportReason } from '../lib/safety';
import PartnerProfileScreen from './PartnerProfileScreen';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.24;
const SWIPE_OUT = SCREEN_WIDTH * 1.35;
// Research-backed release rule: distance OR velocity commits the swipe.
const FLING_VELOCITY = 900;

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
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyReason, setSafetyReason] = useState<DiscoveryReportReason | null>(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
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
    let active = true;
    listMyProfileMedia()
      .then((media) => { if (active) setMyPhotoUrl(media[0]?.signedUrl ?? null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!viewingProfile && !match && !safetyOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewingProfile) setViewingProfile(null);
      else if (safetyOpen) { setSafetyOpen(false); setSafetyReason(null); }
      else setMatch(null);
      return true;
    });
    return () => subscription.remove();
  }, [viewingProfile, match, safetyOpen]);

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
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-13, 0, 13], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const bindStampStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP) }));
  const passStampStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP) }));
  // The card underneath grows toward full size as the top card leaves.
  const backCardStyle = useAnimatedStyle(() => {
    const progress = interpolate(Math.abs(x.value), [0, SWIPE_THRESHOLD * 1.6], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(progress, [0, 1], [0.62, 1]),
      transform: [
        { scale: interpolate(progress, [0, 1], [0.965, 1]) },
        { translateY: interpolate(progress, [0, 1], [10, 0]) },
      ],
    };
  });

  function springBack() {
    if (reduceMotion) {
      x.value = 0;
      y.value = 0;
      return;
    }
    x.value = withSpring(0, spring);
    y.value = withSpring(0, spring);
  }

  function finishDismiss(current: DiscoveryProfile, matched: boolean) {
    setProfiles((value) => value.slice(1));
    if (matched) setMatch(current);
    // Reset only after React committed the new top card — resetting in the
    // same frame flashed the dismissed card back to center.
    requestAnimationFrame(() => {
      x.value = 0;
      y.value = 0;
      setDecisionPending(false);
    });
  }

  // The card flies out immediately for instant feel; it is only REMOVED from
  // the stack after the server confirms. On failure it springs back in.
  async function submitDecision(direction: 'left' | 'right') {
    if (!profile || decisionPending || safetyOpen) return;
    const current = profile;
    setDecisionPending(true);
    setError('');
    if (reduceMotion) {
      x.value = direction === 'right' ? SWIPE_OUT : -SWIPE_OUT;
    } else {
      x.value = withTiming(direction === 'right' ? SWIPE_OUT : -SWIPE_OUT, { duration: theme.motion.deliberate });
    }
    try {
      const result = await recordDecision(current.id, direction === 'right' ? 'bind' : 'pass');
      if (result.matched) await haptic('match');
      else await haptic(direction === 'right' ? 'bind' : 'selection');
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
    .activeOffsetX([-8, 8])
    .onUpdate((event) => {
      x.value = event.translationX;
      y.value = reduceMotion ? 0 : event.translationY * 0.18;
    })
    .onEnd((event) => {
      const commitRight = x.value > SWIPE_THRESHOLD || event.velocityX > FLING_VELOCITY;
      const commitLeft = x.value < -SWIPE_THRESHOLD || event.velocityX < -FLING_VELOCITY;
      if (commitRight) runOnJS(submitFromGesture)('right');
      else if (commitLeft) runOnJS(submitFromGesture)('left');
      else {
        x.value = withSpring(0, spring);
        y.value = withSpring(0, spring);
      }
    });

  function submitFromGesture(direction: 'left' | 'right') {
    void submitDecision(direction);
  }

  if (loading && profiles.length === 0) return <ScreenState kind="loading" message="Finding people who fit both sides…" />;
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
        {decisionPending ? <BinderText variant="caption" tone="accent">Saving decision…</BinderText> : null}
      </View>

      <View style={{ flex: 1, marginHorizontal: theme.spacing.x4, marginTop: theme.spacing.x1, marginBottom: theme.spacing.x3, justifyContent: 'center' }}>
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
                <ProfileCard profile={nextProfile} back={reduceMotion} />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[{ position: 'absolute', inset: 0 }, topCardStyle]}>
                <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${profile.name}'s full profile`} onPress={() => { if (!decisionPending && !safetyOpen) setViewingProfile(profile); }}>
                  <ProfileCard profile={profile} />
                </Pressable>
                {!reduceMotion ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: theme.spacing.x8, left: theme.spacing.x6, borderWidth: 2, borderColor: theme.accent.accent, borderRadius: theme.radii.small, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2, transform: [{ rotate: '-8deg' }] }, bindStampStyle]}><BinderText variant="title" tone="accent">BIND</BinderText></Animated.View> : null}
                {!reduceMotion ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: theme.spacing.x8, right: theme.spacing.x6, borderWidth: 2, borderColor: theme.semantic.destructive, borderRadius: theme.radii.small, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2, transform: [{ rotate: '8deg' }] }, passStampStyle]}><BinderText variant="title" tone="destructive">PASS</BinderText></Animated.View> : null}
              </Animated.View>
            </GestureDetector>
            <View style={{ position: 'absolute', top: theme.spacing.x3, right: theme.spacing.x3 }}><BinderIconButton name="safety" accessibilityLabel={`Safety options for ${profile.name}`} onPress={openSafety} /></View>
          </>
        )}
      </View>

      {error ? <BinderText variant="caption" tone="destructive" align="center" style={{ paddingHorizontal: theme.spacing.x5, paddingBottom: theme.spacing.x1 }}>{error}</BinderText> : null}
      <View style={{ minHeight: 82, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: theme.spacing.x6, paddingBottom: theme.spacing.x3 }}>
        <DiscoveryAction kind="pass" disabled={!profile || decisionPending || safetyOpen} onPress={() => void submitDecision('left')} />
        <DiscoveryAction kind="bind" disabled={!profile || decisionPending || safetyOpen} onPress={() => void submitDecision('right')} />
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
  const { theme } = useBinderTheme();
  const bind = kind === 'bind';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={bind ? 'Bind profile' : 'Pass profile'} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: bind ? theme.accent.accent : theme.colors.surface, borderWidth: 1, borderColor: bind ? theme.accent.accent : theme.colors.borderStrong, opacity: disabled ? 0.42 : pressed ? 0.78 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <BinderIcon name={bind ? 'matches' : 'close'} size={bind ? 28 : 30} color={bind ? theme.accent.foreground : theme.semantic.destructive} />
    </Pressable>
  );
}

function ProfileCard({ profile, back = false }: { profile: DiscoveryProfile; back?: boolean }) {
  const { theme } = useBinderTheme();
  return (
    <View style={{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, transform: back ? [{ scale: 0.965 }, { translateY: 10 }] : undefined, opacity: back ? 0.62 : 1 }}>
      <ImageBackground source={{ uri: profile.photoUrl }} style={{ flex: 1, justifyContent: 'flex-end' }} imageStyle={{ borderRadius: theme.radii.hero }}>
        <View style={{ padding: theme.spacing.x5, paddingTop: 150, backgroundColor: theme.colors.scrim }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.overlay, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2, marginBottom: theme.spacing.x2 }}><BinderText variant="caption" style={{ color: theme.colors.textPrimary }}>{profile.distanceKm} km away</BinderText></View>
          <BinderText variant="displayL" style={{ color: theme.colors.textPrimary }}>{profile.name} <BinderText variant="heading" style={{ color: theme.colors.textPrimary }}>{profile.age}</BinderText></BinderText>
          <BinderText variant="body" style={{ color: theme.colors.textPrimary, marginTop: theme.spacing.x2, maxWidth: '92%' }}>{profile.bio}</BinderText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>{profile.tags.map((tag) => <View key={tag} style={{ backgroundColor: theme.colors.overlay, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x2 }}><BinderText variant="caption" style={{ color: theme.colors.textPrimary }}>{tag}</BinderText></View>)}</View>
        </View>
      </ImageBackground>
    </View>
  );
}
