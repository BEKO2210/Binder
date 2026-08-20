// A colour that ignores the theme. The gate forbade hex and rgba but not rgb(),
// so this one shipped light-mode white into a dark surface.
import { View } from 'react-native';

export function Panel() {
  return <View style={{ backgroundColor: 'rgb(255, 255, 255)' }} />;
}
