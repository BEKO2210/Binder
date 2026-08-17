import { useEffect, useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { resolvePressScale } from '../../lib/motionPolicy';
import { useBinderTheme } from '../../theme/ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: PressableProps['style'];
  pressedSurface?: boolean;
  /**
   * Scaling is thumb feedback for a control that looks like a control. An
   * invisible hot zone over a photo has nothing to scale, and scaling it drags
   * the photo underneath it with a visible jump.
   */
  pressScale?: boolean;
};

/**
 * Binder's single UI-thread thumb-feedback contract.
 *
 * The pressed state is tracked here and the style is resolved to a plain array
 * before it reaches the animated component. Handing a *function* style to an
 * animated Pressable silently dropped layout properties — `flex: 1` among them,
 * which collapsed the tab bar into the left edge and pushed the header's
 * trailing control against its title.
 */
export function MotionPressable({ style, pressedSurface = true, pressScale = true, disabled, onPressIn, onPressOut, ...props }: Props) {
  const { theme, reduceMotion } = useBinderTheme();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (reduceMotion) scale.value = 1;
  }, [reduceMotion, scale]);

  const motionStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const settle = (value: number) => {
    scale.value = reduceMotion ? value : withTiming(value, { duration: theme.motion.standard });
  };

  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  const pressTarget = pressScale ? resolvePressScale(reduceMotion) : 1;
  // A control's semantic pressed token (accent/destructive) wins when it
  // provides one; the shared surface is the fallback for inert rows.
  const feedback: StyleProp<ViewStyle> = pressed && pressedSurface ? { backgroundColor: theme.colors.surfacePressed } : undefined;

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => { setPressed(true); settle(pressTarget); onPressIn?.(event); }}
      onPressOut={(event) => { setPressed(false); settle(1); onPressOut?.(event); }}
      style={[motionStyle, feedback, resolved] as StyleProp<ViewStyle>}
    />
  );
}
