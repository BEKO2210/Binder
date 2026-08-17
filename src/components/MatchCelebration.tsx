import { useEffect } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import type { DiscoveryProfile } from '../lib/discovery';
import { motionDurations, resolveSpring } from '../lib/motionPolicy';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderButton, BinderText } from './ui';

type Props = {
  profile: DiscoveryProfile;
  myPhotoUrl: string | null;
  onSaySomething: () => void;
  onKeepDiscovering: () => void;
  busy?: boolean;
};

// One confirmation beat: the joined portraits settle together, then the copy
// arrives. Reduced motion renders the same meaningful settled state instantly.
export function MatchCelebration({ profile, myPhotoUrl, onSaySomething, onKeepDiscovering, busy = false }: Props) {
  const { theme, reduceMotion, t } = useBinderTheme();
  const { width } = useWindowDimensions();
  const spring = resolveSpring(reduceMotion, 'celebratory');
  const portrait = Math.min(176, width * 0.4);

  const photoScale = useSharedValue(reduceMotion ? 1 : 0.84);
  const copyProgress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    photoScale.value = withSpring(1, spring);
    copyProgress.value = withDelay(motionDurations.standard, withTiming(1, { duration: motionDurations.deliberate, easing: Easing.out(Easing.cubic) }));
  }, []);

  const photoStyle = useAnimatedStyle(() => ({ opacity: photoScale.value, transform: [{ scale: photoScale.value }] }));
  const copyStyle = useAnimatedStyle(() => ({ opacity: copyProgress.value, transform: [{ translateY: (1 - copyProgress.value) * 14 }] }));

  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.x6 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.scrim }} pointerEvents="none" />

      <View style={{ width: '100%', maxWidth: 440, alignItems: 'center' }}>
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: portrait + theme.spacing.x6 }, photoStyle]}>
          <View style={{ zIndex: 1 }}>
            <Portrait uri={myPhotoUrl} size={portrait} borderColor={theme.colors.surface} fallbackLabel={t('matchCelebration.fallback.you')} />
          </View>
          <View style={{ marginLeft: -theme.spacing.x6, zIndex: 2 }}>
            <Portrait uri={profile.photoUrl} size={portrait} borderColor={theme.accent.accent} fallbackLabel={profile.name.slice(0, 1)} />
          </View>
        </Animated.View>

        <Animated.View style={[{ alignItems: 'center', width: '100%' }, copyStyle]}>
          <BinderText variant="micro" tone="accent" style={{ marginTop: theme.spacing.x6 }}>{t('matchCelebration.copy.eyebrow')}</BinderText>
          <BinderText variant="heading" align="center" style={{ marginTop: theme.spacing.x2 }}>{t('matchCelebration.copy.title', { name: profile.name })}</BinderText>
          <BinderText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.x3 }}>{t('matchCelebration.copy.message')}</BinderText>
          <BinderButton label={t('matchCelebration.actions.saySomething')} icon="send" loading={busy} onPress={onSaySomething} style={{ marginTop: theme.spacing.x6 }} />
          <BinderButton label={t('matchCelebration.actions.keepDiscovering')} variant="ghost" disabled={busy} onPress={onKeepDiscovering} style={{ marginTop: theme.spacing.x2 }} />
        </Animated.View>
      </View>
    </View>
  );
}

function Portrait({ uri, size, borderColor, fallbackLabel }: { uri: string | null; size: number; borderColor: string; fallbackLabel: string }) {
  const { theme } = useBinderTheme();
  const radius = size * 0.32;
  if (!uri) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, borderWidth: 3, borderColor, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
        <BinderText variant="heading" tone="accent">{fallbackLabel}</BinderText>
      </View>
    );
  }
  return <Image source={{ uri }} resizeMethod="resize" style={{ width: size, height: size, borderRadius: radius, borderWidth: 3, borderColor, backgroundColor: theme.colors.surfaceElevated }} />;
}
