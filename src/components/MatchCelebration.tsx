import { useEffect } from 'react';
import { Image, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import type { DiscoveryProfile } from '../lib/discovery';
import { resolveMatchCelebrationLayout } from '../lib/matchCelebrationLayout';
import { resolveStaggerDelay } from '../lib/motionPolicy';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderButton, BinderText } from './ui';

type Props = {
  profile: DiscoveryProfile;
  myPhotoUrl: string | null;
  onSaySomething: () => void;
  onKeepDiscovering: () => void;
  busy?: boolean;
};

// One upward entrance, expressed as three staggered beats. Reduced motion
// renders the same meaningful settled state instantly.
export function MatchCelebration({ profile, myPhotoUrl, onSaySomething, onKeepDiscovering, busy = false }: Props) {
  const { theme, reduceMotion, t } = useBinderTheme();
  const { width, height } = useWindowDimensions();
  const fixedContentHeight = theme.typography.micro.lineHeight
    + theme.typography.heading.lineHeight * 2
    + theme.typography.body.lineHeight * 2
    + theme.layout.controlHeight * 2
    + theme.spacing.x6 * 2
    + theme.spacing.x3
    + theme.spacing.x2 * 2;
  const celebrationLayout = resolveMatchCelebrationLayout({
    screenWidth: width,
    screenHeight: height,
    horizontalPadding: theme.spacing.x6,
    verticalPadding: theme.spacing.x6,
    portraitGap: theme.spacing.x6,
    portraitMaxSize: theme.layout.matchPortraitMaxSize,
    portraitMinSize: theme.layout.matchPortraitMinSize,
    fixedContentHeight,
  });

  const photoProgress = useSharedValue(reduceMotion ? 1 : 0);
  const headingProgress = useSharedValue(reduceMotion ? 1 : 0);
  const actionsProgress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      photoProgress.value = 1;
      headingProgress.value = 1;
      actionsProgress.value = 1;
      return;
    }
    const entrance = (index: number) => withDelay(
      resolveStaggerDelay(index, false),
      withTiming(1, { duration: theme.motion.entrance, easing: Easing.out(Easing.cubic) }),
    );
    photoProgress.value = entrance(0);
    headingProgress.value = entrance(1);
    actionsProgress.value = entrance(2);
  }, [actionsProgress, headingProgress, photoProgress, reduceMotion, theme.motion.entrance]);

  const photoStyle = useAnimatedStyle(() => ({ opacity: photoProgress.value, transform: [{ translateY: (1 - photoProgress.value) * theme.spacing.x3 }] }));
  const headingStyle = useAnimatedStyle(() => ({ opacity: headingProgress.value, transform: [{ translateY: (1 - headingProgress.value) * theme.spacing.x3 }] }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actionsProgress.value, transform: [{ translateY: (1 - actionsProgress.value) * theme.spacing.x3 }] }));

  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.scrim }} pointerEvents="none" />

      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.x6 }} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={{ width: '100%', maxWidth: theme.layout.modalContentMaxWidth, alignItems: 'center' }}>
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.x6 }, photoStyle]}>
            <Portrait uri={myPhotoUrl} size={celebrationLayout.portraitSize} borderColor={theme.colors.surface} fallbackLabel={t('matchCelebration.fallback.you')} />
            <Portrait uri={profile.photoUrl} size={celebrationLayout.portraitSize} borderColor={theme.accent.accent} fallbackLabel={profile.name.slice(0, 1)} />
          </Animated.View>

          <Animated.View style={[{ alignItems: 'center', width: '100%' }, headingStyle]}>
            <BinderText variant="micro" tone="accent" style={{ marginTop: theme.spacing.x6 }}>{t('matchCelebration.copy.eyebrow')}</BinderText>
            <BinderText variant="heading" align="center" style={{ marginTop: theme.spacing.x2 }}>{t('matchCelebration.copy.title', { name: profile.name })}</BinderText>
            <BinderText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.x3 }}>{t('matchCelebration.copy.message')}</BinderText>
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', width: '100%' }, actionsStyle]}>
            <BinderButton label={t('matchCelebration.actions.saySomething')} icon="send" loading={busy} onPress={onSaySomething} style={{ marginTop: theme.spacing.x6 }} />
            {/* Never disabled: this is the only way out of the celebration, and
                on a slow network the button above waits for the server. A way
                out that is switched off while something waits is a trap — the
                only escape left was the system back gesture. */}
            <BinderButton label={t('matchCelebration.actions.keepDiscovering')} variant="ghost" onPress={onKeepDiscovering} style={{ marginTop: theme.spacing.x2 }} />
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

function Portrait({ uri, size, borderColor, fallbackLabel }: { uri: string | null; size: number; borderColor: string; fallbackLabel: string }) {
  const { theme } = useBinderTheme();
  const radius = size * 0.32;
  if (!uri) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, borderWidth: theme.layout.mediaBorderWidth, borderColor, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
        <BinderText variant="heading" tone="accent">{fallbackLabel}</BinderText>
      </View>
    );
  }
  return <Image source={{ uri }} resizeMethod="resize" style={{ width: size, height: size, borderRadius: radius, borderWidth: theme.layout.mediaBorderWidth, borderColor, backgroundColor: theme.colors.surfaceElevated }} />;
}
