import { ActivityIndicator, View } from 'react-native';

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
  icon?: BinderIconName;
};

export function ScreenState({ kind, title, message, actionLabel, onAction, icon }: Props) {
  const { theme } = useBinderTheme();
  return (
    <View style={{ flex: 1, padding: theme.spacing.x6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.canvas }}>
      {kind === 'loading' ? <ActivityIndicator size="large" color={theme.accent.accent} /> : icon ? <BinderIcon name={icon} size={32} color={kind === 'error' ? theme.semantic.destructive : theme.colors.textSecondary} /> : null}
      {title ? <BinderText variant="title" align="center" style={{ marginTop: theme.spacing.x4 }}>{title}</BinderText> : null}
      <BinderText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.x3, maxWidth: 360 }}>{message}</BinderText>
      {actionLabel && onAction ? <BinderButton label={actionLabel} variant="secondary" fullWidth={false} onPress={onAction} style={{ marginTop: theme.spacing.x5 }} /> : null}
    </View>
  );
}
