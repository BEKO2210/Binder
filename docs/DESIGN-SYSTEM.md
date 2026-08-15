# Binder Visual System

This document defines the visual quality bar for Phase 6. The goal is a coherent consumer product, not a collection of individually styled screens.

## Brand principle

Binder should feel confident, modern and intentional without copying Tinder or leaning on generic dating-app clichés.

Avoid:
- flame motifs;
- gradients used only to imply "dating";
- neon everywhere;
- random emojis as controls;
- mixed icon families;
- oversized glassmorphism decoration;
- fake premium cues;
- visual patterns associated with paywalls/locked likes.

The identity should communicate mutual choice, connection and restraint.

## Logo system

Required assets:
- primary Binder wordmark;
- compact Binder symbol/monogram;
- light-on-dark version;
- dark-on-light version;
- one-color version;
- Android adaptive foreground asset;
- Android monochrome themed-icon asset;
- favicon/social square;
- splash mark.

Logo acceptance criteria:
- recognizable without text at 24 px;
- no hairline details that disappear at launcher size;
- survives monochrome rendering;
- does not rely on gradients;
- optically centered inside Android adaptive-icon safe zone;
- no direct resemblance to Tinder, Bumble, Hinge or another dating brand.

Preferred conceptual direction:
- abstract "B" or two interlocking forms representing mutual selection;
- geometric enough for an app icon;
- rounded enough to avoid a cold enterprise identity.

## Color tokens

Base dark palette:

```text
canvas             #090A0F
surface            #12141B
surfaceElevated    #181B24
surfacePressed     #20232D
borderSubtle       #2A2F3A
borderStrong       #3A404D
textPrimary        #F7F8F3
textSecondary      #B6BBC4
textMuted          #858C98
accentPrimary      #C7FF4A
accentPressed      #A8DE31
warning            #F3C969
destructive        #FF5A76
destructiveSoft    #211318
```

Rules:
- `accentPrimary` means progress, selected state or trusted primary action.
- `destructive` is reserved for delete/report/block/irreversible commitments.
- `warning` means pending/attention, never destruction.
- muted text must still pass its intended contrast requirement.
- themes can alter accent tokens only; they cannot alter warning/destructive semantics.

## User-selectable accent themes

Phase 6 may expose a small curated accessible set, for example:
- Binder Lime;
- Electric Blue;
- Violet;
- Coral;
- Ice.

Each theme must pass contrast tests against both canvas and surfaces. Arbitrary color pickers are intentionally avoided because they make accessibility and semantic consistency unverifiable.

## Typography

Use one professional sans-serif family across the application. Do not mix display fonts and body fonts unless the visual review proves a real benefit.

Before choosing the bundled family, compare at least:
- Inter;
- Manrope;
- Instrument Sans or another well-maintained open alternative.

Selection criteria:
- excellent Android rendering;
- clear lowercase and numerals;
- readable at 11–16 sp;
- strong but not gimmicky display weights;
- acceptable bundle-size impact;
- license compatible with the repository/product.

Type scale target:

```text
Display XL    40 / 44   800–900
Display L     34 / 38   800–900
Heading       26 / 31   800
Title         20 / 25   700–800
Body L        17 / 25   500
Body          15 / 22   400–500
Label         13 / 17   700
Caption       11 / 15   500–700
Micro         10 / 13   700–900 + tracking only where appropriate
```

Rules:
- no screen invents its own font sizes;
- avoid all-caps except short micro labels/eyebrows;
- long legal/safety copy uses body typography, not caption text;
- respect Android font scaling;
- never fix a layout problem by disabling font scaling globally.

## Iconography

Choose one canonical vector icon family and use it everywhere unless a custom Binder mark is required.

Rules:
- standard control grid: 24 x 24;
- compact controls: 20 x 20;
- consistent optical stroke weight;
- active state is communicated by color/fill/background, not by switching to an unrelated glyph style;
- no Unicode `♥`, `×`, arrows or emoji as final production controls;
- destructive icons use the destructive semantic color only inside destructive contexts;
- every icon-only control has an accessibility label and at least a 48 dp hit area.

Custom icons are allowed only for Binder-specific concepts that the canonical set cannot express clearly.

## Photography and profile imagery

User photos are content, not decoration. The UI must make them look excellent without altering identity.

