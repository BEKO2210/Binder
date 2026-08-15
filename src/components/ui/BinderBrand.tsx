import { View } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';

export function BinderBrand({ compact = false }: { compact?: boolean }) {
  const { theme } = useBinderTheme();
  return (
    <View accessibilityLabel="Binder" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
      <View style={{
        width: compact ? 34 : 42,
        height: compact ? 34 : 42,
        borderRadius: compact ? 12 : 14,
        backgroundColor: theme.accent.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <BinderText variant={compact ? 'label' : 'title'} style={{ color: theme.accent.foreground, fontWeight: '900' }}>B</BinderText>
      </View>
      {!compact ? <BinderText variant="label" style={{ color: theme.colors.textPrimary, letterSpacing: 3 }}>BINDER</BinderText> : null}
    </View>
  );
}
