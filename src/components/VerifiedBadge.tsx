import { View } from 'react-native';

import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderIcon, BinderText } from './ui';

// "Photos reviewed" is the one promise on a dating profile that has to look
// like it was issued rather than typed. A grey tick beside grey text read as a
// caption nobody finishes; a mark does the work at a glance.
//
// It is drawn, not an image: an accent disc with the tick in it, so it stays
// sharp at any size, follows the theme, and costs no asset.
// On a photograph it carries its own dark backing, because the brightness of a
// photograph is not something the theme controls.

type Props = {
  label: string;
  accessibilityLabel: string;
  /** On a photograph the badge brings its own ground; on a surface it borrows one. */
  onMedia?: boolean;
};

export function VerifiedBadge({ label, accessibilityLabel, onMedia = false }: Props) {
  const { theme } = useBinderTheme();
  const size = theme.spacing.x6;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.x2,
        paddingLeft: theme.spacing.x2,
        paddingRight: theme.spacing.x3,
        paddingVertical: theme.spacing.x1,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: onMedia ? theme.colors.transparent : theme.colors.borderSubtle,
        backgroundColor: onMedia ? theme.colors.scrim : theme.colors.surfaceElevated,
      }}
    >
      {/* A filled disc, not an outlined shield: at 24px an outline leaves the
          tick sitting on whatever is behind the badge, and on a photograph
          that is nothing you control. Solid accent with the tick in the colour
          that reads on it — the same pairing as the primary button. */}
      <View style={{ width: size, height: size, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent, alignItems: 'center', justifyContent: 'center' }}>
        <BinderIcon name="check" size={Math.round(size * 0.62)} color={theme.accent.foreground} />
      </View>
      <BinderText variant="caption" tone={onMedia ? 'primary' : 'secondary'}>{label}</BinderText>
    </View>
  );
}
