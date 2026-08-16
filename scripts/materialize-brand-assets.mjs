import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

// The Binder mark — two people as interlocking rounded bodies joined at the
// shoulder — is a designed raster asset. The checked-in masters under
// assets/brand-src are the single source of truth; this script materializes
// them into assets/brand for Expo. Flat color only.

const FILES = ['icon.png', 'adaptive-foreground.png', 'monochrome.png', 'splash-icon.png'];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

mkdirSync('assets/brand', { recursive: true });

const failures = [];
for (const file of FILES) {
  const source = `assets/brand-src/${file}`;
  if (!existsSync(source)) {
    failures.push(`${source}: master asset missing`);
    continue;
  }
  const png = readFileSync(source);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) failures.push(`${source}: not a PNG`);
  else if (png.readUInt32BE(16) !== 1024 || png.readUInt32BE(20) !== 1024) failures.push(`${source}: expected 1024x1024`);
  else copyFileSync(source, `assets/brand/${file}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Binder brand assets materialized: icon, adaptive foreground, monochrome and splash.');
