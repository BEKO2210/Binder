// A labelled account to walk the app with on a device, and the one command
// that takes it away again.
//
//   node scripts/stage-test-account.mjs create        # prints the password
//   node scripts/stage-test-account.mjs remove
//
// Rules this file exists to keep — the same ones stage-demo-profiles.mjs keeps:
// - The account carries `binder_demo_profile: true` in auth metadata, so
//   `remove` can never delete anything that was not created here, and the demo
//   remover cleans it up too.
// - The name says what it is. Nobody should have to guess later which rows in
//   a dating app's database are real people.
// - It gets a generated portrait, never a photograph of a real person.
// - The password is printed once and lives nowhere else. It is a throwaway.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [mode] = process.argv.slice(2);
if (!['create', 'remove'].includes(mode)) {
  console.error('usage: stage-test-account.mjs <create|remove>');
  process.exit(2);
}

const projectRef = process.env.BINDER_PROJECT_REF ?? 'sbohsxtzitqhyswznhec';
const url = `https://${projectRef}.supabase.co`;
const email = process.env.BINDER_TEST_EMAIL ?? 'belkis.aslani+binder.testlauf@gmail.com';
// Two phones testing at once need two accounts with two names: the match
// staging finds its account by this name, and with one name it would pick
// whichever row came first and hand both runs the same conversation.
const displayName = process.env.BINDER_TEST_NAME ?? 'Testlauf (Testkonto)';
const portrait = process.env.BINDER_TEST_PORTRAIT ?? '/home/belkis/Binder-Roadmap/demo-portraits/lena-1.webp';
// Freiberg am Neckar, the same place the demo profiles stand in, so the deck
// has somebody in it without widening anybody's search radius.
const latitude = 48.9268;
const longitude = 9.1899;

function serviceKey() {
  const raw = execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['projects', 'api-keys', '--project-ref', projectRef], { encoding: 'utf8' });
  const key = JSON.parse(raw).keys.find((entry) => entry.id === 'service_role')?.api_key;
  if (!key) throw new Error('No service_role key available for this project.');
  return key;
}

const key = serviceKey();
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

function sql(statements) {
  const file = `/tmp/binder-test-account-${Date.now()}.sql`;
  execFileSync('/bin/sh', ['-c', `cat > ${file} <<'SQLEOF'\n${statements}\nSQLEOF`]);
  execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['db', 'query', '--linked', '-f', file], { stdio: 'pipe' });
}

async function findAccount() {
  const response = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  const body = await response.json();
  return (body.users ?? []).find((user) => user.email === email && user.user_metadata?.binder_demo_profile === true) ?? null;
}

if (mode === 'remove') {
  const existing = await findAccount();
  if (!existing) {
    console.log('No test account to remove.');
    process.exit(0);
  }
  await fetch(`${url}/auth/v1/admin/users/${existing.id}`, { method: 'DELETE', headers });
  await fetch(`${url}/storage/v1/object/profile-media`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: [`${existing.id}/`] }) });
  console.log(`removed ${email}`);
  process.exit(0);
}

// A run that was interrupted leaves its account behind, and a whole device
// matrix used to fail on that leftover rather than on anything about the app.
// The account carries the demo marker, so replacing it can only ever remove
// something this script made.
const leftover = await findAccount();
if (leftover) {
  console.log(`${email} was still here from an earlier run — replacing it.`);
  await fetch(`${url}/auth/v1/admin/users/${leftover.id}`, { method: 'DELETE', headers });
  await fetch(`${url}/storage/v1/object/profile-media`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: [`${leftover.id}/`] }) });
}

const password = `Testlauf-${randomUUID().slice(0, 12)}`;
const created = await (await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { binder_demo_profile: true } }),
})).json();
if (!created.id) throw new Error(`Could not create ${email}: ${JSON.stringify(created).slice(0, 200)}`);

const payload = readFileSync(portrait);
const path = `${created.id}/${Date.now()}-${randomUUID()}.webp`;
const upload = await fetch(`${url}/storage/v1/object/profile-media/${path}`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/webp' },
  body: payload,
});
if (!upload.ok) throw new Error(`Upload failed: ${upload.status}`);

sql(`begin;
insert into public.user_private (user_id, birth_date, location, location_updated_at)
values ('${created.id}', '1990-05-12', extensions.st_setsrid(extensions.st_makepoint(${longitude}, ${latitude}), 4326)::extensions.geography, now())
on conflict (user_id) do update set birth_date = excluded.birth_date, location = excluded.location, location_updated_at = now();

insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
values ('${created.id}', array['woman','man','nonbinary'], 18, 99, 500)
on conflict (user_id) do update set interested_in = excluded.interested_in, min_age = 18, max_age = 99, max_distance_km = 500;

insert into public.profiles (user_id, first_name, bio, gender, interests)
values ('${created.id}', '${displayName}', 'Konto fuer einen Geraetelauf. Wird nach dem Test geloescht.', 'man', array['hiking','cooking'])
on conflict (user_id) do update set first_name = excluded.first_name, bio = excluded.bio, gender = excluded.gender, interests = excluded.interests;

insert into public.legal_acceptances (user_id, terms_version, privacy_version)
select '${created.id}', private.current_terms_version(), private.current_privacy_version()
on conflict (user_id) do update set terms_version = excluded.terms_version, privacy_version = excluded.privacy_version;

insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type, moderation_status)
values ('${created.id}', '${path}', 0, 720, 900, ${payload.byteLength}, 'image/webp', 'approved')
on conflict (storage_path) do nothing;

update public.profiles set onboarding_complete = true where user_id = '${created.id}';
-- Uploads always land as 'pending'; the moderation trigger forces it, which is
-- correct for a real user and has to be undone deliberately for a staged one.
update public.profile_media set moderation_status = 'approved' where user_id = '${created.id}';
commit;`);

console.log(`${displayName} steht bereit.\n  E-Mail:   ${email}\n  Passwort: ${password}\n\nDeck fuellen:  node scripts/stage-demo-profiles.mjs create docs/demo-profiles.json\nDanach weg:    node scripts/stage-test-account.mjs remove`);
