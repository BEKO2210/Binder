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

// Chrome has to survive the largest system font. Body copy scales all the way,
// but a tab label at 200 % pushed the bar over the content it labels, so the
// caller can cap the multiplier where the layout is fixed.
export function BinderText({ variant = 'body', tone = 'primary', align, style, maxFontSizeMultiplier, ...props }: Props) {
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

  return <Text {...props} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[theme.typography[variant], { color, textAlign: align }, style]} />;
}
