import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText, type BinderTextTone, type BinderTextVariant } from './BinderText';

export function ChangingNumber({ value, variant = 'caption', tone = 'primary' }: { value: number; variant?: BinderTextVariant; tone?: BinderTextTone }) {
  const { theme, reduceMotion } = useBinderTheme();
  return (
    <Animated.View
      key={value}
      entering={reduceMotion ? undefined : FadeInUp.duration(theme.motion.standard)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(theme.motion.fast)}
    >
      <BinderText variant={variant} tone={tone}>{value}</BinderText>
    </Animated.View>
  );
}
