# Binder design system

This document is the implementation contract for Binder's interface. It describes the values exported by `src/theme/tokens.ts` and the primitives in `src/components/ui`; it is not a mood board. Product UI must consume these named tokens. Screens and components must not introduce literal colours, type sizes, corner radii, or animation durations.

## Foundations

Binder uses Manrope. A text variant supplies its family, size and line height as one unit; do not combine a size from one variant with the line height of another.

| Variant | Weight | Size / line height | Intended use |
| --- | --- | ---: | --- |
| `displayXL` | ExtraBold 800 | 40 / 44dp | Singular hero statements |
| `displayL` | ExtraBold 800 | 34 / 38dp | Screen-level display heading |
| `heading` | ExtraBold 800 | 26 / 31dp | Major section heading |
| `title` | Bold 700 | 20 / 25dp | Card, dialog, and state title |
| `bodyL` | Medium 500 | 17 / 25dp | Emphasised introductory copy |
| `body` | Regular 400 | 15 / 22dp | Default reading text and inputs |
| `label` | Bold 700 | 13 / 17dp | Buttons, fields, chips, compact headers |
| `caption` | Medium 500 | 11 / 15dp | Helper text and metadata |
| `micro` | ExtraBold 800 | 10 / 13dp | Short uppercase eyebrow only |

The rhythm is deliberately tighter for display text and roomier for reading text. `displayXL`, `displayL`, `heading`, `title`, and `micro` also carry their token-defined letter spacing. Text is “large” for WCAG only at 24dp regular or 18.66dp bold and above; all smaller variants are tested at the stricter 4.5:1 threshold.

The spacing scale is a 4dp grid: `x1` 4, `x2` 8, `x3` 12, `x4` 16, `x5` 20, `x6` 24, `x8` 32, `x10` 40, `x12` 48, and `x16` 64dp. `screen` is the semantic 20dp screen gutter. Fixed interaction and media dimensions live under `layout`, not spacing. In particular, standard controls are 52dp tall. The legacy minimum touch token is 44dp; icon buttons enforce the stricter 48dp target.

Corner radii are `small` 12dp, `control` 16dp, `card` 22dp, `hero` 28dp, and `pill` 999dp. Use `pill` only where a capsule or circle is intended. The two audited exceptions are the legal-consent checkbox (8dp) and the bitmap brand mark (11/13dp); both are named in the verifier allowlist.

Elevation has three levels. `flat` has no native elevation or shadow. `raised` uses Android elevation 3 and an iOS shadow with opacity 0.18, radius 8, and y-offset 3. `floating` uses elevation 8 and shadow opacity 0.26, radius 18, and y-offset 8. Shadows use the platform's default dark shadow colour; elevation never replaces a surface or border token.

Two scheme-specific scrims exist. `scrim` is the lighter interruption layer: black at 48% in dark mode and near-black at 34% in light mode. `overlay` is the strong modal/photo layer: near-black at 88% in dark mode and 76% in light mode. `transparent` means no painted surface. Content shown over either translucent level must supply its own opaque semantic surface or use `textPrimary` only where the composited background has been tested.

## Colour roles and contrast

Binder supports dark and light schemes plus five accents: lime, blue, violet, coral, and ice. A role describes meaning, never a particular hex value.

| Role | Meaning and permitted use |
| --- | --- |
| `canvas` | App and screen background |
| `surface` | Standard cards, fields, bars, and sheets |
| `surfaceElevated` | Nested or raised content and disabled field fill |
| `surfacePressed` | Momentary pressed feedback; not a selected state |
| `borderSubtle` | Dividers and non-essential containment; it is not an interactive-state indicator |
| `borderStrong` | Stronger structural boundary; do not use as the only control-state cue |
| `textPrimary` | Main copy and icons |
| `textSecondary` | Supporting copy and secondary icons |
| `textMuted` | Helper text and metadata on canvas, surface, or elevated surface |
| `accent.accent` | Selected or primary-control fill |
| `accent.pressed` | Pressed primary/selected fill |
| `accent.foreground` | Text/icons on accent fills |
| `accent.onSurface` | Accent-coloured text/icons on neutral surfaces; resolved per scheme |
| `warning` | Warning text/icon/status only; resolved darker in light mode |
| `success` | Confirmed success text/icon/status only; resolved darker in light mode |
| `destructive` | Destructive text, icon, border, or button fill |
| `destructivePressed` | Pressed destructive button fill |
| `destructiveForeground` | Text/icons on destructive fills |
| `destructiveSoftDark/Light` | Scheme-matched danger-zone background |

`semanticContrastPairs()` is the authoritative allowlist of foreground/background relationships. Every pair is exercised in both schemes by `tests/designTokens.test.ts`: body text must be at least 4.5:1; large text and meaningful non-text controls must be at least 3:1. Subtle decorative borders are intentionally not control indicators and therefore are not registered as non-text pairings. Adding a colour treatment means adding its pairing to that registry and passing the test.

