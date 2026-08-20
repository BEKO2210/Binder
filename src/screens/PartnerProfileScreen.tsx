import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { VerifiedBadge } from '../components/VerifiedBadge';
import { PhotoPager } from '../components/PhotoPager';
import { BinderIcon, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import type { DiscoveryProfile } from '../lib/discovery';
import { discoveryDeckPhysics } from '../lib/discoveryDeck';
import { fetchPartnerProfile, type PartnerProfile } from '../lib/partnerProfile';
import { EMPTY_ATTRIBUTES } from '../lib/profileAttributes';
import { ProfileAttributeList } from '../components/ProfileAttributeList';
import { VoiceMessageBubble } from '../components/VoiceMessageBubble';
import { formatCount, formatDistanceKm } from '../lib/format';
import { interestEntry } from '../lib/interestCatalog';
import { interestLabel } from '../lib/validation';
import { resolveSpring } from '../lib/motionPolicy';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

// `viewingSelf` is what the profile tab passes when somebody previews their own
// profile through this same screen. The only thing that has to change is the
// distance: the server answers 0 km to yourself, and "0 km away" under your own
// name reads like a bug.
type Props = { userId: string; fallbackName: string; onClose: () => void; initialProfile?: DiscoveryProfile; viewingSelf?: boolean };

function asPartnerProfile(profile: DiscoveryProfile): PartnerProfile {
  // The deck row carries no attributes; the full fetch that follows fills them
  // in, and until then the screen simply shows none rather than wrong ones.
  return { userId: profile.id, name: profile.name, age: profile.age, bio: profile.bio, interests: profile.tags, distanceKm: profile.distanceKm, photoUrls: profile.photoUrls, attributes: EMPTY_ATTRIBUTES, zodiac: null, voiceIntro: null };
}

export default function PartnerProfileScreen({ userId, fallbackName, onClose, initialProfile, viewingSelf = false }: Props) {
  const { theme, reduceMotion, locale, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const { width, height } = useWindowDimensions();
  const [profile, setProfile] = useState<PartnerProfile | null>(() => initialProfile ? asPartnerProfile(initialProfile) : null);
  const [error, setError] = useState('');
  const dismissY = useSharedValue(0);
  const dismissThreshold = height * discoveryDeckPhysics.distanceRatio;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);

  useEffect(() => {
    let active = true;
    // A profile belongs to exactly one person. Keeping the previous one on
    // screen while the next one loads shows somebody else's photos and bio
    // under the name of the person who was actually opened — on a dating app
    // that is the wrong face against the wrong conversation. The head start
    // from the deck only counts when it is the same person.
    setProfile(initialProfile && initialProfile.id === userId ? asPartnerProfile(initialProfile) : null);
    setError('');
    fetchPartnerProfile(userId)
      .then((next) => { if (active) setProfile(next); })
      .catch((cause) => { if (active && !initialProfile) setError(cause instanceof Error ? cause.message : t('partnerProfile.errors.load')); });
    return () => { active = false; };
  }, [initialProfile, userId]);

  // Tapping a photograph opens it on its own, the way every gallery works.
  // Until now a tap did nothing here: the picture was decoration under a
  // profile instead of something you could actually look at.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const heroHeight = Math.min(theme.layout.contentMaxWidth, width + theme.spacing.x12);
  // Resolved here, not inside the gesture. Calling a plain function from a
  // worklet kills the process — the spring-back branch did exactly that, which
  // is why a full swipe closed cleanly and a half one crashed. PhotoPager and
  // DiscoveryScreen have always resolved it out here; this screen was the
  // exception.
  const dismissSpring = resolveSpring(reduceMotion, 'professional');
  const dismissStyle = useAnimatedStyle(() => ({ transform: [{ translateY: reduceMotion ? 0 : dismissY.value }] }));
  const dismissGesture = Gesture.Pan()
    // Eight pixels was enough to start closing the screen, so scrolling a
    // profile kept dismissing it by accident. Closing is a deliberate pull —
    // there is a back arrow and the hardware back button for the ordinary way
    // out, and neither of those can be triggered by reading.
    .activeOffsetY(theme.spacing.x12)
    .failOffsetX([-theme.spacing.x6, theme.spacing.x6])
    .onUpdate((event) => { dismissY.value = Math.max(0, event.translationY); })
    .onEnd((event) => {
      const projected = event.translationY + event.velocityY * discoveryDeckPhysics.projectionSeconds;
      if (projected >= dismissThreshold) {
        runOnJS(haptic)('selection');
        runOnJS(onClose)();
      } else dismissY.value = withSpring(0, dismissSpring);
    });

  if (profile && viewerIndex !== null && profile.photoUrls.length > 0) {
    const safeIndex = Math.min(Math.max(viewerIndex, 0), profile.photoUrls.length - 1);
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <BinderScreenHeader
          title={profile.photoUrls.length > 1 ? t('partnerProfile.gallery.photoOf', { current: formatCount(safeIndex + 1, locale), total: formatCount(profile.photoUrls.length, locale) }) : t('partnerProfile.gallery.photo')}
          leading={{ icon: 'close', accessibilityLabel: t('partnerProfile.accessibility.closePhoto'), onPress: () => setViewerIndex(null) }}
        />
        <PhotoPager
          photos={profile.photoUrls}
          name={profile.name}
          height="100%"
          fit="contain"
          swipeable
          initialIndex={safeIndex}
          onPageChange={setViewerIndex}
        />
        {/* One photograph, on its own: the round mark, and the singular. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: theme.spacing.x8, alignItems: 'center' }}>
          <VerifiedBadge onMedia mark="disc" label={t('partnerProfile.photosReviewedOne')} accessibilityLabel={t('partnerProfile.photosReviewedOne')} />
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={dismissGesture}>
      <Animated.View style={[{ flex: 1, backgroundColor: theme.colors.canvas }, dismissStyle]}>
        <BinderScreenHeader title={profile?.name ?? fallbackName} centered leading={{ icon: 'back', accessibilityLabel: t('partnerProfile.accessibility.close'), onPress: onClose }} />
        {error ? <ScreenState kind="error" icon="retry" title={t('partnerProfile.errors.title')} message={error} actionLabel={t('partnerProfile.actions.back')} onAction={onClose} /> : !profile ? <ScreenState kind="loading" message={t('partnerProfile.loading')} /> : (
          <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.standard)} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing.x12 }}>
              {profile.photoUrls.length > 0 ? <PhotoPager photos={profile.photoUrls} name={profile.name} height={heroHeight} swipeable onOpen={(index) => setViewerIndex(index)} /> : (
                <View style={{ height: heroHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceElevated }}><BinderText variant="heading" tone="accent">{(profile.name || fallbackName).slice(0, 1)}</BinderText></View>
              )}
              <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, flexWrap: 'wrap' }}>
                  <BinderText variant="displayL">{profile.name} <BinderText variant="heading">{formatCount(profile.age, locale)}</BinderText></BinderText>
                  <VerifiedBadge label={t(profile.photoUrls.length === 1 ? 'partnerProfile.photosReviewedOne' : 'partnerProfile.photosReviewedOther')} accessibilityLabel={t('partnerProfile.accessibility.photosReviewed')} />
                </View>
                {profile.distanceKm !== null && !viewingSelf ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>{t('partnerProfile.away', { distance: formatDistanceKm(profile.distanceKm, locale) })}</BinderText> : null}
                {profile.bio ? <BinderText variant="bodyL" tone="secondary" style={{ marginTop: theme.spacing.x4 }}>{profile.bio}</BinderText> : null}
                {profile.interests.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x5 }}>{profile.interests.map((interest) => <View key={interest} accessibilityRole="text" style={{ minHeight: theme.layout.minimumTouchTarget, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, paddingHorizontal: theme.spacing.x4, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>{interestEntry(interest)?.emoji ? <BinderText variant="label" maxFontSizeMultiplier={1} importantForAccessibility="no" accessibilityElementsHidden>{interestEntry(interest)?.emoji}</BinderText> : null}<BinderText variant="label" tone="secondary" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>{interestLabel(t, interest)}</BinderText></View>)}</View> : null}
                {profile.voiceIntro ? (
                  <View style={{ marginTop: theme.spacing.x5, padding: theme.spacing.x3, borderRadius: theme.radii.control, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
                    <BinderText variant="micro" tone="muted" style={{ marginBottom: theme.spacing.x2 }}>{t('identity.voiceIntro.title')}</BinderText>
                    <VoiceMessageBubble messageId={`intro-${profile.userId}`} audioPath={profile.voiceIntro.path} durationMs={profile.voiceIntro.durationMs} mine={false} bucket="profile-voice" />
                  </View>
                ) : null}
                <View style={{ marginTop: theme.spacing.x5 }}>
                  <ProfileAttributeList attributes={profile.attributes} zodiac={profile.zodiac} />
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
