import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { compress } from 'wawoff2';
import { PNG } from 'pngjs';

// Box filter: the master is a flat-colour mark at a power-of-two size, so
// averaging the source pixels that fall inside each target pixel is both exact
// enough and free of the ringing a sharpening resampler would add.
function resizePng(buffer, size) {
  const source = PNG.sync.read(buffer);
  const target = new PNG({ width: size, height: size });
  const scale = source.width / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      let samples = 0;
      for (let sy = Math.floor(y * scale); sy < Math.floor((y + 1) * scale); sy += 1) {
        for (let sx = Math.floor(x * scale); sx < Math.floor((x + 1) * scale); sx += 1) {
          const at = (source.width * sy + sx) << 2;
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += source.data[at + channel];
          samples += 1;
        }
      }
      const at = (size * y + x) << 2;
      for (let channel = 0; channel < 4; channel += 1) target.data[at + channel] = Math.round(totals[channel] / samples);
    }
  }
  return PNG.sync.write(target);
}

execFileSync(process.execPath, ['scripts/materialize-brand-assets.mjs'], { stdio: 'inherit' });

mkdirSync('site/assets', { recursive: true });
copyFileSync('assets/brand/icon.png', 'site/assets/binder-icon.png');

// The header shows the mark at 36 CSS pixels but was downloading the 1024px
// master for it — 39 kB of icon on every page load. This writes the sizes the
// page actually displays, at 2x for dense screens.
for (const size of [72, 192]) {
  writeFileSync(`site/assets/binder-icon-${size}.png`, resizePng(readFileSync('assets/brand/icon.png'), size));
}
// The browser gets WOFF2, which is a third of the TrueType size for exactly the
// same glyphs. The TrueType files stay because the app bundles those, and both
// come out of the same pinned package — so the two can never drift apart.
const FONTS = [
  ['400Regular/Manrope_400Regular.ttf', 'Manrope-Regular'],
  ['700Bold/Manrope_700Bold.ttf', 'Manrope-Bold'],
  ['800ExtraBold/Manrope_800ExtraBold.ttf', 'Manrope-ExtraBold'],
];
for (const [source, name] of FONTS) {
  const ttf = `node_modules/@expo-google-fonts/manrope/${source}`;
  copyFileSync(ttf, `site/assets/${name}.ttf`);
  writeFileSync(`site/assets/${name}.woff2`, await compress(readFileSync(ttf)));
}
copyFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'site/assets/supabase.js');

console.log('Binder public site assets prepared.');
