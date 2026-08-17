import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colorToUnitRgb } from '../lib/shaderColor';
import { accentThemes, darkPalette } from '../theme/tokens';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderText } from './ui';

// An aurora, not a gradient: three thin curtains drift across the upper card,
// their cores bloom into white, vertical striation gives them the texture a
// real aurora has, and film grain stops the falloff from banding on OLED.
// Everything is periodic in u_phase, so the linear 0→1 loop wraps with no seam.
// Every colour arrives as a uniform — the shader owns no palette of its own.
const auroraSource = Skia.RuntimeEffect.Make(`
uniform float2 u_size;
uniform float u_phase;
uniform float3 u_night;
uniform float3 u_nightLift;
uniform float3 u_accent;
uniform float3 u_core;
uniform float3 u_edge;
uniform float u_grain;

const float TAU = 6.2831853;

float hash(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

float valueNoise(float2 p) {
  float2 cell = floor(p);
  float2 offset = fract(p);
  float2 weight = offset * offset * (3.0 - 2.0 * offset);
  float corner00 = hash(cell);
  float corner10 = hash(cell + float2(1.0, 0.0));
  float corner01 = hash(cell + float2(0.0, 1.0));
  float corner11 = hash(cell + float2(1.0, 1.0));
  return mix(mix(corner00, corner10, weight.x), mix(corner01, corner11, weight.x), weight.y);
}

// Three octaves: at this scale a fourth one costs four more hashes per pixel
// and is invisible under the grain.
float fbm(float2 p) {
  float value = 0.57 * valueNoise(p);
  value += 0.29 * valueNoise(p * 2.03);
  value += 0.14 * valueNoise(p * 4.11);
  return value;
}

half4 main(float2 xy) {
  float2 uv = xy / u_size;
  float aspect = u_size.x / max(u_size.y, 1.0);
  float angle = u_phase * TAU;
  float2 drift = float2(cos(angle), sin(angle)) * 0.32;

  // One warp field for all three curtains: they share the shape of the sky and
  // differ analytically, which costs one fbm instead of four. The phase shifts
  // keep them from reading as three copies of the same line.
  float field = fbm(float2(uv.x * 2.1, uv.y * 1.1) + drift);
  float curve = (field - 0.5) * 0.22;
  float sway = sin(uv.x * 6.0 + angle) * 0.026;
  float counterSway = sin(uv.x * 3.4 - angle) * 0.020;

  // Each curtain gets its own share of the warp plus its own sway, so they
  // read as three separate curtains rather than one wave drawn three times.
  float divergence = (valueNoise(float2(uv.x * 3.1, uv.y * 1.4) + drift * 1.7) - 0.5) * 0.10;
  float firstOffset = uv.y - (0.31 + curve);
  float secondOffset = uv.y - (0.45 + curve * 0.62 + sway + divergence);
  float thirdOffset = uv.y - (0.20 + curve * 1.25 + counterSway - divergence * 0.7);

  // Each curtain is a hot filament inside a wide halo — that pairing is what
  // separates a light source from a green gradient.
  float firstSquared = firstOffset * firstOffset;
  float secondSquared = secondOffset * secondOffset;
  float thirdSquared = thirdOffset * thirdOffset;

  float filament = exp(-firstSquared / 0.00035) * 0.90
                 + exp(-secondSquared / 0.00025) * 0.70
                 + exp(-thirdSquared / 0.00060) * 0.50;
  float halo = exp(-firstSquared / 0.0120) * 0.55
             + exp(-secondSquared / 0.0080) * 0.40
             + exp(-thirdSquared / 0.0200) * 0.30;

  // Striation runs along the curtain, which is what makes it read as fabric
  // rather than as a gradient: high frequency in x, almost none in y.
  float striation = 0.52 + 0.48 * valueNoise(float2(uv.x * 16.0 + drift.x * 4.0, uv.y * 0.30));
  float fade = smoothstep(0.96, 0.26, uv.y);
  float core = clamp(filament * striation * fade, 0.0, 1.0);
  float wash = clamp(halo * (0.60 + 0.40 * striation) * fade, 0.0, 1.0);

  float3 color = mix(u_night, u_nightLift, smoothstep(1.0, 0.0, uv.y) * 0.55);
  color += u_edge * wash * 0.18;
  color += u_accent * (wash * 0.42 + core * 0.88);
  color += u_core * core * core * 0.85;

  float vignette = smoothstep(1.25, 0.30, length((uv - float2(0.5, 0.40)) * float2(aspect * 0.55 + 0.45, 1.0)));
  color *= mix(0.78, 1.0, vignette);

  // Grain only where there is light to disturb: black stays black on OLED.
  float luminance = max(color.r, max(color.g, color.b));
  color += (hash(xy) - 0.5) * u_grain * smoothstep(0.02, 0.30, luminance);

  return half4(clamp(color, 0.0, 1.0), 1.0);
}
`);

