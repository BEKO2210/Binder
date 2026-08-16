import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderText } from './ui';

const THUMB = 28;
const TRACK = 6;

type RangeProps = {
  min: number;
  max: number;
  lowValue: number;
  highValue: number;
  minGap?: number;
  label: (low: number, high: number) => string;
  onChange: (low: number, high: number) => void;
};

// Touch-first dual-thumb range slider built on the existing gesture/reanimated
// stack — no typing, 48dp+ effective targets, integer snapping on the UI thread.
export function RangeSlider({ min, max, lowValue, highValue, minGap = 1, label, onChange }: RangeProps) {
  const { theme } = useBinderTheme();
  const [width, setWidth] = useState(0);
  const [display, setDisplay] = useState({ low: lowValue, high: highValue });
  const low = useSharedValue(lowValue);
  const high = useSharedValue(highValue);
  const usable = Math.max(1, width - THUMB);
  const span = Math.max(1, max - min);

  useEffect(() => {
    low.value = lowValue;
    high.value = highValue;
    setDisplay({ low: lowValue, high: highValue });
  }, [lowValue, highValue]);

  function report(nextLow: number, nextHigh: number) {
    setDisplay({ low: nextLow, high: nextHigh });
    onChange(nextLow, nextHigh);
  }

  const lowGesture = Gesture.Pan()
    .onChange((event) => {
      const delta = (event.changeX / usable) * span;
      low.value = Math.min(Math.max(min, low.value + delta), high.value - minGap);
    })
    .onEnd(() => {
      low.value = Math.round(low.value);
      runOnJS(report)(Math.round(low.value), Math.round(high.value));
    });

  const highGesture = Gesture.Pan()
    .onChange((event) => {
      const delta = (event.changeX / usable) * span;
      high.value = Math.max(Math.min(max, high.value + delta), low.value + minGap);
    })
    .onEnd(() => {
      high.value = Math.round(high.value);
      runOnJS(report)(Math.round(low.value), Math.round(high.value));
    });

  const lowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ((low.value - min) / span) * usable }] }));
  const highStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ((high.value - min) / span) * usable }] }));
  const fillStyle = useAnimatedStyle(() => ({
    left: ((low.value - min) / span) * usable + THUMB / 2,
    width: ((high.value - low.value) / span) * usable,
  }));

  return (
    <View>
      <BinderText variant="label" style={{ marginBottom: theme.spacing.x3 }}>{label(display.low, display.high)}</BinderText>
      <View style={{ height: 44, justifyContent: 'center' }} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        <View style={{ height: TRACK, borderRadius: TRACK, backgroundColor: theme.colors.borderStrong }} />
        <Animated.View style={[{ position: 'absolute', height: TRACK, borderRadius: TRACK, backgroundColor: theme.accent.accent }, fillStyle]} />
        <GestureDetector gesture={lowGesture}>
          <Animated.View hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} style={[{ position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB, backgroundColor: theme.colors.textPrimary, borderWidth: 3, borderColor: theme.accent.accent }, lowStyle]} />
        </GestureDetector>
        <GestureDetector gesture={highGesture}>
          <Animated.View hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} style={[{ position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB, backgroundColor: theme.colors.textPrimary, borderWidth: 3, borderColor: theme.accent.accent }, highStyle]} />
        </GestureDetector>
      </View>
    </View>
  );
}

type SingleProps = {
  min: number;
  max: number;
  value: number;
  label: (value: number) => string;
  onChange: (value: number) => void;
};

export function SingleSlider({ min, max, value, label, onChange }: SingleProps) {
  const { theme } = useBinderTheme();
  const [width, setWidth] = useState(0);
  const [display, setDisplay] = useState(value);
  const current = useSharedValue(value);
  const usable = Math.max(1, width - THUMB);
  const span = Math.max(1, max - min);

  useEffect(() => {
    current.value = value;
    setDisplay(value);
  }, [value]);

  function report(next: number) {
    setDisplay(next);
    onChange(next);
  }

  const gesture = Gesture.Pan()
    .onChange((event) => {
      const delta = (event.changeX / usable) * span;
      current.value = Math.min(Math.max(min, current.value + delta), max);
    })
    .onEnd(() => {
      current.value = Math.round(current.value);
      runOnJS(report)(Math.round(current.value));
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ((current.value - min) / span) * usable }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: ((current.value - min) / span) * usable + THUMB / 2 }));

  return (
    <View>
      <BinderText variant="label" style={{ marginBottom: theme.spacing.x3 }}>{label(display)}</BinderText>
      <View style={{ height: 44, justifyContent: 'center' }} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        <View style={{ height: TRACK, borderRadius: TRACK, backgroundColor: theme.colors.borderStrong }} />
        <Animated.View style={[{ position: 'absolute', left: 0, height: TRACK, borderRadius: TRACK, backgroundColor: theme.accent.accent }, fillStyle]} />
        <GestureDetector gesture={gesture}>
          <Animated.View hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} style={[{ position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB, backgroundColor: theme.colors.textPrimary, borderWidth: 3, borderColor: theme.accent.accent }, thumbStyle]} />
        </GestureDetector>
      </View>
    </View>
  );
}
