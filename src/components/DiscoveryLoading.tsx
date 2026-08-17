import { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderText } from './ui';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export function DiscoveryLoading({ compact = false }: { compact?: boolean }) {
  const { theme, reduceMotion } = useBinderTheme();
  const shimmer = useSharedValue(reduceMotion ? 0.5 : 0);
  const orbit = useSharedValue(reduceMotion ? 0 : 0);

  useEffect(() => {
    if (reduceMotion) { shimmer.value = 0.5; orbit.value = 0; return; }
    shimmer.value = withRepeat(withTiming(1, { duration: theme.motion.context * 4, easing: Easing.linear }), -1, false);
    orbit.value = withRepeat(withTiming(1, { duration: theme.motion.context * 8, easing: Easing.linear }), -1, false);
  }, [reduceMotion, theme.motion.context]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-360, 360]) }, { rotate: '-14deg' }] }));
  const firstStyle = useAnimatedStyle(() => {
    const angle = orbit.value * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(angle) * 70 }, { translateY: Math.sin(angle) * 30 }] };
  });
  const secondStyle = useAnimatedStyle(() => {
    const angle = orbit.value * Math.PI * 2 * 0.92;
    return { transform: [{ translateX: Math.cos(-angle) * 70 }, { translateY: Math.sin(-angle) * 42 }] };
  });
  const contactStyle = useAnimatedStyle(() => {
    const distance = Math.min(orbit.value, 1 - orbit.value);
    return { opacity: interpolate(distance, [0, 0.025, 0.075], [1, 0.7, 0]), transform: [{ scale: interpolate(distance, [0, 0.075], [1.8, 1]) }] };
  });
  const ringStyle = useAnimatedStyle(() => {
    const distance = Math.min(orbit.value, 1 - orbit.value);
    return { opacity: interpolate(distance, [0, 0.09], [0.72, 0]), transform: [{ scale: interpolate(distance, [0, 0.09], [0.45, 2.2]) }] };
  });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: compact ? 0 : theme.spacing.x4 }} accessibilityRole="progressbar" accessibilityLabel="Finding people">
      <View style={{ width: '100%', height: compact ? undefined : '68%', minHeight: compact ? undefined : 360, flex: compact ? 1 : undefined, borderRadius: theme.radii.hero, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle }}>
        <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated }}>
          <AnimatedGradient colors={[theme.colors.surfaceElevated, theme.colors.surfacePressed, theme.colors.surfaceElevated]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ position: 'absolute', top: -100, bottom: -100, width: 220 }, sweepStyle]} />
        </View>
        <View style={{ height: 150, padding: theme.spacing.x5, gap: theme.spacing.x3, backgroundColor: theme.colors.surface }}>
          <View style={{ width: '32%', height: theme.spacing.x6, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} />
          <View style={{ width: '68%', height: theme.spacing.x5, borderRadius: theme.radii.small, backgroundColor: theme.colors.surfaceElevated }} />
          <View style={{ width: '88%', height: theme.spacing.x3, borderRadius: theme.radii.small, backgroundColor: theme.colors.surfaceElevated }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '36%', height: 120, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', width: theme.spacing.x3, height: theme.spacing.x3, borderRadius: theme.radii.pill, backgroundColor: theme.colors.textPrimary }, firstStyle]} />
          <Animated.View style={[{ position: 'absolute', width: theme.spacing.x3, height: theme.spacing.x3, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent }, secondStyle]} />
          <Animated.View style={[{ position: 'absolute', width: theme.spacing.x4, height: theme.spacing.x4, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent }, contactStyle]} />
          <Animated.View style={[{ position: 'absolute', width: theme.spacing.x8, height: theme.spacing.x8, borderRadius: theme.radii.pill, borderWidth: 2, borderColor: theme.accent.accent }, ringStyle]} />
        </View>
      </View>
      <BinderText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.x5 }}>Finding people who fit both sides…</BinderText>
    </View>
  );
}
