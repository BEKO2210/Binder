import { existsSync, readFileSync } from 'node:fs';

const failures = [];
if (!existsSync('src/lib/images.ts')) failures.push('image preparation pipeline missing');
else {
  const imageSource = readFileSync('src/lib/images.ts', 'utf8');
  if (!imageSource.includes('1080')) failures.push('image pipeline does not cap long edge around 1080px');
  if (!/compress:\s*0\.8/.test(imageSource)) failures.push('image pipeline no longer documents ~80% pre-upload compression');
  if (!/WEBP|WebP/.test(imageSource)) failures.push('image pipeline is not WebP');
}
if (!existsSync('supabase/tests/phase6_media_concurrency.sh')) failures.push('Phase 6 media concurrency gate not implemented yet');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Binder Phase 6 media contract PASS');
