import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { heartPath, liquidPath } from '../lib/liquidHeart';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = {
  size: number;
  color: string;
  active: boolean;
  /** Draw the heart's outline on top, so the shape stays readable when the
   * fill is low or the heart is small. */
  outlineColor?: string;
  /** Fill without waves or tilt. Below roughly thirty pixels a wave is one or
   * two pixels of movement, which reads as a rendering fault, not as water. */
  still?: boolean;
};

const FRAME_MS = 1000 / 30;

/**
 * A heart holding liquid: filled part-way, surface waving, and level with the
 * ground rather than with the phone — tilt the device and it tips back.
 *
 * It only runs while it is on screen and active. A decorative animation that
 * keeps a sensor and a timer alive behind a closed screen is a battery bug,
 * not a detail, so both stop the moment `active` goes false.
 */
export function LiquidHeart({ size, color, active, outlineColor, still = false }: Props) {
  const { reduceMotion } = useBinderTheme();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active || reduceMotion || still) return;
    const timer = setInterval(() => setPhase((value) => (value + 0.22) % (Math.PI * 2)), FRAME_MS);
    return () => clearInterval(timer);
  }, [active, reduceMotion, still]);



  const outline = Skia.Path.MakeFromSVGString(heartPath(size));
  const surface = Skia.Path.MakeFromSVGString(liquidPath(size, size, still ? 0 : phase, 0));
  if (!outline || !surface) return null;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group clip={outline}>
        <Path path={surface} color={color} />
      </Group>
      {outlineColor ? <Path path={outline} color={outlineColor} style="stroke" strokeWidth={Math.max(1.4, size * 0.075)} strokeJoin="round" /> : null}
    </Canvas>
  );
}
