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
| JS/Hermes export payload | 4.18 MiB (4,183,823 B) | `npm run bundlecheck` + `scripts/report-bundle-size.mjs` |
| Total Android export | 4.95 MiB (5,186,934 B) | same |
| JS/Hermes hard budget | 4.20 MiB | `scripts/report-bundle-size.mjs` |
| **Headroom under the JS budget** | **~21 KB** | 4.20 − 4.18 MiB |
| Cold start, Tab S9 Ultra (SM-X910, Android 16) | 262 / 267 / 278 / 281 / 286 ms, median 278 ms | `am start -W` after `force-stop`, 5 runs |
| Cold start, S23 Ultra | not measured — device was not attached | — |

## 2 · Expected cost, stated before installing

Derived from the package itself (`@shopify/react-native-skia@2.11.0`, prebuilt
Skia binaries pulled in through `react-native-skia-android@152.0.0`, static
`libskia.a` linked into `libreactnativeskia.so` per ABI), not from blog posts.

| Metric | Expectation |
| --- | --- |
| Native size per ABI | +5–8 MB — this is what a Play user actually downloads |
| Universal APK (4 ABIs) | +20–30 MB, so roughly 107–117 MB |
| JS/Hermes payload | +0.25–0.45 MiB (the library ships 391 KB of module source and its index re-exports nearly all of it) |
| **JS budget** | **will be exceeded.** 21 KB of headroom against a delta measured in hundreds of KB |
| Cold start | +20–60 ms (native lib load + JSI install at startup) |
| Frames during the loading state | under 5 % janky (wave C budget); the shader runs on the GPU, uniforms on the UI thread |

The JS budget breach is the one that needs a decision rather than a
measurement: raising `maxJsMiB` in `scripts/report-bundle-size.mjs` is
weakening a gate, which rule 2 forbids without the owner saying so. The
alternatives are (a) the owner raises the budget explicitly, with the new
number written down here, or (b) the dependency-free fallback ships instead —
the current gradient/orbit loading state, reworked rather than replaced.

## 3 · Measured cost, after the install

Filled in once the build exists. Nothing here is written from a diff.

| Metric | Baseline | After Skia | Delta |
| --- | --- | --- | --- |
| Release APK (universal) | 82.73 MiB | — | — |
| Native libs, arm64-v8a | 17.88 MiB | — | — |
| JS/Hermes payload | 4.18 MiB | — | — |
| Cold start, S23 Ultra | — | — | — |
| Cold start, Tab S9 Ultra | 278 ms median | — | — |
| Janky frames, loading state, S23 | — | — | — |
| Janky frames, loading state, Tab S9 | — | — | — |
