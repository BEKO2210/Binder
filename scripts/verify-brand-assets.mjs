import { existsSync, statSync, readFileSync } from 'node:fs';

const required = [
  'assets/brand/icon.png',
  'assets/brand/adaptive-foreground.png',
  'assets/brand/monochrome.png',
  'assets/brand/splash-icon.png',
];

const failures = [];
for (const file of required) {
  if (!existsSync(file)) failures.push(`${file}: missing`);
  else if (statSync(file).size < 1024) failures.push(`${file}: suspiciously small`);
}

const config = JSON.parse(readFileSync('app.json', 'utf8'));
if (config.expo?.icon !== './assets/brand/icon.png') failures.push('app.json top-level icon is not Binder production icon');
if (config.expo?.android?.icon !== './assets/brand/icon.png') failures.push('android.icon is not Binder production icon');
if (config.expo?.android?.adaptiveIcon?.foregroundImage !== './assets/brand/adaptive-foreground.png') failures.push('adaptive foreground missing from app config');
if (config.expo?.android?.adaptiveIcon?.monochromeImage !== './assets/brand/monochrome.png') failures.push('Android themed icon missing from app config');
const splash = (config.expo?.plugins ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen');
if (!splash || splash[1]?.image !== './assets/brand/splash-icon.png') failures.push('native splash plugin is not wired to Binder splash mark');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder native brand asset contract PASS');
