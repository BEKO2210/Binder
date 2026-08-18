import { type PressableProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';
import { MotionPressable } from './MotionPressable';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  selected?: boolean;
  /** A leading emoji, rendered as data the way locale flags already are. It is
   * decorative — the label carries the meaning — so it is hidden from the
   * accessibility tree and excluded from font scaling like every glyph. */
  emoji?: string;
};

export function BinderChip({ label, selected = false, emoji, disabled, ...props }: Props) {
  const { theme } = useBinderTheme();
  const isDisabled = disabled === true;
  return (
    <MotionPressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => ({
        minHeight: theme.layout.minimumTouchTarget,
        paddingHorizontal: theme.spacing.x4,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: selected ? theme.accent.accent : theme.colors.borderSubtle,
        backgroundColor: selected ? (pressed ? theme.accent.pressed : theme.accent.accent) : pressed ? theme.colors.surfacePressed : theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.x2,
        opacity: isDisabled ? theme.feedback.disabledOpacity : 1,
      })}
    >
      {emoji ? <BinderText variant="label" maxFontSizeMultiplier={1} importantForAccessibility="no" accessibilityElementsHidden>{emoji}</BinderText> : null}
      <BinderText variant="label" numberOfLines={1} style={{ color: selected ? theme.accent.foreground : theme.colors.textSecondary, flexShrink: 1 }}>{label}</BinderText>
    </MotionPressable>
  );
}
