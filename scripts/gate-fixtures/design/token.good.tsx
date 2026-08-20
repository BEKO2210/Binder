import { View } from 'react-native';

export function Panel({ theme }: { theme: { colors: { surface: string } } }) {
  return <View style={{ backgroundColor: theme.colors.surface }} />;
}