// Shader constants, not motion: grain amplitude, and the point in the loop
// where the still frame shows all three curtains inside the card.
const grainAmplitude = 0.012;
const stillFramePhase = 0.18;
const skeletonRest = 0.62;
const skeletonPeak = 0.92;

export function DiscoveryLoading() {
  const { theme, reduceMotion, t } = useBinderTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const phase = useSharedValue(stillFramePhase);
  const breath = useSharedValue(skeletonPeak);

  useEffect(() => {
    if (reduceMotion) { phase.value = stillFramePhase; breath.value = skeletonPeak; return; }
    phase.value = 0;
    phase.value = withRepeat(withTiming(1, { duration: theme.motion.context * 14, easing: Easing.linear }), -1, false);
    breath.value = skeletonPeak;
    breath.value = withRepeat(withTiming(skeletonRest, { duration: theme.motion.context * 2, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, theme.motion.context]);

  // The media area of a discovery card is a photo under a scrim — dark in both
  // schemes. The aurora sits in that same well, so it takes the dark palette in
  // light mode too; the card's frame, skeleton and chip follow the theme.
  // Memoised: a fresh array on every render would rebuild the uniforms.
  const night = useMemo(() => colorToUnitRgb(darkPalette.canvas), []);
  const nightLift = useMemo(() => colorToUnitRgb(darkPalette.surfaceElevated), []);
  const core = useMemo(() => colorToUnitRgb(darkPalette.textPrimary), []);
  const accent = useMemo(() => colorToUnitRgb(theme.accent.onDark), [theme.accent.onDark]);
  // The cool edge a real aurora has where the green falls off.
  const edge = useMemo(() => colorToUnitRgb(accentThemes.ice.onDark), []);

  const uniforms = useDerivedValue(() => ({
    u_size: [Math.max(size.width, 1), Math.max(size.height, 1)],
    u_phase: phase.value,
    u_night: night,
    u_nightLift: nightLift,
    u_accent: accent,
    u_core: core,
    u_edge: edge,
    u_grain: grainAmplitude,
  }), [size.width, size.height, night, nightLift, accent, core, edge]);

  const skeletonStyle = useAnimatedStyle(() => ({ opacity: breath.value }));

  const bar = (width: `${number}%`, height: number) => ({
    width, height, borderRadius: theme.radii.small, backgroundColor: theme.colors.surfaceElevated,
  } as const);
  const pill = (width: `${number}%`) => ({
    width, height: theme.typography.caption.lineHeight + theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated,
  } as const);

  // The skeleton is the discovery card's own geometry — full-bleed media, the
  // same scrim, the same bottom block — so nothing moves when the deck lands.
  return (
    <View style={{ flex: 1 }} accessibilityRole="progressbar" accessibilityLabel={t('discoveryLoading.accessibility.finding')} accessibilityLiveRegion="polite">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
        }}
        style={{ position: 'absolute', inset: 0, borderRadius: theme.radii.hero, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle }}
      >
        {auroraSource && size.width > 0 && size.height > 0 ? (
          <Canvas style={{ position: 'absolute', inset: 0 }}>
            <Fill><Shader source={auroraSource} uniforms={uniforms} /></Fill>
          </Canvas>
        ) : (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.surfaceElevated }} />
        )}

        <LinearGradient pointerEvents="none" colors={[theme.colors.transparent, theme.colors.scrim, theme.colors.overlay]} locations={[0, 0.52, 1]} style={{ position: 'absolute', inset: 0 }} />

        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: theme.spacing.x5, right: theme.spacing.x5, bottom: theme.spacing.x5 }, skeletonStyle]}>
          <View style={bar('62%', theme.typography.displayL.lineHeight)} />
          <View style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x2 }}>
            <View style={bar('30%', theme.typography.caption.lineHeight)} />
            <View style={bar('26%', theme.typography.caption.lineHeight)} />
          </View>
          <View style={{ marginTop: theme.spacing.x2, gap: theme.spacing.x1 }}>
            <View style={bar('92%', theme.typography.body.lineHeight)} />
            <View style={bar('74%', theme.typography.body.lineHeight)} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>
            <View style={pill('28%')} />
            <View style={pill('24%')} />
            <View style={pill('30%')} />
          </View>
        </Animated.View>

        <View pointerEvents="none" style={{ position: 'absolute', top: theme.spacing.x5, left: theme.spacing.x5, right: theme.spacing.x5, alignItems: 'center' }}>
          <View style={{ backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x2 }}>
            <BinderText variant="caption" tone="secondary">{t('discoveryLoading.states.finding')}</BinderText>
          </View>
        </View>
      </View>
    </View>
  );
}
