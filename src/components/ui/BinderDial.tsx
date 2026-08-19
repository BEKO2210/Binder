import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { accumulateDragPosition, DIAL_ARC_RADIANS, DIAL_ARC_START, type DialDragTarget, grabOffset as grabOffsetFor, moveRange, pointToAngle, pointToPosition, positionToStepIndex, resolveDragTarget, shouldReportDialChange, touchGrabsRing } from '../../lib/dialMath';
import { useBinderHaptics } from '../../theme/haptics';
import { useBinderTheme } from '../../theme/ThemeProvider';
import { layout } from '../../theme/tokens';
import { BinderText } from './BinderText';
import { MotionPressable as Pressable } from './MotionPressable';

const DIAL_SIZE = layout.dialSize;
// These dimensions form the tested polar hit geometry; changing one requires
// recalibrating dialMath and the dialScale regression suite as a unit.
const RING_RADIUS = 104;
const HANDLE_SIZE = 48;
const TICK_COUNT = 72;
// Hold-repeat timing is input cadence, not decorative motion.
const REPEAT_DELAY_MS = 400;
const REPEAT_RATE_MS = 120;
const DRAG_REPORT_INTERVAL_MS = 100;

type CommonProps = {
  steps: readonly number[];
  caption: string;
  formatValue?: (value: number) => string;
};

type SingleProps = CommonProps & {
  mode: 'single';
  value: number;
  accessibilityLabel: string;
  onChange: (value: number) => void;
};

type RangeProps = CommonProps & {
  mode: 'range';
  lowValue: number;
  highValue: number;
  lowAccessibilityLabel: string;
  highAccessibilityLabel: string;
  minimumSpan?: number;
  onChange: (low: number, high: number) => void;
};

export type BinderDialProps = SingleProps | RangeProps;

// A touch this far from either handle (as a fraction of the arc) counts as a
// grab of the band rather than of a handle.
const BAND_GRAB_DISTANCE = 0.08;

function nearestIndex(steps: readonly number[], value: number): number {
  let nearest = 0;
  for (let index = 1; index < steps.length; index += 1) {
    if (Math.abs((steps[index] ?? value) - value) < Math.abs((steps[nearest] ?? value) - value)) nearest = index;
  }
  return nearest;
}

