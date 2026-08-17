import { Image, View } from 'react-native';

import { IMAGE_POLICY } from '../../lib/imagePolicy';
import { useBinderTheme } from '../../theme/ThemeProvider';
import { fontFamilies } from '../../theme/tokens';
import { BinderText } from './BinderText';

const binderIcon = require('../../../assets/brand/icon.png');

export function BinderBrand({ compact = false }: { compact?: boolean }) {
  const { theme } = useBinderTheme();
  const size = compact ? 34 : 42;

  return (
    <View accessibilityLabel="Binder" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
      <View style={{ width: size, height: size, borderRadius: compact ? 11 : 13, overflow: 'hidden', backgroundColor: theme.colors[IMAGE_POLICY.placeholder] }}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMethod="resize"
          resizeMode={IMAGE_POLICY.resizeMode}
          source={binderIcon}
          style={{ width: size, height: size }}
        />
      </View>
      {!compact ? (
        <BinderText
          variant="label"
          style={{ color: theme.colors.textPrimary, letterSpacing: 3, fontFamily: fontFamilies.extraBold }}
        >
          BINDER
        </BinderText>
      ) : null}
    </View>
  );
}
