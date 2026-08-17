import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PhotoPager } from '../components/PhotoPager';
import { BinderIcon, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import type { DiscoveryProfile } from '../lib/discovery';
import { discoveryDeckPhysics } from '../lib/discoveryDeck';
import { fetchPartnerProfile, type PartnerProfile } from '../lib/partnerProfile';
import { resolveSpring } from '../lib/motionPolicy';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { userId: string; fallbackName: string; onClose: () => void; initialProfile?: DiscoveryProfile };

function asPartnerProfile(profile: DiscoveryProfile): PartnerProfile {
  return { userId: profile.id, name: profile.name, age: profile.age, bio: profile.bio, interests: profile.tags, distanceKm: profile.distanceKm, photoUrls: profile.photoUrls };
}

export default function PartnerProfileScreen({ userId, fallbackName, onClose, initialProfile }: Props) {
  const { theme, reduceMotion, t } = useBinderTheme();
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
    fetchPartnerProfile(userId)
      .then((next) => { if (active) setProfile(next); })
      .catch((cause) => { if (active && !initialProfile) setError(cause instanceof Error ? cause.message : t('partnerProfile.errors.load')); });
    return () => { active = false; };
  }, [initialProfile, userId]);

  const heroHeight = Math.min(theme.layout.contentMaxWidth, width + theme.spacing.x12);
  const dismissStyle = useAnimatedStyle(() => ({ transform: [{ translateY: reduceMotion ? 0 : dismissY.value }] }));
  const dismissGesture = Gesture.Pan()
    .activeOffsetY(theme.spacing.x2)
    .failOffsetX([-theme.spacing.x6, theme.spacing.x6])
    .onUpdate((event) => { dismissY.value = Math.max(0, event.translationY); })
    .onEnd((event) => {
      const projected = event.translationY + event.velocityY * discoveryDeckPhysics.projectionSeconds;
      if (projected >= dismissThreshold) {
        runOnJS(haptic)('selection');
        runOnJS(onClose)();
      } else dismissY.value = withSpring(0, resolveSpring(reduceMotion, 'professional'));
    });

  return (
    <GestureDetector gesture={dismissGesture}>
      <Animated.View style={[{ flex: 1, backgroundColor: theme.colors.canvas }, dismissStyle]}>
        <BinderScreenHeader title={profile?.name ?? fallbackName} centered leading={{ icon: 'back', accessibilityLabel: t('partnerProfile.accessibility.close'), onPress: onClose }} />
        {error ? <ScreenState kind="error" icon="retry" title={t('partnerProfile.errors.title')} message={error} actionLabel={t('partnerProfile.actions.back')} onAction={onClose} /> : !profile ? <ScreenState kind="loading" message={t('partnerProfile.loading')} /> : (
          <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.standard)} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing.x12 }}>
              {profile.photoUrls.length > 0 ? <PhotoPager photos={profile.photoUrls} name={profile.name} height={heroHeight} swipeable /> : (
                <View style={{ height: heroHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceElevated }}><BinderText variant="heading" tone="accent">{(profile.name || fallbackName).slice(0, 1)}</BinderText></View>
              )}
              <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, flexWrap: 'wrap' }}>
                  <BinderText variant="displayL">{profile.name} <BinderText variant="heading">{profile.age}</BinderText></BinderText>
                  <View accessibilityLabel={t('partnerProfile.accessibility.photosReviewed')} style={{ minHeight: theme.layout.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, paddingHorizontal: theme.spacing.x3, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }}><BinderIcon name="check" color={theme.accent.onSurface} /><BinderText variant="caption" tone="secondary">{t('partnerProfile.photosReviewed')}</BinderText></View>
                </View>
                {profile.distanceKm !== null ? <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>{t('partnerProfile.away', { distance: profile.distanceKm })}</BinderText> : null}
                {profile.bio ? <BinderText variant="bodyL" tone="secondary" style={{ marginTop: theme.spacing.x4 }}>{profile.bio}</BinderText> : null}
                {profile.interests.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x5 }}>{profile.interests.map((interest) => <View key={interest} accessibilityRole="text" style={{ minHeight: theme.layout.minimumTouchTarget, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: theme.spacing.x4, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}><BinderText variant="label" tone="secondary" numberOfLines={1} ellipsizeMode="tail">{interest}</BinderText></View>)}</View> : null}
              </View>
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
