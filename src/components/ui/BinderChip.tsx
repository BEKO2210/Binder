import { type PressableProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderIcon, type BinderIconName } from './BinderIcon';
import { BinderText } from './BinderText';
import { MotionPressable } from './MotionPressable';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  selected?: boolean;
  /** A leading emoji, rendered as data the way locale flags already are. It is
   * decorative — the label carries the meaning — so it is hidden from the
   * accessibility tree and excluded from font scaling like every glyph. */
  emoji?: string;
  /** A leading icon for chips that act as an entry point rather than a value
   * — it says what the control is for before the label is read. */
  icon?: BinderIconName;
  /** Lets the label wrap. A chip that carries a whole sentence — the discovery
   * presets carry their values, which is the reason to pick one — loses that
   * sentence to an ellipsis at 200 % font size. */
  multiline?: boolean;
};

export function BinderChip({ label, selected = false, emoji, icon, disabled, multiline = false, ...props }: Props) {
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
        paddingVertical: multiline ? theme.spacing.x2 : 0,
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
      {icon ? <BinderIcon name={icon} size={18} color={selected ? theme.accent.foreground : theme.accent.onSurface} /> : null}
      {emoji ? <BinderText variant="label" maxFontSizeMultiplier={1} importantForAccessibility="no" accessibilityElementsHidden>{emoji}</BinderText> : null}
      <BinderText variant="label" numberOfLines={multiline ? undefined : 1} style={{ color: selected ? theme.accent.foreground : theme.colors.textSecondary, flexShrink: 1 }}>{label}</BinderText>
    </MotionPressable>
  );
}
