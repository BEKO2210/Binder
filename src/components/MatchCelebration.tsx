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

// The match moment mirrors the Binder mark: two portraits joining. Both
// photos spring in from the sides with the celebratory preset, the copy
// follows a beat later. Reduced motion renders the settled state instantly.
export function MatchCelebration({ profile, myPhotoUrl, onSaySomething, onKeepDiscovering, busy = false }: Props) {
  const { theme, reduceMotion } = useBinderTheme();
  const { width } = useWindowDimensions();
  const spring = resolveSpring(reduceMotion, 'celebratory');
  const portrait = Math.min(176, width * 0.4);

  const leftX = useSharedValue(reduceMotion ? 0 : -width * 0.4);
  const rightX = useSharedValue(reduceMotion ? 0 : width * 0.4);
  const photoScale = useSharedValue(reduceMotion ? 1 : 0.72);
  const copyProgress = useSharedValue(reduceMotion ? 1 : 0);
  const glow = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    leftX.value = withSpring(0, spring);
    rightX.value = withSpring(0, spring);
    photoScale.value = withSpring(1, spring);
    glow.value = withTiming(1, { duration: motionDurations.context, easing: Easing.out(Easing.cubic) });
    copyProgress.value = withDelay(motionDurations.feedback, withTiming(1, { duration: motionDurations.entrance, easing: Easing.out(Easing.cubic) }));
  }, []);

  const leftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: leftX.value }, { scale: photoScale.value }, { rotate: '-6deg' }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: rightX.value }, { scale: photoScale.value }, { rotate: '6deg' }] }));
  const copyStyle = useAnimatedStyle(() => ({ opacity: copyProgress.value, transform: [{ translateY: (1 - copyProgress.value) * 14 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.55 }));

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.x6 }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: width * 1.2, height: width * 1.2, borderRadius: width, backgroundColor: theme.accent.accent, opacity: 0 }, glowStyle, { transform: [{ scale: 1 }] }]} />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.scrim }} pointerEvents="none" />

      <View style={{ width: '100%', maxWidth: 440, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: portrait + theme.spacing.x6 }}>
          <Animated.View style={[{ zIndex: 1 }, leftStyle]}>
            <Portrait uri={myPhotoUrl} size={portrait} borderColor={theme.colors.surface} fallbackLabel="You" />
          </Animated.View>
          <Animated.View style={[{ marginLeft: -theme.spacing.x6, zIndex: 2 }, rightStyle]}>
            <Portrait uri={profile.photoUrl} size={portrait} borderColor={theme.accent.accent} fallbackLabel={profile.name.slice(0, 1)} />
          </Animated.View>
        </View>

        <Animated.View style={[{ alignItems: 'center', width: '100%' }, copyStyle]}>
          <BinderText variant="micro" tone="accent" style={{ marginTop: theme.spacing.x6 }}>IT'S A BIND</BinderText>
          <BinderText variant="heading" align="center" style={{ marginTop: theme.spacing.x2 }}>You and {profile.name} chose each other.</BinderText>
          <BinderText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.x3 }}>No games. The conversation is open for both of you.</BinderText>
          <BinderButton label="Say something real" icon="send" loading={busy} onPress={onSaySomething} style={{ marginTop: theme.spacing.x6 }} />
          <BinderButton label="Keep discovering" variant="ghost" disabled={busy} onPress={onKeepDiscovering} style={{ marginTop: theme.spacing.x2 }} />
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
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, borderWidth: 3, borderColor, backgroundColor: theme.colors.surfaceElevated }} />;
}
