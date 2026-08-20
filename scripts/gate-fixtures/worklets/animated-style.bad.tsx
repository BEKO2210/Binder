// Same trap one layer up: the body of useAnimatedStyle also runs on the UI
// runtime.
import * as motionHelpers from '../../../src/lib/motionPolicy';
import { useAnimatedStyle } from 'react-native-reanimated';

export function useStyle() {
  return useAnimatedStyle(() => ({ opacity: motionHelpers.resolveSpring(false, 'professional') ? 1 : 0 }));
}
