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
  /**
   * Two marks for two places. The overview — a card standing for a whole
   * gallery — wears the shield, which is what the promise is about. A single
   * photograph open on its own gets the round tick: it is about this one
   * picture, and the round form reads at a glance over any image.
   */
  mark?: 'shield' | 'disc';
};

export function VerifiedBadge({ label, accessibilityLabel, onMedia = false, mark = 'shield' }: Props) {
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
        paddingStart: theme.spacing.x2,
        paddingEnd: theme.spacing.x3,
        paddingVertical: theme.spacing.x1,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: onMedia ? theme.colors.transparent : theme.colors.borderSubtle,
        backgroundColor: onMedia ? theme.colors.scrim : theme.colors.surfaceElevated,
      }}
    >
      {/* Both marks are solid: at 24px an outline leaves the tick sitting on
          whatever is behind the badge, and on a photograph that is nothing
          anybody controls. */}
      {mark === 'shield' ? (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <BinderIcon name="safety" size={size} color={theme.accent.accent} />
        </View>
      ) : (
        <View style={{ width: size, height: size, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent, alignItems: 'center', justifyContent: 'center' }}>
          <BinderIcon name="check" size={Math.round(size * 0.62)} color={theme.accent.foreground} />
        </View>
      )}
      <BinderText variant="caption" tone={onMedia ? 'primary' : 'secondary'}>{label}</BinderText>
    </View>
  );
}
