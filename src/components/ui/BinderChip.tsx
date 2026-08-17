import { type PressableProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';
import { MotionPressable } from './MotionPressable';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  selected?: boolean;
};

export function BinderChip({ label, selected = false, disabled, ...props }: Props) {
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
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? theme.feedback.disabledOpacity : 1,
      })}
    >
      <BinderText variant="label" style={{ color: selected ? theme.accent.foreground : theme.colors.textSecondary }}>{label}</BinderText>
    </MotionPressable>
  );
}
