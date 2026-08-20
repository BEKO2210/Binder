import { useEffect, useState } from 'react';
import { Image, View, type DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { coverCrop } from '../lib/photoCrop';
import { adjacentPhotoIndex, clampPhotoIndex, nextPhotoPage, photoCounterDurations, photoCounterLabel, photoLoadDeadlineMs, photosToPreload, photoStatusAfter, resistedPhotoTranslation, type PhotoLoadEvent, type PhotoLoadStatus } from '../lib/photoPager';
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
  const { theme, reduceMotion, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [index, setIndex] = useState(() => clampPhotoIndex(initialIndex, photos.length));
  const [width, setWidth] = useState(0);
  const [boxHeight, setBoxHeight] = useState(0);
  // What the photo itself measures, reported by the first successful load. A
  // crop cannot be placed before that is known.
  const [natural, setNatural] = useState<Record<number, { width: number; height: number }>>({});
  const [status, setStatus] = useState<Record<number, PhotoLoadStatus>>({});
  // Part of the Image's key: a retry has to build a new native view, or it
  // shows the same cached failure.
  const [attempt, setAttempt] = useState<Record<number, number>>({});
  const page = useSharedValue(clampPhotoIndex(initialIndex, photos.length));
  // The counter in the middle of the photo: up on a page change, then away.
  const counter = useSharedValue(0);
  const offset = useSharedValue(0);
  const spring = resolveSpring(reduceMotion, 'professional');
  const count = photos.length;

  useEffect(() => {
    for (const photo of photosToPreload(photos, index)) void Image.prefetch(photo).catch(() => undefined);
  }, [index, photos]);

  // A photo request that is accepted and never answered has no error to react
  // to, so the wait itself needs an end. Only the photo on screen is watched:
  // one that is still off to the side may take as long as it likes.
  useEffect(() => {
    if ((status[index] ?? 'pending') !== 'pending') return;
    const timer = setTimeout(() => {
      setStatus((current) => ({ ...current, [index]: photoStatusAfter(current[index] ?? 'pending', 'deadline') }));
    }, photoLoadDeadlineMs);
    return () => clearTimeout(timer);
  }, [index, status, attempt]);

  function markPhoto(position: number, event: PhotoLoadEvent) {
    setStatus((current) => ({ ...current, [position]: photoStatusAfter(current[position] ?? 'pending', event) }));
    if (event === 'retry') setAttempt((current) => ({ ...current, [position]: (current[position] ?? 0) + 1 }));
  }

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

  function showCounter() {
    if (count < 2) return;
    const timing = photoCounterDurations(reduceMotion);
    counter.value = withSequence(
      withTiming(1, { duration: timing.fadeInMs }),
      withDelay(timing.holdMs, withTiming(0, { duration: timing.fadeOutMs })),
    );
  }

  function commit(next: number) {
    if (next === index) return;
    setIndex(next);
    onPageChange?.(next);
    showCounter();
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
  const counterStyle = useAnimatedStyle(() => ({ opacity: counter.value, transform: [{ scale: 0.94 + counter.value * 0.06 }] }));
  const measured = width > 0;

  // Only cards crop: a full-screen viewer shows the whole photo, so there is
  // nothing to place.
  const cropFor = (position: number) => {
    if (fit !== 'cover') return null;
    const size = natural[position];
    if (!size) return null;
    const crop = coverCrop(size, { width, height: boxHeight });
    return crop ? { width: crop.width, height: crop.height, transform: [{ translateY: crop.translateY }] } : null;
  };

  const content = (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setBoxHeight(event.nativeEvent.layout.height);
        setWidth((current) => {
          if (current === next) return current;
          // Keep the visible page pinned when the window changes size.
          offset.value = -page.value * next;
          return next;
        });
      }}
      accessibilityLabel={count > 1 ? t('photoPager.accessibility.position', { name, current: index + 1, count }) : name}
      accessibilityRole="image"
      accessibilityValue={count > 1 ? { min: 1, max: count, now: index + 1 } : undefined}
      style={{ width: '100%', height, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' }}
    >
      {measured ? (
        <Animated.View style={[{ flexDirection: 'row', width: width * Math.max(count, 1), height: '100%' }, trackStyle]}>
          {photos.map((photo, position) => (
            <View key={`${position}-${photo}`} style={{ width, height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: fit === 'contain' ? theme.colors.canvas : theme.colors.surfaceElevated }}>
              {(status[position] ?? 'pending') === 'failed' ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.x5, gap: theme.spacing.x3 }}>
                  <BinderText variant="caption" tone="muted" align="center">{t('photoPager.errors.load')}</BinderText>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('photoPager.actions.retry')} onPress={() => markPhoto(position, 'retry')} style={{ minHeight: theme.layout.minimumTouchTarget, minWidth: theme.layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.x4, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill }}>
                    <BinderText variant="caption" tone="accent">{t('photoPager.actions.retry')}</BinderText>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Image
                    key={`${position}-${attempt[position] ?? 0}`}
                    accessibilityIgnoresInvertColors
                    source={{ uri: photo }}
                    resizeMode={fit}
                    onLoad={(event) => {
                      const source = event.nativeEvent?.source;
                      if (source?.width && source?.height) {
                        setNatural((current) => (current[position] ? current : { ...current, [position]: { width: source.width, height: source.height } }));
                      }
                      markPhoto(position, 'loaded');
                    }}
                    onError={() => markPhoto(position, 'error')}
                    // A card crops, and where it crops decides whether a face
                    // survives. Until the photo has reported its size the plain
                    // centred cover is used, which is what this replaces.
                    style={cropFor(position) ?? { width: '100%', height: '100%' }}
                  />
                  {/* The wait is visible. An empty rectangle reads as a broken
                      profile, and a card nobody can see is still decidable. */}
                  {(status[position] ?? 'pending') === 'pending' ? (
                    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceElevated }}>
                      <BinderText variant="caption" tone="muted">{t('photoPager.states.loading')}</BinderText>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ))}
        </Animated.View>
      ) : null}

      {count > 1 ? (
        <View pointerEvents="none" accessibilityElementsHidden style={{ position: 'absolute', top: theme.spacing.x3, left: theme.spacing.x3, right: theme.spacing.x3, flexDirection: 'row', gap: theme.spacing.x1 }}>
          {photos.map((photo, segment) => <PhotoProgressSegment key={`${segment}-${photo}`} segment={segment} index={index} offset={offset} width={width} reduceMotion={reduceMotion} />)}
        </View>
      ) : null}

      {/* Which picture of how many, where the eye already is. The segments
          along the top say it too, but they are two pixels tall and under the
          thumb. */}
      {count > 1 ? (
        <Animated.View pointerEvents="none" accessibilityElementsHidden style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }, counterStyle]}>
          <View style={{ paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.colors.scrim }}>
            <BinderText variant="label" style={{ color: theme.colors.textPrimary }}>{photoCounterLabel(index, count)}</BinderText>
          </View>
        </Animated.View>
      ) : null}

      {/* Hot zones over a photo carry no surface and no scale: the photo is the
          subject, and a grey rectangle flashing over a third of it is not
          feedback, it is damage. */}
      {interactive && count > 1 ? <Pressable pressedSurface={false} pressScale={false} accessibilityRole="button" accessibilityLabel={t('photoPager.accessibility.previous', { name })} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => move('previous')} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, left: 0, width: '33.333%', minWidth: theme.layout.minimumTouchTarget }} /> : null}
      {interactive && onOpen ? <Pressable pressedSurface={false} pressScale={false} accessibilityRole="button" accessibilityLabel={t('photoPager.accessibility.openProfile', { name })} onPress={() => onOpen(index)} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, left: count > 1 ? '33.333%' : 0, right: count > 1 ? '33.333%' : 0, minWidth: theme.layout.minimumTouchTarget }} /> : null}
      {interactive && count > 1 ? <Pressable pressedSurface={false} pressScale={false} accessibilityRole="button" accessibilityLabel={t('photoPager.accessibility.next', { name })} accessibilityState={{ disabled: index === count - 1 }} disabled={index === count - 1} onPress={() => move('next')} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, right: 0, width: '33.333%', minWidth: theme.layout.minimumTouchTarget }} /> : null}
    </View>
  );

  if (!swipeable) return content;
  return <GestureDetector gesture={swipe}>{content}</GestureDetector>;
}

function PhotoProgressSegment({ segment, index, offset, width, reduceMotion }: { segment: number; index: number; offset: SharedValue<number>; width: number; reduceMotion: boolean }) {
  const { theme } = useBinderTheme();
  const fillStyle = useAnimatedStyle(() => {
    const pageProgress = width > 0 ? -offset.value / width : index;
    const progress = reduceMotion ? (segment <= index ? 1 : 0) : Math.max(0, Math.min(1, pageProgress - segment + 1));
    return { transform: [{ scaleX: progress }] };
  });

  return (
    <View style={{ flex: 1, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: theme.colors.scrim, overflow: 'hidden' }}>
      <Animated.View style={[{ width: '100%', height: '100%', borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent, transformOrigin: 'left' }, fillStyle]} />
    </View>
  );
}