export function BinderDial(props: BinderDialProps) {
  const { theme, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const lowInitial = props.mode === 'single' ? nearestIndex(props.steps, props.value) : nearestIndex(props.steps, props.lowValue);
  const highInitial = props.mode === 'single' ? lowInitial : nearestIndex(props.steps, props.highValue);
  const low = useSharedValue(lowInitial);
  const high = useSharedValue(highInitial);
  const previousAngle = useSharedValue(0);
  const dragPosition = useSharedValue(0);
  // Which element the current drag grabbed, and how far the finger sat from it
  // when it did — without the offset the handle would teleport under the thumb.
  const dragTarget = useSharedValue<DialDragTarget>(0);
  const grabOffset = useSharedValue(0);
  const lastReportAt = useSharedValue(0);
  const [display, setDisplay] = useState<[number, number]>([lowInitial, highInitial]);
  const displayRef = useRef<[number, number]>([lowInitial, highInitial]);
  const lastHapticStep = useSharedValue(lowInitial + highInitial * props.steps.length);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonClamp = useRef(false);
  const count = props.steps.length;
  const firstStep = props.steps[0] ?? 0;
  const lastStep = props.steps[count - 1] ?? firstStep;
  const minimumSpan = props.mode === 'range' ? (props.minimumSpan ?? 1) : 0;

  useEffect(() => {
    const nextLow = props.mode === 'single' ? nearestIndex(props.steps, props.value) : nearestIndex(props.steps, props.lowValue);
    const nextHigh = props.mode === 'single' ? nextLow : nearestIndex(props.steps, props.highValue);
    low.value = nextLow;
    high.value = nextHigh;
    displayRef.current = [nextLow, nextHigh];
    setDisplay([nextLow, nextHigh]);
  }, [props.mode, props.steps, props.mode === 'single' ? props.value : props.lowValue, props.mode === 'single' ? props.value : props.highValue]);

  useEffect(() => () => {
    if (repeatDelay.current) clearTimeout(repeatDelay.current);
    if (repeatTimer.current) clearInterval(repeatTimer.current);
  }, []);

  function notify(nextLow: number, nextHigh: number) {
    const roundedLow = Math.round(nextLow);
    const roundedHigh = Math.round(nextHigh);
    displayRef.current = [roundedLow, roundedHigh];
    setDisplay([roundedLow, roundedHigh]);
    if (props.mode === 'single') props.onChange(props.steps[roundedLow] ?? firstStep);
    else props.onChange(props.steps[roundedLow] ?? firstStep, props.steps[roundedHigh] ?? lastStep);
  }

  const reportFromWorklet = (nextLow: number, nextHigh: number, now: number, authoritative: boolean) => {
    'worklet';
    if (shouldReportDialChange(lastReportAt.value, now, authoritative, DRAG_REPORT_INTERVAL_MS)) {
      lastReportAt.value = now;
      runOnJS(notify)(nextLow, nextHigh);
    }
  };

  const pulseStepFromWorklet = (nextLow: number, nextHigh: number) => {
    'worklet';
    const code = nextLow + nextHigh * count;
    if (code !== lastHapticStep.value) {
      lastHapticStep.value = code;
      runOnJS(pulseSelection)();
    }
  };

  function pulseSelection() { void haptic('selection'); }
  function pulseClamp() { void haptic('bind'); }

  // One gesture for the whole ring. Three detectors sharing one accumulator was
  // the earlier bug: the band's onBegin overwrote the handle's start position,
  // so grabbing the maximum handle immediately collapsed it onto the minimum.
  // Now a single pan decides on touch-down what it grabbed and never hands that
  // decision to anyone else.
  const ringGesture = Gesture.Pan()
    // The dial lives in a scrolling sheet and covers the middle of a 412 dp
    // screen. It only takes a drag that lands in the band around the ring,
    // where the handles are; anything further in or out belongs to the scroll,
    // which used to be swallowed and left the sheet feeling stuck.
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      if (touch && touchGrabsRing(touch.x, touch.y, DIAL_SIZE, RING_RADIUS, HANDLE_SIZE)) manager.activate();
      else manager.fail();
    })
    .onBegin((event) => {
      const fingerPosition = pointToPosition(event.x, event.y, DIAL_SIZE);
      const lowPosition = low.value / (count - 1);
      const highPosition = high.value / (count - 1);
      const target = resolveDragTarget(fingerPosition, lowPosition, highPosition, props.mode === 'range', BAND_GRAB_DISTANCE);

      dragTarget.value = target;
      previousAngle.value = pointToAngle(event.x, event.y, DIAL_SIZE);
      dragPosition.value = fingerPosition;
      grabOffset.value = grabOffsetFor(target, fingerPosition, lowPosition, highPosition);
      lastReportAt.value = Date.now();
    })
    .onUpdate((event) => {
      const angle = pointToAngle(event.x, event.y, DIAL_SIZE);
      dragPosition.value = accumulateDragPosition(dragPosition.value, previousAngle.value, angle);
      previousAngle.value = angle;

      const next = positionToStepIndex(dragPosition.value + grabOffset.value, count);
      const previousLow = low.value;
      const previousHigh = high.value;

      if (dragTarget.value === 2) {
        const moved = moveRange(low.value, high.value, next - low.value, 0, count - 1);
        low.value = moved[0];
        high.value = moved[1];
      } else if (dragTarget.value === 1) {
        high.value = Math.max(next, low.value + minimumSpan);
      } else {
        low.value = Math.min(next, props.mode === 'range' ? high.value - minimumSpan : count - 1);
        if (props.mode === 'single') high.value = low.value;
      }

      const atEnd = low.value === 0 || high.value === count - 1 || (props.mode === 'range' && high.value - low.value === minimumSpan);
      const moved = low.value !== previousLow || high.value !== previousHigh;
      if (atEnd && moved) runOnJS(pulseClamp)();
      pulseStepFromWorklet(low.value, high.value);
      reportFromWorklet(low.value, high.value, Date.now(), false);
    })
    .onFinalize(() => reportFromWorklet(low.value, high.value, Date.now(), true));

  const lowStyle = useAnimatedStyle(() => {
    const angle = DIAL_ARC_START + low.value / (count - 1) * DIAL_ARC_RADIANS;
    return { transform: [{ translateX: Math.cos(angle) * RING_RADIUS }, { translateY: Math.sin(angle) * RING_RADIUS }] };
  });
  const highStyle = useAnimatedStyle(() => {
    const angle = DIAL_ARC_START + high.value / (count - 1) * DIAL_ARC_RADIANS;
    return { transform: [{ translateX: Math.cos(angle) * RING_RADIUS }, { translateY: Math.sin(angle) * RING_RADIUS }] };
  });

  function adjust(which: 'low' | 'high', delta: number) {
    let nextLow = displayRef.current[0]; let nextHigh = displayRef.current[1];
    if (props.mode === 'single' || which === 'low') nextLow = Math.max(0, Math.min(props.mode === 'range' ? nextHigh - minimumSpan : count - 1, nextLow + delta));
    else nextHigh = Math.max(nextLow + minimumSpan, Math.min(count - 1, nextHigh + delta));
    const unchanged = nextLow === displayRef.current[0] && nextHigh === displayRef.current[1];
    low.value = nextLow; high.value = props.mode === 'single' ? nextLow : nextHigh;
    if (unchanged) {
      if (!buttonClamp.current) { buttonClamp.current = true; void haptic('bind'); }
      return;
    }
    buttonClamp.current = false;
    notify(nextLow, props.mode === 'single' ? nextLow : nextHigh);
  }

  function accessibilityAction(which: 'low' | 'high', event: AccessibilityActionEvent) {
    adjust(which, event.nativeEvent.actionName === 'increment' ? 1 : -1);
  }

  function startRepeat(which: 'low' | 'high', delta: number) {
    stopRepeat();
    buttonClamp.current = false;
    adjust(which, delta);
    repeatDelay.current = setTimeout(() => {
      adjust(which, delta);
      repeatTimer.current = setInterval(() => adjust(which, delta), REPEAT_RATE_MS);
    }, REPEAT_DELAY_MS);
  }
  function stopRepeat() {
    if (repeatDelay.current) { clearTimeout(repeatDelay.current); repeatDelay.current = null; }
    if (repeatTimer.current) { clearInterval(repeatTimer.current); repeatTimer.current = null; }
    buttonClamp.current = false;
  }

  const lowValue = props.steps[display[0]] ?? firstStep;
  const highValue = props.steps[display[1]] ?? lastStep;
  const format = props.formatValue ?? String;
  const readout = props.mode === 'single' ? format(lowValue) : `${format(lowValue)} – ${format(highValue)}`;
  const caption = props.mode === 'range' ? `${highValue - lowValue}` : '';
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, index) => index), []);

  const handle = (which: 'low' | 'high', style: object, label: string, now: number) => (
      <Animated.View
        key={which}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: firstStep, max: lastStep, now }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => accessibilityAction(which, event)}
        style={[{ position: 'absolute', left: DIAL_SIZE / 2 - HANDLE_SIZE / 2, top: DIAL_SIZE / 2 - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE, borderRadius: theme.radii.pill, borderWidth: theme.spacing.x1, borderColor: theme.colors.surface, backgroundColor: theme.accent.accent }, style]}
      />
  );

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.x4 }}>
      <GestureDetector gesture={ringGesture}>
        <View style={{ width: DIAL_SIZE, height: DIAL_SIZE, alignItems: 'center', justifyContent: 'center' }}>
          {ticks.map((tick) => <DialTick key={tick} tick={tick} count={count} range={props.mode === 'range'} low={low} high={high} accent={theme.accent.accent} majorTrack={theme.colors.textMuted} minorTrack={theme.colors.borderStrong} majorWidth={theme.spacing.x1} height={theme.spacing.x10} radius={theme.radii.pill} />)}
          <View style={{ width: theme.layout.dialCenterSize, height: theme.layout.dialCenterSize, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.x4 }}>
            <BinderText variant="displayL" align="center">{readout}</BinderText>
            <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x1 }}>{caption}</BinderText>
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, minWidth: 72, alignItems: 'center', backgroundColor: theme.colors.canvas, paddingHorizontal: theme.spacing.x2 }}>
            <BinderText variant="caption" tone="muted" align="center">{props.caption}</BinderText>
          </View>
          {handle('low', lowStyle, props.mode === 'single' ? props.accessibilityLabel : props.lowAccessibilityLabel, lowValue)}
          {props.mode === 'range' ? handle('high', highStyle, props.highAccessibilityLabel, highValue) : null}
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', gap: theme.spacing.x4 }}>
        {(props.mode === 'range' ? (['low', 'high'] as const) : (['low'] as const)).map((which) => (
          <View key={which} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
            <StepButton label={which === 'low' && props.mode === 'range' ? t('binderDial.accessibility.decreaseMinimum') : which === 'high' ? t('binderDial.accessibility.decreaseMaximum') : t('binderDial.accessibility.decrease', { caption: props.caption })} symbol="−" onStart={() => startRepeat(which, -1)} onStop={stopRepeat} />
            <BinderText variant="caption" tone="muted">{which === 'low' && props.mode === 'range' ? t('binderDial.labels.minimum') : which === 'high' ? t('binderDial.labels.maximum') : t('binderDial.labels.adjust')}</BinderText>
            <StepButton label={which === 'low' && props.mode === 'range' ? t('binderDial.accessibility.increaseMinimum') : which === 'high' ? t('binderDial.accessibility.increaseMaximum') : t('binderDial.accessibility.increase', { caption: props.caption })} symbol="+" onStart={() => startRepeat(which, 1)} onStop={stopRepeat} />
          </View>
        ))}
      </View>
    </View>
  );
}

