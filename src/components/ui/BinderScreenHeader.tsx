import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderIconButton, type BinderIconName } from './BinderIcon';
import { BinderText } from './BinderText';
import { MotionPressable as Pressable } from './MotionPressable';

type Control = { icon: BinderIconName; accessibilityLabel: string; onPress: () => void };
type Props = { title: string; titleVisual?: ReactNode; eyebrow?: string; leading?: Control; trailing?: ReactNode; centered?: boolean; onTitlePress?: () => void; titleAccessibilityLabel?: string; style?: ViewStyle };

export function BinderScreenHeader({ title, titleVisual, eyebrow, leading, trailing, centered = false, onTitlePress, titleAccessibilityLabel, style }: Props) {
  const { theme } = useBinderTheme();
  const controlWidth = theme.layout.minimumTouchTarget + theme.spacing.x1;
  return (
    // Same rule as the tab bar: the divider and the background run edge to edge,
    // the controls stay inside the centred content column.
    <View style={[{ width: '100%', borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle, backgroundColor: theme.colors.canvas }, style]}>
    <View style={{ minHeight: theme.layout.screenHeaderHeight, width: '100%', maxWidth: theme.layout.tabletContentMaxWidth, alignSelf: 'center', paddingHorizontal: theme.spacing.screen, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
      {leading ? <View style={{ width: controlWidth }}><BinderIconButton name={leading.icon} accessibilityLabel={leading.accessibilityLabel} onPress={leading.onPress} /></View> : null}
      <Pressable disabled={!onTitlePress} accessibilityRole={onTitlePress ? 'button' : undefined} accessibilityLabel={titleAccessibilityLabel} onPress={onTitlePress} style={({ pressed }) => ({ flex: 1, minHeight: theme.layout.minimumTouchTarget, justifyContent: 'center', alignItems: centered ? 'center' : 'flex-start', borderRadius: theme.radii.control, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent })}>
        {titleVisual ?? <>{eyebrow ? <BinderText variant="micro" tone="accent">{eyebrow}</BinderText> : null}<BinderText variant={eyebrow ? 'title' : 'label'} numberOfLines={1} style={{ marginTop: eyebrow ? theme.spacing.x1 : 0 }}>{title}</BinderText></>}
      </Pressable>
      {trailing ? <View style={{ minWidth: controlWidth, alignItems: 'flex-end' }}>{trailing}</View> : centered && leading ? <View style={{ width: controlWidth }} /> : null}
    </View>
    </View>
  );
}
