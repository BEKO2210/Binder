// Store screenshots need profiles that look like the product, not like a test
// harness. This creates them from a manifest, and removes them again, so a
// listing shoot is two commands and leaves nothing behind.
//
//   node scripts/stage-demo-profiles.mjs create docs/demo-profiles.json
//   node scripts/stage-demo-profiles.mjs remove docs/demo-profiles.json
//
// Rules this file exists to keep:
// - Every demo account is marked in auth metadata as binder_demo_profile, so
//   `remove` can never delete anything that was not created here.
// - Photos come from files the owner supplies. Nothing is downloaded, and no
//   face is invented.
// - The accounts live only for the length of the shoot. `remove` deletes the
//   auth users, which cascades through every table, and the storage objects.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [mode, manifestPath] = process.argv.slice(2);
if (!['create', 'remove'].includes(mode) || !manifestPath) {
  console.error('usage: stage-demo-profiles.mjs <create|remove> <manifest.json>');
  process.exit(2);
}

const projectRef = process.env.BINDER_PROJECT_REF ?? 'sbohsxtzitqhyswznhec';
const url = `https://${projectRef}.supabase.co`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function serviceKey() {
  const raw = execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['projects', 'api-keys', '--project-ref', projectRef], { encoding: 'utf8' });
  const key = JSON.parse(raw).keys.find((entry) => entry.id === 'service_role')?.api_key;
  if (!key) throw new Error('No service_role key available for this project.');
  return key;
}

const key = serviceKey();
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function listDemoUsers() {
  const response = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  const body = await response.json();
  return (body.users ?? []).filter((user) => user.user_metadata?.binder_demo_profile === true);
}

async function createUser(profile) {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: profile.email,
      password: `Demo-${crypto.randomUUID()}`,
      email_confirm: true,
      user_metadata: { binder_demo_profile: true },
    }),
  });
  const body = await response.json();
  if (!body.id) throw new Error(`Could not create ${profile.email}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.id;
}

async function uploadPhoto(userId, file) {
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.webp`;
  const payload = readFileSync(file);
  const response = await fetch(`${url}/storage/v1/object/profile-media/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/webp' },
    body: payload,
  });
  if (!response.ok) throw new Error(`Upload failed for ${basename(file)}: ${response.status}`);
  return { path, bytes: payload.byteLength };
}

function sql(statements) {
  const file = `/tmp/binder-demo-${Date.now()}.sql`;
  execFileSync('/bin/sh', ['-c', `cat > ${file} <<'SQLEOF'\n${statements}\nSQLEOF`]);
  execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['db', 'query', '--linked', '-f', file], { stdio: 'pipe' });
}

if (mode === 'create') {
  const rows = [];
  for (const profile of manifest.profiles) {
    const userId = await createUser(profile);
    const photos = [];
    for (const file of profile.photos) photos.push(await uploadPhoto(userId, file));
    rows.push({ profile, userId, photos });
    console.log(`created ${profile.firstName} (${userId})`);
  }

  const values = rows.map(({ profile, userId, photos }) => `
insert into public.user_private (user_id, birth_date, location, location_updated_at)
values ('${userId}', '${profile.birthDate}', extensions.st_setsrid(extensions.st_makepoint(${profile.longitude}, ${profile.latitude}), 4326)::extensions.geography, now())
on conflict (user_id) do update set birth_date = excluded.birth_date, location = excluded.location, location_updated_at = now();

insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
values ('${userId}', array[${profile.interestedIn.map((value) => `'${value}'`).join(',')}], ${profile.minAge}, ${profile.maxAge}, ${profile.distanceKm})
on conflict (user_id) do update set interested_in = excluded.interested_in, min_age = excluded.min_age, max_age = excluded.max_age, max_distance_km = excluded.max_distance_km;

insert into public.profiles (user_id, first_name, bio, gender, interests)
values ('${userId}', '${profile.firstName.replace(/'/g, "''")}', '${profile.bio.replace(/'/g, "''")}', '${profile.gender}', array[${profile.interests.map((value) => `'${value.replace(/'/g, "''")}'`).join(',')}])
on conflict (user_id) do update set first_name = excluded.first_name, bio = excluded.bio, gender = excluded.gender, interests = excluded.interests;

insert into public.legal_acceptances (user_id, terms_version, privacy_version)
select '${userId}', private.current_terms_version(), private.current_privacy_version()
on conflict (user_id) do update set terms_version = excluded.terms_version, privacy_version = excluded.privacy_version;

${photos.map((photo, index) => `insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type, moderation_status)
values ('${userId}', '${photo.path}', ${index}, ${profile.photoWidth ?? 720}, ${profile.photoHeight ?? 900}, ${photo.bytes}, 'image/webp', 'approved')
on conflict (storage_path) do nothing;`).join('\n')}

update public.profiles set onboarding_complete = true where user_id = '${userId}';`).join('\n');

  sql(`begin;\n${values}\ncommit;`);
  console.log(`\n${rows.length} demo profiles are live. Take the screenshots, then run:\n  node scripts/stage-demo-profiles.mjs remove ${manifestPath}`);
} else {
  const users = await listDemoUsers();
  for (const user of users) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers });
    await fetch(`${url}/storage/v1/object/profile-media`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: [`${user.id}/`] }),
    });
    console.log(`removed ${user.email}`);
  }
  console.log(`${users.length} demo profiles removed.`);
}
