import { ActivityIndicator, View, type PressableProps, type ViewStyle } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderIcon, type BinderIconName } from './BinderIcon';
import { BinderText } from './BinderText';
import { MotionPressable } from './MotionPressable';

export type BinderButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: BinderButtonVariant;
  loading?: boolean;
  icon?: BinderIconName;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function BinderButton({ label, variant = 'primary', loading = false, icon, fullWidth = true, disabled, style, onPressIn, onPressOut, ...props }: Props) {
  const { theme } = useBinderTheme();
  const isDisabled = disabled === true || loading;
  const foreground = variant === 'primary'
    ? theme.accent.foreground
    : variant === 'destructive'
      ? theme.semantic.destructiveForeground
      : theme.colors.textPrimary;
  const background = variant === 'primary'
    ? theme.accent.accent
    : variant === 'destructive'
      ? theme.semantic.destructive
      : variant === 'secondary'
        ? theme.colors.surfaceElevated
        : 'transparent';
  const borderColor = variant === 'secondary'
    ? theme.colors.borderStrong
    : variant === 'ghost'
      ? theme.colors.borderSubtle
      : background;

  return (
    <MotionPressable
      {...props}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [{
        minHeight: theme.layout.controlHeight,
        width: fullWidth ? '100%' : undefined,
        paddingHorizontal: theme.spacing.x5,
        borderRadius: theme.radii.control,
        borderWidth: variant === 'primary' || variant === 'destructive' ? 0 : 1,
        borderColor,
        backgroundColor: pressed && variant === 'primary'
          ? theme.accent.pressed
          : pressed && variant === 'destructive'
            ? theme.semantic.destructivePressed
            : pressed
              ? theme.colors.surfacePressed
              : background,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? theme.feedback.disabledOpacity : 1,
      }, style]}
    >
      {/* The label stays in the layout while the spinner runs: hiding it let a
          narrow button collapse to spinner width and the row jumped. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, opacity: loading ? 0 : 1 }}>
        {icon ? <BinderIcon name={icon} size={20} color={foreground} /> : null}
        <BinderText variant="label" style={{ color: foreground }}>{label}</BinderText>
      </View>
      {loading ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={foreground} /></View> : null}
    </MotionPressable>
  );
}