const DialTick = memo(function DialTick({ tick, count, range, low, high, accent, majorTrack, minorTrack, majorWidth, height, radius }: { tick: number; count: number; range: boolean; low: SharedValue<number>; high: SharedValue<number>; accent: string; majorTrack: string; minorTrack: string; majorWidth: number; height: number; radius: number }) {
  const position = tick / (TICK_COUNT - 1);
  const major = tick % 9 === 0;
  const animatedStyle = useAnimatedStyle(() => {
    const lowPosition = low.value / (count - 1);
    const highPosition = high.value / (count - 1);
    const filled = range ? position >= lowPosition && position <= highPosition : position <= highPosition;
    return { backgroundColor: filled ? accent : major ? majorTrack : minorTrack };
  }, [accent, count, major, majorTrack, minorTrack, position, range]);
  return <Animated.View style={[{ position: 'absolute', width: major ? majorWidth : 2, height, borderRadius: radius, transform: [{ rotate: `${135 + tick * 270 / (TICK_COUNT - 1) + 90}deg` }, { translateY: -RING_RADIUS }] }, animatedStyle]} />;
});

function StepButton({ label, symbol, onStart, onStop }: { label: string; symbol: string; onStart: () => void; onStop: () => void }) {
  const { theme } = useBinderTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={onStart} onPressOut={onStop} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: theme.radii.pill, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' })}><BinderText variant="title">{symbol}</BinderText></Pressable>;
}
