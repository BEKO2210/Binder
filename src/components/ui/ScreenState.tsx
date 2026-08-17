import { View } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import type { BinderIconName } from './BinderIcon';
import { BinderIcon } from './BinderIcon';
import { BinderButton } from './BinderButton';
import { BinderText } from './BinderText';

type Props = {
  kind: 'loading' | 'empty' | 'error' | 'offline' | 'permission';
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** A second, quieter way out — "Close" next to "Try again". */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: BinderIconName;
  loadingShape?: 'matches' | 'conversation';
};

export function ScreenState({ kind, title, message, actionLabel, onAction, secondaryActionLabel, onSecondaryAction, icon, loadingShape = 'matches' }: Props) {
  const { theme } = useBinderTheme();
  if (kind === 'loading') {
    const rows = loadingShape === 'conversation' ? 5 : 4;
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={message} style={{ flex: 1, padding: theme.spacing.x4, backgroundColor: theme.colors.canvas, gap: theme.spacing.x3 }}>
        {Array.from({ length: rows }, (_, index) => loadingShape === 'conversation' ? (
          <View key={index} style={{ alignSelf: index % 2 === 0 ? 'flex-end' : 'flex-start', width: index % 3 === 0 ? '72%' : '56%', minHeight: theme.spacing.x12, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated }} />
        ) : (
          <View key={index} style={{ minHeight: theme.spacing.x16 + theme.spacing.x5, padding: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, borderRadius: theme.radii.card, backgroundColor: theme.colors.surface }}>
            <View style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} />
            <View style={{ flex: 1, gap: theme.spacing.x3 }}>
              <View style={{ width: '42%', height: theme.spacing.x4, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} />
              <View style={{ width: '78%', height: theme.spacing.x3, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, padding: theme.spacing.x6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas }}>
      {icon ? <BinderIcon name={icon} size={32} color={kind === 'error' ? theme.semantic.destructive : theme.colors.textSecondary} /> : null}
      {title ? <BinderText variant="title" align="center" style={{ marginTop: theme.spacing.x4 }}>{title}</BinderText> : null}
      <BinderText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.x3, maxWidth: 360 }}>{message}</BinderText>
      {actionLabel && onAction ? <BinderButton label={actionLabel} variant="secondary" fullWidth={false} onPress={onAction} style={{ marginTop: theme.spacing.x5 }} /> : null}
      {secondaryActionLabel && onSecondaryAction ? <BinderButton label={secondaryActionLabel} variant="ghost" fullWidth={false} onPress={onSecondaryAction} style={{ marginTop: theme.spacing.x2 }} /> : null}
    </View>
  );
}
