# Binder brand assets

The production mark is a custom Binder monogram, not a generic letter tile.

Native asset contract:

- `icon.png` — 1024×1024 full-square launcher/store fallback.
- `adaptive-foreground.png` — transparent Android adaptive foreground with safe padding.
- `monochrome.png` — transparent Android 13+ themed-icon mask.
- `splash-icon.png` — tighter transparent splash mark for the native launch screen.

All four files are generated from the same geometry. Lime remains the brand/trust accent; destructive and safety-critical UI continues to use the separate semantic danger token.

Do not add text to launcher icons or use rounded corners in the source image; the operating system applies its own masks.
