import { existsSync, readFileSync } from 'node:fs';

const failures = [];
for (const file of ['src/theme/ThemeProvider.tsx','src/theme/haptics.ts','src/screens/AppSettingsScreen.tsx','src/screens/ProfileSettingsScreen.tsx']) if (!existsSync(file)) failures.push(`missing ${file}`);
const provider = existsSync('src/theme/ThemeProvider.tsx') ? readFileSync('src/theme/ThemeProvider.tsx', 'utf8') : '';
for (const contract of ['hapticsEnabled','accentTheme','appearance','quietHours','newMatches','messages','moderation','safety','product','reduceMotionChanged']) if (!provider.includes(contract)) failures.push(`settings contract missing: ${contract}`);
const appSettings = existsSync('src/screens/AppSettingsScreen.tsx') ? readFileSync('src/screens/AppSettingsScreen.tsx', 'utf8') : '';
for (const contract of ['Share optional diagnostics','New matches','Messages','Moderation','Safety','Product updates','Sound','Vibration','Quiet hours','Binder Lime','Electric Blue','Violet','Coral','Ice']) if (!appSettings.includes(contract)) failures.push(`App Settings UI missing: ${contract}`);
const profileSettings = existsSync('src/screens/ProfileSettingsScreen.tsx') ? readFileSync('src/screens/ProfileSettingsScreen.tsx', 'utf8') : '';
for (const contract of ['PHOTOS','Add photo','Make primary','Discovery range','removeProfileMedia','reorderProfileMedia']) if (!profileSettings.includes(contract)) failures.push(`Profile Settings UI missing: ${contract}`);
const tokens = existsSync('src/theme/tokens.ts') ? readFileSync('src/theme/tokens.ts', 'utf8') : '';
for (const accent of ['lime','blue','violet','coral','ice']) if (!tokens.includes(`${accent}:`)) failures.push(`curated accent missing: ${accent}`);
if (!tokens.includes('destructive') || !tokens.includes('warning')) failures.push('fixed safety semantic tokens missing');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Binder Phase 6 settings contract PASS');
