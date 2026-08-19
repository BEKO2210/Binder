import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';

import { heartPath, liquidPath, tiltFromGravity } from '../lib/liquidHeart';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { size: number; color: string; active: boolean };

const FRAME_MS = 1000 / 30;
const SENSOR_MS = 1000 / 20;

/**
 * A heart holding liquid: filled part-way, surface waving, and level with the
 * ground rather than with the phone — tilt the device and it tips back.
 *
 * It only runs while it is on screen and active. A decorative animation that
 * keeps a sensor and a timer alive behind a closed screen is a battery bug,
 * not a detail, so both stop the moment `active` goes false.
 */
export function LiquidHeart({ size, color, active }: Props) {
  const { reduceMotion } = useBinderTheme();
  const [phase, setPhase] = useState(0);
  const [tilt, setTilt] = useState(0);

  useEffect(() => {
    if (!active || reduceMotion) return;
    const timer = setInterval(() => setPhase((value) => (value + 0.22) % (Math.PI * 2)), FRAME_MS);
    return () => clearInterval(timer);
  }, [active, reduceMotion]);

  useEffect(() => {
    if (!active) return;
    Accelerometer.setUpdateInterval(SENSOR_MS);
    const subscription = Accelerometer.addListener(({ x }) => {
      // Ease towards the reading instead of following it exactly: raw
      // accelerometer output jitters, and jitter in a water surface looks
      // like a rendering fault rather than like water.
      setTilt((current) => current + (tiltFromGravity(x) - current) * 0.18);
    });
    return () => subscription.remove();
  }, [active]);

  const outline = Skia.Path.MakeFromSVGString(heartPath(size));
  const surface = Skia.Path.MakeFromSVGString(liquidPath(size, size, phase, reduceMotion ? 0 : tilt));
  if (!outline || !surface) return null;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group clip={outline}>
        <Path path={surface} color={color} />
      </Group>
    </Canvas>
  );
}
