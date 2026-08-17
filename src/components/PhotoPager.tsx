import { useEffect, useState } from 'react';
import { Image, View, type DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { adjacentPhotoIndex, clampPhotoIndex, nextPhotoPage, photosToPreload, resistedPhotoTranslation } from '../lib/photoPager';
import { resolveSpring } from '../lib/motionPolicy';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderText, MotionPressable as Pressable } from './ui';

type Props = {
  photos: readonly string[];
  name: string;
  height?: DimensionValue;
  onOpen?: (index: number) => void;
  interactive?: boolean;
  onPageChange?: (index: number) => void;
  /**
   * Horizontal swipe pages the photos. Off inside the discovery deck, where the
   * horizontal gesture belongs to bind and pass and a photo swipe would fight
   * it; on everywhere the photo is the only thing under the thumb.
   */
  swipeable?: boolean;
  /** Which photo the pager opens on — a viewer opens on the one that was tapped. */
  initialIndex?: number;
  /** Cards crop to fill; a full-screen viewer shows the whole photo. */
  fit?: 'cover' | 'contain';
};

export function PhotoPager({ photos, name, height = '100%', onOpen, interactive = true, onPageChange, swipeable = false, initialIndex = 0, fit = 'cover' }: Props) {
  const { theme, reduceMotion } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [index, setIndex] = useState(() => clampPhotoIndex(initialIndex, photos.length));
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const page = useSharedValue(clampPhotoIndex(initialIndex, photos.length));
  const offset = useSharedValue(0);
  const spring = resolveSpring(reduceMotion, 'professional');
  const count = photos.length;

  useEffect(() => {
    for (const photo of photosToPreload(photos, index)) void Image.prefetch(photo).catch(() => undefined);
  }, [index, photos]);

  // A shorter gallery must never leave the track parked past its last page.
  useEffect(() => {
    if (index <= count - 1) return;
    const clamped = Math.max(0, count - 1);
    setIndex(clamped);
    page.value = clamped;
    offset.value = -clamped * width;
  }, [count, index, width]);

  function settle(next: number, animated: boolean) {
    'worklet';
    offset.value = animated ? withSpring(-next * width, spring) : -next * width;
  }

  function commit(next: number) {
    if (next === index) return;
    setIndex(next);
    onPageChange?.(next);
    void haptic('selection');
  }

  function move(direction: 'previous' | 'next') {
    const next = adjacentPhotoIndex(index, direction, count);
    if (next === index) return;
    page.value = next;
    if (reduceMotion || width === 0) offset.value = -next * width;
    else offset.value = withTiming(-next * width, { duration: theme.motion.standard });
    commit(next);
  }

  const swipe = Gesture.Pan()
    .enabled(swipeable && interactive && count > 1 && width > 0)
    .activeOffsetX([-theme.spacing.x2, theme.spacing.x2])
    .failOffsetY([-theme.spacing.x4, theme.spacing.x4])
    .onUpdate((event) => {
      offset.value = -page.value * width + resistedPhotoTranslation(page.value, event.translationX, count);
    })
    .onEnd((event) => {
      const next = nextPhotoPage(page.value, event.translationX, event.velocityX, width, count);
      page.value = next;
      settle(next, !reduceMotion);
      runOnJS(commit)(next);
    });

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const measured = width > 0;

  const content = (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((current) => {
          if (current === next) return current;
          // Keep the visible page pinned when the window changes size.
          offset.value = -page.value * next;
          return next;
        });
      }}
      accessibilityLabel={count > 1 ? `${name}, photo ${index + 1} of ${count}` : name}
      style={{ width: '100%', height, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' }}
    >
      {measured ? (
        <Animated.View style={[{ flexDirection: 'row', width: width * Math.max(count, 1), height: '100%' }, trackStyle]}>
          {photos.map((photo, position) => (
            <View key={`${position}-${photo}`} style={{ width, height: '100%', backgroundColor: fit === 'contain' ? theme.colors.canvas : theme.colors.surfaceElevated }}>
              {failed[position] ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.x5 }}>
                  <BinderText variant="caption" tone="muted" align="center">This photo could not be loaded.</BinderText>
                </View>
              ) : (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: photo }}
                  resizeMode={fit}
                  onError={() => setFailed((current) => ({ ...current, [position]: true }))}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </View>
          ))}
        </Animated.View>
      ) : null}

      {count > 1 ? (
        <View pointerEvents="none" accessibilityElementsHidden style={{ position: 'absolute', top: theme.spacing.x3, left: theme.spacing.x3, right: theme.spacing.x3, flexDirection: 'row', gap: theme.spacing.x1 }}>
          {photos.map((photo, segment) => <View key={`${segment}-${photo}`} style={{ flex: 1, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: segment <= index ? theme.accent.accent : theme.colors.scrim }} />)}
        </View>
      ) : null}

      {/* Hot zones over a photo carry no surface and no scale: the photo is the
          subject, and a grey rectangle flashing over a third of it is not
          feedback, it is damage. */}
      {interactive && count > 1 ? <Pressable pressedSurface={false} pressScale={false} accessibilityRole="button" accessibilityLabel={`Previous photo of ${name}`} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => move('previous')} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, left: 0, width: '33.333%', minWidth: theme.layout.minimumTouchTarget }} /> : null}
      {interactive && onOpen ? <Pressable pressedSurface={false} pressScale={false} accessibilityRole="button" accessibilityLabel={`Open full profile for ${name}`} onPress={() => onOpen(index)} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, left: count > 1 ? '33.333%' : 0, right: count > 1 ? '33.333%' : 0, minWidth: theme.layout.minimumTouchTarget }} /> : null}
      {interactive && count > 1 ? <Pressable pressedSurface={false} pressScale={false} accessibilityRole="button" accessibilityLabel={`Next photo of ${name}`} accessibilityState={{ disabled: index === count - 1 }} disabled={index === count - 1} onPress={() => move('next')} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, right: 0, width: '33.333%', minWidth: theme.layout.minimumTouchTarget }} /> : null}
    </View>
  );

  if (!swipeable) return content;
  return <GestureDetector gesture={swipe}>{content}</GestureDetector>;
}
