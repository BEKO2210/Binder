// Is anything actually delivering push?
//
// The dispatcher is an HTTP endpoint; a schedule calls it once a minute. If that
// schedule stops — a project rebuilt from migrations, a Vault secret rotated, an
// extension disabled — nothing raises an error. Deliveries pile up in the outbox
// and every person on the app sees exactly what they would see if nobody had
// written to them. That is the failure this check exists to make loud.
//
// It reads production, changes nothing, and needs a Supabase management token:
//   SUPABASE_ACCESS_TOKEN=... node scripts/verify-push-alive.mjs
// Locally the token comes out of the vault: vault run -- npm run push:alive
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const project = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('No SUPABASE_ACCESS_TOKEN. This check reads the hosted project and cannot guess.');
  process.exit(1);
}

// How old the oldest undelivered notification may be. The schedule runs every
// minute; fifteen leaves room for a slow Expo without hiding a dead dispatcher.
const MAX_BACKLOG_SECONDS = 15 * 60;

function query(sql) {
  const answer = execFileSync('curl', [
    '-s', '-X', 'POST', `https://api.supabase.com/v1/projects/${project}/database/query`,
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ query: sql }),
  ], { encoding: 'utf8' });
  return JSON.parse(answer);
}

const failures = [];

const [job] = query("select jobname, schedule, active from cron.job where jobname = 'binder-dispatch-push'");
if (!job) failures.push('No cron job named binder-dispatch-push. Nothing is calling the dispatcher.');
else if (!job.active) failures.push('The dispatch job exists but is switched off.');

const [runs] = query("select count(*)::int as succeeded, max(end_time)::text as last_run from cron.job_run_details where status = 'succeeded' and start_time > now() - interval '1 hour'");
if (!runs || runs.succeeded < 30) {
  failures.push(`Only ${runs?.succeeded ?? 0} successful runs in the last hour; a job that runs every minute should have about 60.`);
}

const [backlog] = query("select coalesce(extract(epoch from (now() - min(created_at)))::int, 0) as age from private.push_deliveries where status in ('queued','sending')");
if (backlog && backlog.age > MAX_BACKLOG_SECONDS) {
  failures.push(`The oldest undelivered notification is ${Math.round(backlog.age / 60)} minutes old.`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error('\nPush failing looks exactly like nobody writing to you. That is why this is a check and not a dashboard.');
  process.exit(1);
}

console.log(`Push is alive: ${runs.succeeded} dispatch runs in the last hour, last at ${runs.last_run}, backlog ${backlog?.age ?? 0}s.`);
