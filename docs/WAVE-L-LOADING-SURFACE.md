# Wave L — the discovery loading surface

The owner approved one exception to the no-new-dependency rule on 2026-08-17:
`@shopify/react-native-skia`, for a fragment-shader loading state over a
skeleton in the shape of the discovery card. Two conditions came with it: the
cost is stated **before** the install, and measured **after** it on the S23 and
the Tab S9. This file is that record.

## 1 · Baseline, measured before the dependency exists

Commit `56ed491`, clean tree, universal release APK built locally with the
upload key.

| Metric | Value | How |
| --- | --- | --- |
| Release APK (universal, 4 ABIs) | 86,747,918 B (82.73 MiB) | `./gradlew assembleRelease` |
| Native libs, arm64-v8a only | 18,747,912 B (17.88 MiB) | `unzip -l … lib/arm64-v8a` |
| JS/Hermes export payload | 3.99 MiB (4,183,823 B) | `npm run bundlecheck` + `scripts/report-bundle-size.mjs` |
| Total Android export | 4.95 MiB (5,186,934 B) | same |
| JS/Hermes hard budget | 4.20 MiB | `scripts/report-bundle-size.mjs` |
| **Headroom under the JS budget** | **~0.21 MiB** | 4.20 − 3.99 MiB |
| Cold start, Tab S9 Ultra (SM-X910, Android 16) | 262 / 267 / 278 / 281 / 286 ms, median 278 ms | `am start -W` after `force-stop`, 5 runs |
| Cold start, S23 Ultra (SM-S918B, Android 16) | 318 / 318 / 371 / 408 / 533 ms, median 371 ms | same, measured after the udev rule made the phone visible to `adb` |

## 2 · Expected cost, stated before installing

Derived from the package itself (`@shopify/react-native-skia@2.11.0`, prebuilt
Skia binaries pulled in through `react-native-skia-android@152.0.0`, static
`libskia.a` linked into `libreactnativeskia.so` per ABI), not from blog posts.

| Metric | Expectation |
| --- | --- |
| Native size per ABI | +5–8 MB — this is what a Play user actually downloads |
| Universal APK (4 ABIs) | +20–30 MB, so roughly 107–117 MB |
| JS/Hermes payload | +0.25–0.45 MiB (the library ships 391 KB of module source and its index re-exports nearly all of it) |
| **JS budget** | **will be exceeded.** 0.21 MiB of headroom against a delta measured in hundreds of KB |
| Cold start | +20–60 ms (native lib load + JSI install at startup) |
| Frames during the loading state | under 5 % janky (wave C budget); the shader runs on the GPU, uniforms on the UI thread |

The JS budget breach is the one that needs a decision rather than a
measurement: raising `maxJsMiB` in `scripts/report-bundle-size.mjs` is
weakening a gate, which rule 2 forbids without the owner saying so. The
alternatives are (a) the owner raises the budget explicitly, with the new
number written down here, or (b) the dependency-free fallback ships instead —
the current gradient/orbit loading state, reworked rather than replaced.

## 3 · Measured cost, after the install

Measured on the shipped tree (`v0.5.4`, versionCode 7, staged in
`/home/belkis/Binder-Release/`), installed on both devices over USB. The
version note matters: `@shopify/react-native-skia` resolves to **2.6.2** under
Expo SDK 57 (`npx expo install`), not the 2.11.0 the estimate was read from.

| Metric | Baseline | With Skia | Delta |
| --- | --- | --- | --- |
| Release APK (universal, 4 ABIs) | 82.73 MiB | 124.30 MiB | **+41.57 MiB** |
| Native libs, arm64-v8a (what an arm64 phone downloads) | 17.88 MiB | 28.73 MiB | **+10.85 MiB** (`librnskia.so` 11.30 MB) |
| JS/Hermes payload | 3.99 MiB | 4.55 MiB | +0.56 MiB |
| Total Android export | 4.95 MiB | 5.51 MiB | +0.56 MiB |
| Cold start, S23 Ultra (median of 5) | 371 ms | 351 ms | −20 ms (inside the run-to-run spread) |
| Cold start, Tab S9 Ultra (median of 5) | 278 ms | 301 ms | +23 ms |

Frames while the loading surface is on screen. The state normally lasts under a
second, so the numbers were taken from a throwaway measurement build that holds
`loading` true; that patch was never committed and never staged. `dumpsys
gfxinfo` was reset two seconds after launch so start-up frames stay out of the
sample, then sampled for four seconds:

| Device | Frames | Janky | Missed vsync | 95th percentile | 95th GPU percentile |
| --- | --- | --- | --- | --- | --- |
| S23 Ultra | 678 | **0.00 %** | 0 | 7 ms | 6 ms |
| Tab S9 Ultra | 611 | **0.16 %** | 0 | 8 ms | 6 ms |

Reduced motion (`animator_duration_scale`, `transition_animation_scale` and
`window_animation_scale` all 0): **0 frames rendered in 4 seconds** — the aurora
is a still frame that still reads as waiting, exactly as the wave asked, and it
costs nothing to keep on screen.

### Where the estimate was wrong

- Native size per ABI: estimated +5–8 MB, measured **+10.85 MiB**. The universal
  APK grew by 41.57 MiB instead of the predicted 20–30 MB, because all four
  ABIs carry a `librnskia.so` of 7.7–12.1 MB each. A Play install still only
  downloads its own ABI, so the number a user feels is the +10.85 MiB one.
- JS payload: estimated +0.25–0.45 MiB, measured **+0.56 MiB** — worse than
  promised, and said so here rather than quietly.
- Cold start and frame timing came in better than the estimate: no measurable
  start-up regression on the phone, +23 ms on the tablet, and a loading surface
  that renders at 0.00 % / 0.16 % janky frames against a 5 % budget.

### The budget decision

Both bundle budgets were breached by the measured numbers, so on 2026-08-17 the
owner took the cost and raised them once, to the measured value plus deliberate
headroom: JS/Hermes 4.20 → **4.90 MiB**, total export 5.25 → **5.90 MiB**
(`scripts/report-bundle-size.mjs`). The measurement that justifies each number
is the table above. Anything that pushes past it is a new decision.
