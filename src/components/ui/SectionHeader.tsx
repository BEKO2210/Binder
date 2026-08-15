import { View } from 'react-native';

import { useBinderTheme } from '../../theme/ThemeProvider';
import { BinderText } from './BinderText';

type Props = {
  eyebrow?: string;
  title: string;
  copy?: string;
};

export function SectionHeader({ eyebrow, title, copy }: Props) {
  const { theme } = useBinderTheme();
  return (
    <View>
      {eyebrow ? <BinderText variant="micro" tone="accent">{eyebrow}</BinderText> : null}
      <BinderText variant="displayL" style={{ marginTop: eyebrow ? theme.spacing.x2 : 0 }}>{title}</BinderText>
      {copy ? <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3, maxWidth: 560 }}>{copy}</BinderText> : null}
    </View>
  );
}
