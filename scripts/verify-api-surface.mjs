// What the API actually exposes, asked over HTTP instead of assumed.
//
// The internal helpers live in a schema called `private`, and the argument that
// they are safe rests entirely on PostgREST not serving that schema. That is a
// configuration, not a law, and nothing in the repository checked it. So it is
// asked directly: call a private helper through the API and require a refusal.
//
//   node scripts/verify-api-surface.mjs            against the local stack
//   BINDER_API_URL=… BINDER_ANON_KEY=… node …      against another one
import { execFileSync } from 'node:child_process';

function localCredentials() {
  const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }));
  return { url: status.API_URL, key: status.ANON_KEY };
}

const { url, key } = process.env.BINDER_API_URL && process.env.BINDER_ANON_KEY
  ? { url: process.env.BINDER_API_URL, key: process.env.BINDER_ANON_KEY }
  : localCredentials();

const failures = [];

async function post(path, body) {
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

async function get(path) {
  const response = await fetch(`${url}${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return { status: response.status, text: await response.text() };
}

// The helpers a reviewer worried about: reachable only if the private schema is
// served, which it must not be.
for (const [name, body] of [
  ['is_account_active', { target_user_id: '00000000-0000-4000-8000-000000000000' }],
  ['is_discovery_candidate', { viewer_id: '00000000-0000-4000-8000-000000000000', target_user_id: '00000000-0000-4000-8000-000000000001' }],
  ['has_current_legal_acceptance', { target_user_id: '00000000-0000-4000-8000-000000000000' }],
]) {
  const answer = await post(`/rest/v1/rpc/${name}`, body);
  if (answer.status < 400) failures.push(`private.${name} answered over the API with ${answer.status}`);
}

// And an anonymous caller gets nothing out of the tables that hold people.
for (const table of ['profiles', 'user_private', 'messages', 'matches', 'device_tokens', 'reports', 'blocks']) {
  const answer = await get(`/rest/v1/${table}?select=*&limit=1`);
  if (answer.status < 400 && answer.text.trim() !== '[]') {
    failures.push(`anon read rows from ${table} (${answer.status})`);
  }
}

if (failures.length > 0) {
  console.error('The API exposes more than it should:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('API surface: private helpers are unreachable and anonymous reads return nothing.');
