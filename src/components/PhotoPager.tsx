import { useEffect, useState } from 'react';
import { Image, View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { adjacentPhotoIndex, photosToPreload } from '../lib/photoPager';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';
import { MotionPressable as Pressable } from './ui';

type Props = {
  photos: readonly string[];
  name: string;
  height?: DimensionValue;
  onOpen?: (index: number) => void;
  interactive?: boolean;
  onPageChange?: (index: number) => void;
};

export function PhotoPager({ photos, name, height = '100%', onOpen, interactive = true, onPageChange }: Props) {
  const { theme, reduceMotion } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [index, setIndex] = useState(0);
  const [previousPhoto, setPreviousPhoto] = useState<string | null>(null);
  const opacity = useSharedValue(1);
  const currentPhoto = photos[index];

  useEffect(() => {
    for (const photo of photosToPreload(photos, index)) void Image.prefetch(photo).catch(() => undefined);
  }, [index, photos]);

  function move(direction: 'previous' | 'next') {
    const next = adjacentPhotoIndex(index, direction, photos.length);
    if (next === index) return;
    setPreviousPhoto(currentPhoto ?? null);
    setIndex(next);
    onPageChange?.(next);
    void haptic('selection');
    opacity.value = reduceMotion ? 1 : 0;
    if (!reduceMotion) opacity.value = withTiming(1, { duration: theme.motion.standard });
  }

  const currentStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={{ width: '100%', height, backgroundColor: theme.colors.surfaceElevated }}>
      {previousPhoto ? <Image source={{ uri: previousPhoto }} resizeMode="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /> : null}
      {currentPhoto ? <Animated.Image accessibilityIgnoresInvertColors source={{ uri: currentPhoto }} resizeMode="cover" style={[{ position: 'absolute', inset: 0, width: '100%', height: '100%' }, currentStyle]} /> : null}

      {photos.length > 1 ? (
        <View pointerEvents="none" accessibilityElementsHidden style={{ position: 'absolute', top: theme.spacing.x3, left: theme.spacing.x3, right: theme.spacing.x3, flexDirection: 'row', gap: theme.spacing.x1 }}>
          {photos.map((photo, segment) => <View key={`${segment}-${photo}`} style={{ flex: 1, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: segment <= index ? theme.accent.accent : theme.colors.scrim }} />)}
        </View>
      ) : null}

      {interactive && photos.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Previous photo of ${name}`} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => move('previous')} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, left: 0, width: '33.333%', minWidth: theme.layout.minimumTouchTarget }} /> : null}
      {interactive && onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Open full profile for ${name}`} onPress={() => onOpen(index)} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, left: photos.length > 1 ? '33.333%' : 0, right: photos.length > 1 ? '33.333%' : 0, minWidth: theme.layout.minimumTouchTarget }} /> : null}
      {interactive && photos.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Next photo of ${name}`} accessibilityState={{ disabled: index === photos.length - 1 }} disabled={index === photos.length - 1} onPress={() => move('next')} style={{ position: 'absolute', top: theme.spacing.x10, bottom: 0, right: 0, width: '33.333%', minWidth: theme.layout.minimumTouchTarget }} /> : null}
    </View>
  );
}
