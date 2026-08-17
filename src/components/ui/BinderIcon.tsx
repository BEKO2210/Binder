import { SymbolView } from 'expo-symbols';
import { View, type ColorValue, type ViewStyle } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { MotionPressable } from './MotionPressable';

const symbols = {
  discover: { ios: 'safari', android: 'explore', web: 'explore' },
  matches: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  profile: { ios: 'person.fill', android: 'person', web: 'person' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  send: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  safety: { ios: 'shield.fill', android: 'shield', web: 'shield' },
  report: { ios: 'exclamationmark.triangle.fill', android: 'report', web: 'report' },
  block: { ios: 'nosign', android: 'block', web: 'block' },
  delete: { ios: 'trash.fill', android: 'delete', web: 'delete' },
  photo: { ios: 'photo.fill', android: 'image', web: 'image' },
  addPhoto: { ios: 'photo.badge.plus', android: 'add_photo_alternate', web: 'add_photo_alternate' },
  notifications: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  palette: { ios: 'paintpalette.fill', android: 'palette', web: 'palette' },
  privacy: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  legal: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  beta: { ios: 'flask.fill', android: 'science', web: 'science' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  retry: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  email: { ios: 'envelope.fill', android: 'mail', web: 'mail' },
  reveal: { ios: 'eye.fill', android: 'visibility', web: 'visibility' },
  conceal: { ios: 'eye.slash.fill', android: 'visibility_off', web: 'visibility_off' },
} as const;

export type BinderIconName = keyof typeof symbols;

type IconProps = {
  name: BinderIconName;
  size?: number;
  color?: ColorValue;
};

export function BinderIcon({ name, size = 24, color }: IconProps) {
  const { theme } = useBinderTheme();
  // SymbolView renders an icon-font glyph on Android, and that glyph ends up in
  // the accessible name of whatever contains it — a uiautomator dump showed
  // labels like ", Complete profile". The wrapper takes the icon out of
  // the accessibility tree so only the control's own label survives; passing the
  // props to SymbolView alone was not enough.
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView name={symbols[name]} size={size} tintColor={color ?? theme.colors.textPrimary} />
    </View>
  );
}

type IconButtonProps = IconProps & {
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  destructive?: boolean;
  /** Rendered on top of a photo: no pressed surface, no scale. */
  overMedia?: boolean;
  style?: ViewStyle;
};

export function BinderIconButton({ accessibilityLabel, onPress, disabled, selected, destructive, overMedia = false, style, ...icon }: IconButtonProps) {
  const { theme } = useBinderTheme();
  const color = destructive ? theme.semantic.destructive : selected ? theme.accent.onSurface : theme.colors.textSecondary;
  // Over a photo the control has no surface to tint: a pressed rectangle there
  // reads as a rendering glitch. The icon dims instead, which is feedback the
  // photo survives.
  const pressedOpacity = 0.55;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      pressedSurface={false}
      pressScale={!overMedia}
      onPress={onPress}
      style={({ pressed }) => [{
        // The Phase 6 verifier intentionally pins this stricter 48dp contract.
        minWidth: 48,
        minHeight: 48,
        borderRadius: theme.radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: !overMedia && pressed ? theme.colors.surfacePressed : theme.colors.transparent,
        opacity: disabled ? theme.feedback.disabledOpacity : overMedia && pressed ? pressedOpacity : 1,
      }, style]}
    >
      <BinderIcon {...icon} color={color} />
    </MotionPressable>
  );
}
