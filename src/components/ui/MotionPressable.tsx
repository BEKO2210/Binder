import { useEffect } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { resolvePressScale } from '../../lib/motionPolicy';
import { useBinderTheme } from '../../theme/ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: PressableProps['style'];
  pressedSurface?: boolean;
};

/** Binder's single UI-thread thumb-feedback contract. */
export function MotionPressable({ style, pressedSurface = true, disabled, onPressIn, onPressOut, ...props }: Props) {
  const { theme, reduceMotion } = useBinderTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) scale.value = 1;
  }, [reduceMotion, scale]);

  const motionStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const settle = (value: number) => {
    scale.value = reduceMotion ? value : withTiming(value, { duration: theme.motion.standard });
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => { settle(resolvePressScale(reduceMotion)); onPressIn?.(event); }}
      onPressOut={(event) => { settle(1); onPressOut?.(event); }}
      style={(state: PressableStateCallbackType) => {
        const resolved = typeof style === 'function' ? style(state) : style;
        const feedback: StyleProp<ViewStyle> = state.pressed && pressedSurface ? { backgroundColor: theme.colors.surfacePressed } : undefined;
        // A control's semantic pressed token (accent/destructive) wins when it
        // provides one; the shared surface is the fallback for inert rows.
        return [motionStyle, feedback, resolved] as StyleProp<ViewStyle>;
      }}
    />
  );
}