## Motion

Durations are `fast` 120ms, `standard` 180ms, `deliberate` 240ms, `feedback` 260ms, `entrance` 350ms, and `context` 600ms. Use fast/standard for local feedback, deliberate/feedback for a control or small region, entrance for staged appearance, and context only when the user's spatial context changes. Staggered entrances step by 36ms and cap at 180ms. Press feedback scales to 0.97.

The `professional` spring is damping 26, stiffness 320, mass 1; it is the default physical transition. The `celebratory` spring is damping 12, stiffness 200, mass 1 and is reserved for explicit celebration. Reduce Motion collapses durations and stagger to zero, keeps press scale at 1, and resolves springs to damping 100/stiffness 1000/mass 1. Always use the motion policy rather than branching independently.

## Component anatomy and states

Every interactive component exposes accessibility state alongside its visual state. “Loading” means the action is in progress and cannot be activated twice. “Error” is validation or server failure, never a decorative red treatment. “Selected” is persistent choice; it must not be represented by pressed feedback alone.

| Component | Anatomy | Default | Pressed | Disabled | Loading | Error | Selected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `BinderButton` | 52dp container, optional leading icon, label | Primary accent, secondary elevated, ghost transparent, or destructive fill | Corresponding pressed fill plus 0.97 scale | 0.6 opacity; activation blocked | Spinner replaces contents; disabled and `busy` announced | Expressed by surrounding error/state copy, not an internal button state | Not supported; use chip or icon toggle |
| `BinderChip` | 44dp-minimum pill, border, label | Surface, subtle border, secondary label | Pressed surface plus scale | 0.6 opacity; activation blocked and announced | Not supported; disable it and show section progress | Not internal; pair with adjacent error copy | Accent fill/border and accent foreground; announced selected |
| `BinderIconButton` | 48×48dp control and decorative glyph | Transparent, secondary icon | Pressed surface plus scale | 0.6 opacity; activation blocked and announced | Not internal; disable and replace/neighbor with progress | `destructive` prop gives the danger role | Accent-on-surface icon; announced selected |
| `BinderInput` | Label, 52dp field, optional reveal control, helper/error line | Surface, subtle border, body typography | No press fill; focus changes border to accent | Elevated fill, 0.6 opacity, non-editable | Owned by the submitting form; field remains readable while submit control loads | Destructive label/border and caption message | Not applicable; focus is not selection |
| `BinderDial` | Caption/readout, arc, band, one or two handles, step buttons | Current value/range rendered on arc | Drag or held step updates value with haptics | No disabled prop exists | Not supported | Clamped boundaries pulse; validation belongs to containing form | Current handle position/range is the selection and is accessibility-adjustable |
| `MotionPressable` | Animated wrapper around caller content | Caller style | Standard timed 0.97 scale and optional pressed surface | Native Pressable block | Caller-owned | Caller-owned | Caller-owned; must set accessibility state |
| `BinderCard` | Surface, subtle 1dp border, 22dp radius, 20dp padding | Static surface | Only when wrapped by a Pressable; wrapper supplies state | Caller-owned | Caller-owned | Caller may use semantic destructive border/soft surface | Caller-owned |
| `BinderScreenHeader` | Optional leading control, title/eyebrow, trailing content | Canvas with bottom divider | Title gets pressed surface only when actionable | Title Pressable disabled when no action | Caller-owned trailing progress | Caller-owned screen state | Not applicable |
| `ScreenState` | Optional icon/spinner, title, message, optional action | `empty`, `offline`, or `permission` content | Optional action uses button contract | Action owns disabled state | Large accent spinner | Destructive icon plus recovery copy/action | Not applicable |
| `BinderText` | Semantic variant, tone, alignment | Primary body by default | Not applicable | Inherits containing control treatment | Not applicable | Destructive tone | Accent tone may label selection but cannot establish it alone |
| `BinderBrand` | Bitmap mark and optional wordmark | Full or compact lockup | Not interactive | Not applicable | Not applicable | Not applicable | Not applicable |
| `SectionHeader` | Optional eyebrow, display title, optional body copy | Static hierarchy | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |
| `ChangingNumber` | Animated value using BinderText | Current number | Value changes use token durations | Inherits parent | Not applicable | Inherits parent | New value is the current selection/readout |

The table records the implementation as it exists. A state marked caller-owned must be visibly and accessibly supplied by the composition; a state marked unsupported must not be improvised with local literals. If product requirements need that state to become intrinsic, extend the primitive, its tests, this table, and the contrast registry together.

## Audit procedure

Run `npm run verify:design-contract` to scan all screens and components for literal six-digit colours, `rgba()`, `fontSize`, `borderRadius`, and animation durations. Its two geometry exceptions are exact-string allowlist entries with reasons, and stale entries fail. Run `npm run typecheck:tests` and `npm test` to typecheck and execute the contrast contract. CI runs the verifier on every push and pull request.
