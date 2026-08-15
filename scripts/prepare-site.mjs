import { copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['scripts/materialize-brand-assets.mjs'], { stdio: 'inherit' });

mkdirSync('site/assets', { recursive: true });
copyFileSync('assets/brand/icon.png', 'site/assets/binder-icon.png');
copyFileSync('node_modules/@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf', 'site/assets/Manrope-Regular.ttf');
copyFileSync('node_modules/@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf', 'site/assets/Manrope-Bold.ttf');
copyFileSync('node_modules/@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf', 'site/assets/Manrope-ExtraBold.ttf');

console.log('Binder public site assets prepared.');
