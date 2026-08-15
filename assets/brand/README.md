# Binder brand assets

The production mark is a custom Binder monogram, not a generic letter tile.

The canonical source is the deterministic geometry in `scripts/materialize-brand-assets.mjs`. Generated PNGs are intentionally not committed; `npm install`, native start commands and bundle checks materialize them before Expo reads the app config.

Native asset contract:

- `icon.png` — 1024×1024 full-square launcher/store fallback.
- `adaptive-foreground.png` — transparent Android adaptive foreground with safe padding.
- `monochrome.png` — transparent Android 13+ themed/notification mark.
- `splash-icon.png` — tighter transparent splash mark for the native launch screen.

The public site copies the generated launcher mark and locally packaged Manrope fonts into its deployment artifact, so app and website share one brand source without a CDN or tracker.

All four images are generated from the same geometry. Lime remains the brand/trust accent; destructive and safety-critical UI continues to use the separate semantic danger token.

Do not add text to launcher icons or bake device-specific rounded corners into the geometry; the operating system applies launcher masks.
