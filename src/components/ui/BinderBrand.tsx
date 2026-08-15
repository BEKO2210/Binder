import { Image, View } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';

const binderIcon = require('../../../assets/brand/icon.png');

export function BinderBrand({ compact = false }: { compact?: boolean }) {
  const { theme } = useBinderTheme();
  const size = compact ? 34 : 42;

  return (
    <View accessibilityLabel="Binder" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
      <Image
        accessibilityIgnoresInvertColors
        source={binderIcon}
        style={{ width: size, height: size, borderRadius: compact ? 11 : 13 }}
      />
      {!compact ? (
        <BinderText
          variant="label"
          style={{ color: theme.colors.textPrimary, letterSpacing: 3, fontFamily: theme.type.family.extraBold }}
        >
          BINDER
        </BinderText>
      ) : null}
    </View>
  );
}
