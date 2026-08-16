import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';

type Props = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
  inputRef?: React.Ref<TextInput>;
};

export function BinderInput({ label, error, helper, style, editable = true, inputRef, ...props }: Props) {
  const { theme } = useBinderTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.semantic.destructive : focused ? theme.accent.accent : theme.colors.borderSubtle;

  return (
    <View style={{ gap: theme.spacing.x2 }}>
      <BinderText variant="label" tone={error ? 'destructive' : 'secondary'}>{label}</BinderText>
      <TextInput
        {...props}
        ref={inputRef}
        editable={editable}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.accent.accent}
        style={[{
          minHeight: 52,
          color: theme.colors.textPrimary,
          backgroundColor: editable ? theme.colors.surface : theme.colors.surfaceElevated,
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radii.control,
          paddingHorizontal: theme.spacing.x4,
          paddingVertical: theme.spacing.x3,
          fontSize: theme.typography.body.fontSize,
          lineHeight: theme.typography.body.lineHeight,
          opacity: editable ? 1 : 0.56,
        }, style]}
      />
      {error ? <BinderText variant="caption" tone="destructive">{error}</BinderText> : helper ? <BinderText variant="caption" tone="muted">{helper}</BinderText> : null}
    </View>
  );
}