Rules:
- preserve aspect ratio;
- use consistent card crops;
- never apply beauty filters;
- no automatic skin smoothing or face reshaping;
- do not expose EXIF metadata;
- show moderation state separately from the photo itself;
- use a neutral placeholder while loading, not a fake user image;
- use low-resolution/blur placeholder only if it measurably improves loading without privacy leakage.

Marketing/site imagery:
- use original Binder artwork or properly licensed/generated assets;
- no copied dating-app screenshots;
- final store screenshots must come from the real final UI;
- device mockups are secondary to readable real interface content.

## Image compression quality target

Profile upload pipeline target:
- correct orientation first;
- strip unnecessary metadata;
- longest edge capped around 1080 px;
- WebP around 80–82%;
- benchmark before changing the Phase-1 storage contract.

Quality test set must include:
- close portrait with hair detail;
- low-light portrait;
- high-contrast outdoor image;
- detailed clothing/background;
- skin gradients;
- landscape/full-body composition.

Reject a compression setting if visible facial artifacts appear at normal phone viewing size, even if the file is smaller.

## Spacing

Use a 4 dp base grid.

Preferred scale:

```text
4  8  12  16  20  24  32  40  48  64
```

Do not use arbitrary values when a scale token fits.

Common screen horizontal padding should be centralized and consistent.

## Radius

Keep a small deliberate radius system:

```text
small     10–12
control   14–16
card      20–24
hero      26–30
pill      999
```

Do not make every rectangle a different radius.

## Buttons

Variants:
- Primary
- Secondary
- Ghost
- Destructive
- Icon

Every button implements:
- default;
- pressed;
- disabled;
- loading;
- accessibility label/state.

Primary button:
- accent fill;
- dark foreground;
- one dominant primary action per section/screen where possible.

Destructive button:
- destructive token only;
- never visually confused with the main positive CTA;
- irreversible actions require explicit confirmation.

## Inputs

States:
- idle;
- focused;
- filled;
- invalid;
- disabled.

Rules:
- labels remain visible; do not depend only on placeholders;
- validation text explains the actual correction;
- keyboard type/action matches the field;
- focus outline/border is visible in every theme.

## Cards

Discovery profile card is the visual hero and must not become a generic settings card.

Other cards use shared surface/border/radius tokens.

Avoid excessive shadows on dark surfaces. Prefer border/elevation contrast and very restrained shadows where they improve layering.

## Motion

Motion durations should come from a small token set, approximately:
- fast: 120 ms;
- standard: 180 ms;
- deliberate: 240 ms.

Use spring motion for direct-manipulation gestures only when it communicates physics/state.

Respect Reduce Motion:
- replace large translations/scales with fades or immediate transitions;
- no required information may exist only inside animation.

## Haptics

Use only for meaningful state transitions:
- successful Bind decision;
- mutual Bind confirmation;
- destructive confirmation;
- selected control where tactile feedback materially helps.

Settings must allow Binder haptics to be disabled.

Do not vibrate for every tap.

## Empty/loading/error states

Every data screen defines all four:
- loading;
- empty;
- error;
- offline/retry where applicable.

No blank white/black screen is an accepted state.

Skeletons are allowed only when layout is known and they genuinely reduce perceived movement.

## Accessibility

Hard requirements:
- minimum 48 dp hit target for interactive controls;
- WCAG AA contrast for normal copy/actions;
- screen-reader labels for icon controls;
- large-text test;
- no color-only status indication;
- Reduce Motion honored;
- logical focus order;
- destructive confirmations announced correctly.

## Professional visual QA gate

Phase 6 cannot be declared complete from TypeScript/Metro alone.

Required visual proof set:
- Auth
- Legal Gate
- Onboarding
- Discovery default
- Discovery safety sheet
- It's a Bind
- Matches empty + populated
- Chat empty + populated + send failure
- Profile
- Photo gallery/pending/rejected states
- Settings
- Notifications settings
- Delete Account confirmation

For each key screen capture:
- small Android phone;
- 412 px reference phone;
- large Android phone;
- normal font;
- enlarged font where layout risk exists.

Review checklist:
- hierarchy obvious in under two seconds;
- one clear primary action;
- no clipped text;
- no inconsistent spacing/radius/icon style;
- no semantic color misuse;
- photos remain the focus in discovery;
- controls look like the same product on every screen.
