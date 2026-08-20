// The legitimate shape: resolved on the JS side, captured by the worklet.
import { resolveSpring } from '../../../src/lib/motionPolicy';
import { Gesture } from 'react-native-gesture-handler';

export function makeGesture(reduceMotion: boolean) {
  const spring = resolveSpring(reduceMotion, 'professional');
  return Gesture.Pan().onEnd(() => {
    'worklet';
    return spring;
  });
}
