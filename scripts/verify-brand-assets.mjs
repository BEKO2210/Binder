import { existsSync, statSync, readFileSync } from 'node:fs';

const required = [
  'assets/brand/icon.png',
  'assets/brand/adaptive-foreground.png',
  'assets/brand/monochrome.png',
  'assets/brand/splash-icon.png',
];

const failures = [];
for (const file of required) {
  if (!existsSync(file)) {
    failures.push(`${file}: missing`);
    continue;
  }
  if (statSync(file).size < 1024) failures.push(`${file}: suspiciously small`);
  const png = readFileSync(file);
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) failures.push(`${file}: invalid PNG signature`);
  if (png.length >= 24) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== 1024 || height !== 1024) failures.push(`${file}: expected 1024x1024, got ${width}x${height}`);
  }
}

const config = JSON.parse(readFileSync('app.json', 'utf8'));
if (config.expo?.icon !== './assets/brand/icon.png') failures.push('app.json top-level icon is not Binder production icon');
if (config.expo?.android?.icon !== './assets/brand/icon.png') failures.push('android.icon is not Binder production icon');
if (config.expo?.android?.adaptiveIcon?.foregroundImage !== './assets/brand/adaptive-foreground.png') failures.push('adaptive foreground missing from app config');
if (config.expo?.android?.adaptiveIcon?.monochromeImage !== './assets/brand/monochrome.png') failures.push('Android themed icon missing from app config');
if (config.expo?.android?.adaptiveIcon?.backgroundColor?.toLowerCase() !== '#090a0f') failures.push('adaptive icon background is not canonical Binder dark');

const notifications = (config.expo?.plugins ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-notifications');
if (!notifications || notifications[1]?.icon !== './assets/brand/monochrome.png') failures.push('Android notification icon is not Binder monochrome mark');

const splash = (config.expo?.plugins ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen');
if (!splash || splash[1]?.image !== './assets/brand/splash-icon.png') failures.push('native splash plugin is not wired to Binder splash mark');
if (splash?.[1]?.backgroundColor?.toLowerCase() !== '#090a0f') failures.push('native splash background is not canonical Binder dark');

const brandComponent = readFileSync('src/components/ui/BinderBrand.tsx', 'utf8');
if (!brandComponent.includes("require('../../../assets/brand/icon.png')")) failures.push('BinderBrand does not render the production icon asset');
if (/">B<\/BinderText>/.test(brandComponent)) failures.push('legacy text-only B brand tile is still present');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder native brand asset contract PASS');
