// A signed-in request against production, once an hour.
//
// On 29 September every fresh token started coming back from PostgREST as
// PGRST303 "JWT issued at future". Sign-in still worked, so the app showed
// "Sicherheitsprüfung fehlgeschlagen" right after it and the admin dashboard
// would not open — for every account, for two days, while every check here
// stayed green, because none of them made a request as a signed-in user. The
// cause was upstream: PostgREST before v14.18 reads the time from a cache that
// can go stale after a long idle stretch (PostgREST#5196, fixed in #5208).
//
// This signs in as a dedicated probe account, asks for the legal gate — the
// first call the app makes after any sign-in — and signs out again. One failed
// round is not an outage (PostgREST#5212 describes single sporadic misses), so
// it tries three times before it fails the run.
//
//   BINDER_PROBE_EMAIL=… BINDER_PROBE_PASSWORD=… node scripts/probe-live-auth.mjs
const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://sbohsxtzitqhyswznhec.supabase.co';
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_CS84Z2jb7tQZBk97sFpPCw_9smErm5J';
const ROUNDS = 3;
const PAUSE_MS = 5_000;
const DEADLINE_MS = 15_000;

const email = process.env.BINDER_PROBE_EMAIL;
const password = process.env.BINDER_PROBE_PASSWORD;
if (!email || !password) {
  // A probe without credentials has measured nothing; it must not pass.
  console.error('BINDER_PROBE_EMAIL and BINDER_PROBE_PASSWORD are required.');
  process.exit(1);
}

async function call(path, { token, body } = {}) {
  const response = await fetch(`${URL_BASE}${path}`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(DEADLINE_MS),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* reported as text below */ }
  return { status: response.status, json, text };
}

function describe(step, result) {
  const code = result.json?.error_code ?? result.json?.code ?? '';
  const message = result.json?.message ?? result.json?.msg ?? result.text.slice(0, 200);
  return `${step}: HTTP ${result.status} ${code} ${message}`.trim();
}

async function round() {
  const signIn = await call('/auth/v1/token?grant_type=password', { body: { email, password } });
  const token = signIn.json?.access_token;
  if (signIn.status !== 200 || !token) return describe('sign-in', signIn);
  try {
    const gate = await call('/rest/v1/rpc/get_legal_gate', { token });
    const row = Array.isArray(gate.json) ? gate.json[0] : undefined;
    if (gate.status !== 200 || typeof row?.terms_version !== 'string') return describe('get_legal_gate', gate);
    return null;
  } finally {
    // Every sign-in opens a session; an hourly probe must not pile them up.
    await call('/auth/v1/logout?scope=local', { token }).catch(() => {});
  }
}

const failures = [];
for (let attempt = 1; attempt <= ROUNDS; attempt += 1) {
  const startedAt = Date.now();
  let failure;
  try { failure = await round(); } catch (error) { failure = `request: ${error instanceof Error ? error.message : String(error)}`; }
  if (!failure) {
    console.log(`Signed-in request answered in ${Date.now() - startedAt} ms (round ${attempt} of ${ROUNDS}).`);
    process.exit(0);
  }
  failures.push(`round ${attempt}: ${failure}`);
  console.error(failures.at(-1));
  if (attempt < ROUNDS) await new Promise((resolve) => { setTimeout(resolve, PAUSE_MS); });
}
console.error(`Signed-in requests fail in production — ${ROUNDS} rounds, none answered.`);
if (failures.some((line) => line.includes('PGRST303'))) {
  console.error('PGRST303 is the stale PostgREST clock: restart the project in the Supabase dashboard.');
}
process.exit(1);
