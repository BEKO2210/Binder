# Binder brand assets

The Binder mark shows **two people** as **interlocking rounded bodies** joined
at the shoulder — a mutual bond, mirrored in the match moment of the app. The
mark is flat Binder Lime `#C7FF4A` on canonical dark `#090A0F`; the negative
space between the two bodies is part of the drawing and must not be filled.

Masters live in `assets/brand-src/` as 1024x1024 PNGs:

- `icon.png` — full-bleed launcher/store icon (mark on dark)
- `adaptive-foreground.png` — mark on transparency inside the Android
  adaptive-icon safe zone
- `monochrome.png` — white mark on transparency for Android themed icons and
  the notification small icon
- `splash-icon.png` — splash mark on dark

`npm run brand:assets` materializes the masters into `assets/brand/` for Expo.
Regenerating or restyling the mark is a deliberate brand decision: replace the
masters, keep the meaning, and keep everything flat — no gradient, no shadow.
