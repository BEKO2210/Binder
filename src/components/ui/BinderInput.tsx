import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderIcon } from './BinderIcon';
import { BinderText } from './BinderText';
import { MotionPressable as Pressable } from './MotionPressable';

type Props = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
  inputRef?: React.Ref<TextInput>;
  // Password fields get an eye: typing a password blind on a phone keyboard is
  // how people end up locked out of their own account.
  revealToggle?: boolean;
};

export function BinderInput({ label, error, helper, style, editable = true, inputRef, revealToggle = false, ...props }: Props) {
  const { theme, t } = useBinderTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? theme.semantic.destructive : focused ? theme.accent.accent : theme.colors.borderSubtle;
  const secure = revealToggle ? !revealed : props.secureTextEntry;

  return (
    <View style={{ gap: theme.spacing.x2 }}>
      <BinderText variant="label" tone={error ? 'destructive' : 'secondary'}>{label}</BinderText>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityState={{ disabled: !editable }}
          secureTextEntry={secure}
          ref={inputRef}
          editable={editable}
          onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.accent.accent}
          style={[{
            minHeight: theme.layout.controlHeight,
            color: theme.colors.textPrimary,
            backgroundColor: editable ? theme.colors.surface : theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor,
            borderRadius: theme.radii.control,
            paddingHorizontal: theme.spacing.x4,
            paddingEnd: revealToggle ? theme.spacing.x4 + theme.layout.minimumTouchTarget : theme.spacing.x4,
            paddingVertical: theme.spacing.x3,
            fontSize: theme.typography.body.fontSize,
            lineHeight: theme.typography.body.lineHeight,
            opacity: editable ? 1 : theme.feedback.disabledOpacity,
          }, style]}
        />
        {revealToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: revealed }}
            accessibilityLabel={revealed ? t('binderInput.accessibility.hidePassword') : t('binderInput.accessibility.showPassword')}
            disabled={!editable}
            onPress={() => setRevealed((current) => !current)}
            hitSlop={theme.spacing.x2}
            style={({ pressed }) => ({
              position: 'absolute',
              end: theme.spacing.x1,
              width: theme.layout.minimumTouchTarget,
              height: theme.layout.minimumTouchTarget,
              borderRadius: theme.radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent,
            })}
          >
            <BinderIcon name={revealed ? 'conceal' : 'reveal'} size={20} color={revealed ? theme.accent.onSurface : theme.colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive">{error}</BinderText> : helper ? <BinderText variant="caption" tone="muted">{helper}</BinderText> : null}
    </View>
  );
}
