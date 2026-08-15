import { View, type ViewProps } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';

export function BinderCard({ style, ...props }: ViewProps) {
  const { theme } = useBinderTheme();
  return (
    <View
      {...props}
      style={[{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.borderSubtle,
        borderWidth: 1,
        borderRadius: theme.radii.card,
        padding: theme.spacing.x5,
      }, style]}
    />
  );
}
