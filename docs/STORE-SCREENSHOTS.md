# Store screenshots

A screenshot straight off the phone is evidence. A store page is a first
impression. These are two different jobs, so there are two steps: stage the
content, then frame it.

## Why staged profiles at all

The deck is the product. A listing that shows "TESTKONTO CODEX — KEIN ECHTER
NUTZER" tells a stranger that nobody is here. Every dating app in the store
photographs staged profiles; the only question is where the faces come from,
and that question is a rights question, not a design one.

**Binder invents no faces.** The photos come from files the owner supplies and
owns the rights to — his own, people who agreed, or licensed stock. Nothing is
downloaded by a script, and no generated likeness is presented as a person.

## The shoot, end to end

1. Put the portrait files somewhere readable and list them in
   `docs/demo-profiles.json` under each profile's `photos`. Portrait ratio,
   ideally 720×900 or larger, `.webp`.
2. Create the profiles:
   ```
   node scripts/stage-demo-profiles.mjs create docs/demo-profiles.json
   ```
   Each account is tagged `binder_demo_profile` in its auth metadata. That tag
   is what makes step 4 safe.
3. Capture on the S23. The deck, a card expanded, the filter sheet, a match, a
   conversation, the profile. Save them as `NN-name.png`, and write a
   two-line `NN-name.txt` next to each: headline, then one sentence.
4. Remove everything the shoot created:
   ```
   node scripts/stage-demo-profiles.mjs remove docs/demo-profiles.json
   ```
   It deletes only accounts carrying the demo tag — the auth user, which
   cascades through every table, and the storage objects underneath.
5. Frame them:
   ```
   scripts/store-frames.sh <captures-dir> <output-dir>
   ```
   1080×1920, the brand ground, the kicker, the headline and the sentence, the
   device shot cropped free of the system status bar and the gesture pill.

## What the captions have to do

Say what the screen is *for*, not what it is called. "Who fits both sides" is a
promise; "Discovery screen" is a label. Six frames, six sentences, no
exclamation marks, no superlatives, and nothing the app does not do.

## What must never appear

- A real person's photo without their agreement.
- A conversation with content that reads as a real exchange between real people.
- Numbers that suggest a user base that does not exist.
- The word "test", a placeholder name, or a debug surface.
