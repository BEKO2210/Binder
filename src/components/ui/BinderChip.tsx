import { Pressable, type PressableProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  selected?: boolean;
};

export function BinderChip({ label, selected = false, disabled, ...props }: Props) {
  const { theme } = useBinderTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: theme.spacing.x4,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: selected ? theme.accent.accent : theme.colors.borderSubtle,
        backgroundColor: selected ? theme.accent.accent : pressed ? theme.colors.surfacePressed : theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.42 : 1,
      })}
    >
      <BinderText variant="label" style={{ color: selected ? theme.accent.foreground : theme.colors.textSecondary }}>{label}</BinderText>
    </Pressable>
  );
}
