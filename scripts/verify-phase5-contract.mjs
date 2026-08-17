import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const read = (path) => readFileSync(path, 'utf8');

for (const path of [
  'src/lib/beta.ts',
  'src/components/BinderErrorBoundary.tsx',
  'src/screens/BetaScreen.tsx',
  'supabase/migrations/20260815160000_phase5_beta_core.sql',
  'supabase/migrations/20260815160100_phase5_ranking_observability.sql',
  'supabase/migrations/20260815160200_phase5_authoritative_funnel.sql',
  'supabase/migrations/20260815160300_phase5_beta_operator_views.sql',
  'supabase/tests/phase5_beta_test.sql',
]) if (!existsSync(path)) failures.push(`missing Phase 5 artifact: ${path}`);

const beta = read('src/lib/beta.ts');
const boundary = read('src/components/BinderErrorBoundary.tsx');
const screen = read('src/screens/BetaScreen.tsx');
const ranking = read('supabase/migrations/20260815160100_phase5_ranking_observability.sql');
const core = read('supabase/migrations/20260815160000_phase5_beta_core.sql');
const pkg = JSON.parse(read('package.json'));
const app = JSON.parse(read('app.json'));

if (!pkg.version || pkg.version !== app.expo?.version) failures.push(`package.json (${pkg.version}) and app.json (${app.expo?.version}) versions must agree`);
if (!beta.includes("diagnosticsEnabled: boolean | null = null") && !beta.includes('diagnosticsEnabled: boolean | null = null')) failures.push('Diagnostics cache must begin unresolved/off rather than opt-in');
if (!beta.includes("if (!diagnosticsEnabled) return false")) failures.push('Client diagnostics do not fail closed when opt-in is absent');
if (!core.includes('diagnostics_enabled boolean not null default false')) failures.push('Server diagnostics preference is not default-off');
if (!core.includes('delete from private.beta_client_events where user_id = uid')) failures.push('Diagnostics opt-out does not immediately delete optional client events');

for (const forbidden of ['latitude', 'longitude', 'storage_path', 'message_body', 'profile_bio']) {
  if (ranking.includes(`${forbidden} `)) failures.push(`ranking telemetry schema contains forbidden field: ${forbidden}`);
}
if (!ranking.includes('distance_bucket_km')) failures.push('Ranking telemetry does not use coarse distance buckets');
if (!ranking.includes('interest_overlap')) failures.push('Ranking telemetry does not retain interpretable ranking signal');
if (!ranking.includes('attach_decision_to_impression')) failures.push('Durable decisions are not linked to ranking impressions');

if (!boundary.includes("recordBetaEvent('client_render_error'")) failures.push('Crash fallback does not emit the bounded render-error signal');
if (boundary.includes('error.message') || boundary.includes('componentStack')) failures.push('Crash telemetry risks sending raw error or component-stack content');
// The beta screen's copy moved into the locale file; the promise it has to
// make to the user is unchanged, so the check follows the words.
const screenCopy = `${screen}\n${read('src/i18n/locales/en.json')}`;
if (!screenCopy.includes('NEVER IN OPTIONAL DIAGNOSTICS')) failures.push('Beta UI does not explain the diagnostic data boundary');
if (!screenCopy.includes('Report & Block')) failures.push('Beta feedback UI does not redirect safety reports to moderation controls');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder Phase 5 beta contract PASS');
