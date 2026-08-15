import { existsSync, readFileSync } from 'node:fs';

const failures = [];
if (!existsSync('src/lib/images.ts')) failures.push('image preparation pipeline missing');
else {
  const imageSource = readFileSync('src/lib/images.ts', 'utf8');
  if (!imageSource.includes('1080')) failures.push('image pipeline does not cap long edge around 1080px');
  if (!/compress:\s*0\.8/.test(imageSource)) failures.push('image pipeline no longer documents ~80% pre-upload compression');
  if (!/WEBP|WebP/.test(imageSource)) failures.push('image pipeline is not WebP');
}
for (const file of ['supabase/tests/phase6_media_concurrency.sh','supabase/tests/phase6_media_gallery_test.sql','src/screens/ProfileSettingsScreen.tsx']) if (!existsSync(file)) failures.push(`missing Phase 6 media artifact: ${file}`);
const media = existsSync('src/lib/media.ts') ? readFileSync('src/lib/media.ts', 'utf8') : '';
if (!media.includes('uploadPreparedImage') || !media.includes("register_profile_media")) failures.push('gallery does not upload prepared media before server registration');
if (!media.includes("remove([uploaded.path])")) failures.push('failed media registration does not clean the just-uploaded storage object');
const profileSettings = existsSync('src/screens/ProfileSettingsScreen.tsx') ? readFileSync('src/screens/ProfileSettingsScreen.tsx', 'utf8') : '';
for (const contract of ['media.length >= 6','pickAndPrepareProfileImage','addProfileImage','setPrimaryProfileMedia','reorderProfileMedia','removeProfileMedia']) if (!profileSettings.includes(contract)) failures.push(`gallery UI contract missing: ${contract}`);
const onboarding = existsSync('src/screens/OnboardingScreen.tsx') ? readFileSync('src/screens/OnboardingScreen.tsx','utf8') : '';
if (!onboarding.includes('addProfileImage') || onboarding.includes('replaceProfileImage')) failures.push('onboarding must use the same atomic prepared-image gallery path');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Binder Phase 6 media contract PASS');
