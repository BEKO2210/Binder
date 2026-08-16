import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const requiredFiles = [
  'site/admin/index.html',
  'site/admin/admin.css',
  'site/admin/admin.js',
  'site/assets/supabase.js',
  'supabase/migrations/20260816180415_phase8_admin_moderation_dashboard.sql',
  'supabase/tests/phase8_admin_moderation_dashboard_test.sql',
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
  const test = readFileSync('supabase/tests/phase8_admin_moderation_dashboard_test.sql', 'utf8');
  const invite = readFileSync('supabase/functions/invite-moderator/index.ts', 'utf8');
  const publicSurface = `${html}\n${script}\n${css}`;

  for (const required of [
    'Content-Security-Policy', 'noindex,nofollow,noarchive', '../assets/supabase.js',
    'belkis.aslani@gmail.com', 'Fotos', 'Meldungen', 'Moderatoren', 'Aktivitätsprotokoll',
  ]) {
    if (!html.includes(required)) failures.push(`admin HTML contract missing: ${required}`);
  }

  for (const required of [
    'shouldCreateUser: false', 'claim_admin_session', 'admin_list_media_queue',
    'admin_list_report_queue', 'admin_review_media', 'admin_review_report',
    "functions.invoke('invite-moderator'", "storage.from('profile-media').download",
  ]) {
    if (!script.includes(required)) failures.push(`admin client contract missing: ${required}`);
  }

  if (/service[_-]?role/i.test(publicSurface)) failures.push('public admin files mention or embed a service-role credential');
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

  if (!test.includes('select plan(42);')) failures.push('Phase 8 pgTAP plan must remain at 42 assertions');
  for (const required of ['normal Binder account cannot claim admin access', 'Disabled moderator immediately loses dashboard access', 'Audit actor is derived from the confirmed session', 'Changing the confirmed Auth email immediately revokes', 'Admin media review restores the authenticated caller context']) {
    if (!test.includes(required)) failures.push(`Phase 8 pgTAP proof missing: ${required}`);
  }

  for (const required of [
    'npm:@supabase/supabase-js@2.112.3', 'auth.getUser()', 'admin_prepare_moderator_invite',
    'auth.admin.inviteUserByEmail', 'https://beko2210.github.io', 'Origin not allowed',
  ]) {
    if (!invite.includes(required)) failures.push(`moderator invite boundary missing: ${required}`);
  }
  if (/console\.(log|info|warn|error)/.test(invite)) failures.push('moderator invite function must not log moderator emails or invite errors');

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
