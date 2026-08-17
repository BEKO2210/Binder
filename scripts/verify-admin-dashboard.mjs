import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const requiredFiles = [
  'site/admin/index.html',
  'site/admin/admin.css',
  'site/admin/admin.js',
  'site/assets/supabase.js',
  'supabase/migrations/20260816180415_phase8_admin_moderation_dashboard.sql',
  'supabase/migrations/20260816181817_phase8_admin_session_revalidation.sql',
  'supabase/tests/phase8_admin_moderation_dashboard_test.sql',
  'supabase/migrations/20260817090000_phase9_admin_diagnostics.sql',
  'supabase/tests/phase9_admin_diagnostics_test.sql',
  'supabase/functions/invite-moderator/index.ts',
  'supabase/functions/invite-moderator/deno.json',
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(file) || statSync(file).size === 0) failures.push(`${file}: missing or empty`);
}

if (!failures.length) {
  const html = readFileSync('site/admin/index.html', 'utf8');
  const script = readFileSync('site/admin/admin.js', 'utf8');
  const css = readFileSync('site/admin/admin.css', 'utf8');
  const migration = readFileSync('supabase/migrations/20260816180415_phase8_admin_moderation_dashboard.sql', 'utf8');
  const sessionMigration = readFileSync('supabase/migrations/20260816181817_phase8_admin_session_revalidation.sql', 'utf8');
  const test = readFileSync('supabase/tests/phase8_admin_moderation_dashboard_test.sql', 'utf8');
  const invite = readFileSync('supabase/functions/invite-moderator/index.ts', 'utf8');
  const publicSurface = `${html}\n${script}\n${css}`;

  for (const required of [
    'Content-Security-Policy', 'noindex,nofollow,noarchive', '../assets/supabase.js',
    'belkis.aslani@gmail.com', 'Fotos', 'Meldungen', 'Moderatoren', 'Aktivitätsprotokoll',
    'Diagnose', 'diagnostics-health', 'diagnostics-summary', 'diagnostics-errors', 'diagnostics-feedback',
  ]) {
    if (!html.includes(required)) failures.push(`admin HTML contract missing: ${required}`);
  }

  for (const required of [
    'shouldCreateUser: false', 'claim_admin_session', 'admin_list_media_queue',
    'admin_list_report_queue', 'admin_review_media', 'admin_review_report',
    "functions.invoke('invite-moderator'", "storage.from('profile-media').download",
    'admin_diagnostics_health', 'admin_diagnostics_summary',
    'admin_diagnostics_client_errors', 'admin_diagnostics_feedback',
  ]) {
    if (!script.includes(required)) failures.push(`admin client contract missing: ${required}`);
  }

  if (/service[_-]?role/i.test(publicSurface)) failures.push('public admin files mention or embed a service-role credential');
  // The dashboard may only reach diagnostics through the gated RPCs: a direct
  // table read would need a grant on the private schema, which must never exist.
  if (/from\(['"](?:private\.)?beta_(?:client_events|feedback|server_events|preferences)['"]\)/.test(script)) {
    failures.push('admin client must read diagnostics through the gated RPCs, not from a table');
  }
  if (/innerHTML|insertAdjacentHTML|document\.write/.test(script)) failures.push('admin client must render UGC through textContent-only DOM construction');
  if (/https:\/\/(cdn|esm|unpkg|jsdelivr)/i.test(publicSurface)) failures.push('admin client loads executable code from a third-party CDN');

  for (const required of [
    'create table private.admin_members', "'belkis.aslani@gmail.com'", 'private.admin_has_permission',
    'public.claim_admin_session', 'public.admin_review_media', 'public.admin_review_report',
    'public.admin_prepare_moderator_invite', 'public.admin_update_moderator',
    'profile_media_objects_admin_read', 'private.current_admin_actor()',
    'revoke all on table private.admin_members from public, anon, authenticated',
  ]) {
    if (!migration.includes(required)) failures.push(`admin SQL contract missing: ${required}`);
  }
  if (/grant\s+(select|insert|update|delete).*private\.admin_members/is.test(migration)) {
    failures.push('admin membership table must never be granted to browser roles');
  }

  for (const required of [
    'private.current_admin_session_is_active()', 'auth.sessions', "auth.jwt() ->> 'session_id'",
    'Active authentication session required.',
    'revoke all on function private.admin_has_permission(text) from public, anon, authenticated',
  ]) {
    if (!sessionMigration.includes(required)) failures.push(`admin session revalidation missing: ${required}`);
  }

  if (!test.includes('select plan(43);')) failures.push('Phase 8 pgTAP plan must remain at 43 assertions');
  for (const required of ['normal Binder account cannot claim admin access', 'Deleting an Auth session immediately revokes dashboard access', 'Disabled moderator immediately loses dashboard access', 'Audit actor is derived from the confirmed session', 'Changing the confirmed Auth email immediately revokes', 'Admin media review restores the authenticated caller context']) {
    if (!test.includes(required)) failures.push(`Phase 8 pgTAP proof missing: ${required}`);
  }

  for (const required of [
    'npm:@supabase/supabase-js@2.112.3', 'auth.getUser()', 'admin_prepare_moderator_invite',
    'auth.admin.inviteUserByEmail', 'https://beko2210.github.io', 'Origin not allowed',
  ]) {
    if (!invite.includes(required)) failures.push(`moderator invite boundary missing: ${required}`);
  }
  if (/console\.(log|info|warn|error)/.test(invite)) failures.push('moderator invite function must not log moderator emails or invite errors');

  const diagnostics = readFileSync('supabase/migrations/20260817090000_phase9_admin_diagnostics.sql', 'utf8');
  for (const required of [
    'public.admin_diagnostics_summary', 'public.admin_diagnostics_health',
    'public.admin_diagnostics_client_errors', 'public.admin_diagnostics_feedback',
    "private.require_admin_permission('dashboard')", 'security definer', "set search_path = ''",
    'revoke all on function public.admin_diagnostics_summary(integer) from public, anon',
  ]) {
    if (!diagnostics.includes(required)) failures.push(`diagnostics SQL contract missing: ${required}`);
  }
  if (/grant\s+execute[^;]*admin_diagnostics[^;]*to\s+anon/is.test(diagnostics)) {
    failures.push('diagnostics functions must never be granted to anon');
  }

  try {
    execFileSync(process.execPath, ['--check', 'site/admin/admin.js'], { stdio: 'pipe' });
  } catch (error) {
    failures.push(`site/admin/admin.js: syntax check failed: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Binder admin dashboard security contract PASS');
