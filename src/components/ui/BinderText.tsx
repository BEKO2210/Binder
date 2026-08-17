import { Text, type TextProps, type TextStyle } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import type { BinderTheme } from '../../theme/tokens';

export type BinderTextVariant = keyof BinderTheme['typography'];
export type BinderTextTone = 'primary' | 'secondary' | 'muted' | 'accent' | 'warning' | 'destructive';

type Props = TextProps & {
  variant?: BinderTextVariant;
  tone?: BinderTextTone;
  align?: TextStyle['textAlign'];
};

export function BinderText({ variant = 'body', tone = 'primary', align, style, ...props }: Props) {
  const { theme } = useBinderTheme();
  const color = tone === 'primary'
    ? theme.colors.textPrimary
    : tone === 'secondary'
      ? theme.colors.textSecondary
      : tone === 'muted'
        ? theme.colors.textMuted
        : tone === 'accent'
          ? theme.accent.onSurface
          : tone === 'warning'
            ? theme.semantic.warning
            : theme.semantic.destructive;

  return <Text {...props} style={[theme.typography[variant], { color, textAlign: align }, style]} />;
}
