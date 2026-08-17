# Adding a language

Binder ships in English. A second language exists as soon as its file does —
no code change, no release engineering, no strings scattered across screens.

## What you do

1. Copy `src/i18n/locales/en.json` to `src/i18n/locales/de.json`
   (or any other ISO 639-1 code: `fr.json`, `tr.json`, …).
2. Translate the **values**. Leave the keys exactly as they are.
3. Set the header at the top of the file so the picker can name the language
   in its own words:

   ```json
   "$meta": {
     "name": "German",
     "endonym": "Deutsch",
     "flag": "🇩🇪",
     "translatedBy": "Belkis",
     "sourceOfTruth": false
   }
   ```

4. Run `npm run i18n:sync`.

That is the whole procedure. The script registers the file, reports how much of
it is translated, and refuses a file that would break a screen. The language
then appears under **Profile → App settings → Language**, next to
"Match my device", and the device language is used automatically when Binder
has it.

## What the app does for you

- **Nothing half-translated ever shows as a broken key.** A missing or empty
  string falls back to English. A file that is 60 % done produces a 60 % German
  interface, not a screen full of `settings.reset.confirm`.
- **Placeholders instead of glued sentences.** `{name}` style placeholders are
  the only substitution, so a translator never has to reassemble a sentence
  from fragments.
- **A language that disappears cannot strand anyone.** If a pinned language is
  no longer bundled, the setting falls back to following the device.
- **The picker only exists when there is something to pick.** With English
  alone, the section stays out of the way.

## What the checks enforce

- `npm run i18n:sync` fails on keys that do not exist in English, and on a file
  without `$meta.endonym` — the picker needs the language's own name.
- `npm run verify:i18n` fails the build if `src/i18n/registry.ts` is stale, so a
  translated file can never sit on disk unregistered, and a registered file can
  never be missing.
- `tests/i18n.test.ts` covers the fallback, the placeholder substitution and
  the device-language resolution.

## Proven on the device

2026-08-17, S23 Ultra, build v0.5.12: a German file was dropped in, synced, and
the section appeared by itself. With the phone set to German, "Match my device"
resolved to German and the section rendered as *Sprache / Wie mein Gerät /
🇬🇧 English / 🇩🇪 Deutsch*, in the same chip rhythm as Appearance and Accent.
The probe file was then removed again — the real translation is yours to write.

## Migrating the remaining screens

App settings is the first screen that reads from the locale file. The other
screens still carry their English strings inline; each polish run moves one
screen into `en.json` and translations pick it up automatically. Order:
settings → auth → onboarding → discovery → chat → matches → profile → legal.
