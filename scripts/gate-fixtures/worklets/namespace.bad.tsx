// A plain function reached through a namespace import. The gate resolved named
// imports only, so `motionHelpers.resolveSpring()` inside a gesture callback
// looked like a call to nothing it knew — and a plain function called from a
// worklet kills the process.
import * as motionHelpers from '../../../src/lib/motionPolicy';
import { Gesture } from 'react-native-gesture-handler';

export const swipe = Gesture.Pan().onEnd(() => {
  const spring = motionHelpers.resolveSpring(false, 'professional');
  return spring;
});
