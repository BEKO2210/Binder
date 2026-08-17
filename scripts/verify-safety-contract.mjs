import { readFileSync, existsSync } from 'node:fs';

const failures = [];
const read = (path) => readFileSync(path, 'utf8');
const root = read('src/Root.tsx');
const profile = read('src/screens/ProfileScreen.tsx');
const discovery = read('src/screens/DiscoveryScreen.tsx');
const safety = read('src/lib/safety.ts');

for (const path of [
  'src/screens/LegalGateScreen.tsx',
  'supabase/functions/delete-account/index.ts',
  'supabase/migrations/20260815150000_phase4_safety_gate.sql',
  'supabase/migrations/20260815151000_phase4_rls_recursion_hardening.sql',
  'supabase/migrations/20260815152000_phase4_client_contract.sql',
  'supabase/migrations/20260815153000_phase4_moderation_actions.sql',
]) if (!existsSync(path)) failures.push(`missing safety artifact: ${path}`);

if (!root.includes('LegalGateScreen')) failures.push('Root does not render LegalGateScreen');
if (root.indexOf('if (!legalGate.accepted)') < 0 || root.indexOf('if (!legalGate.accepted)') > root.indexOf('if (!onboardingComplete)')) failures.push('Legal gate is not ahead of onboarding');
if (!profile.includes('deleteCurrentAccount')) failures.push('Profile has no authenticated deletion action');
if (!profile.includes('DELETE_ACCOUNT_URL')) failures.push('Profile has no external deletion resource');
// The confirmation shape moved into src/lib/confirmDestructive.ts, which is
// now the single place that decides button order and destructive styling. The
// contract is still that deletion is confirmed destructively — it is just
// asserted where that decision lives.
const confirmHelper = `${readFileSync('src/lib/confirmDestructive.ts', 'utf8')}\n${readFileSync('src/lib/destructiveConfirmationPolicy.ts', 'utf8')}`;
if (!profile.includes('confirmDestructive({')) failures.push('Deletion is not confirmed through the shared destructive confirmation');
if (!confirmHelper.includes("style: 'destructive'") || !confirmHelper.includes("style: 'cancel'")) failures.push('Deletion confirmation is not marked destructive');
if (!discovery.includes('reportAndBlockDiscoveryProfile')) failures.push('Discovery has no pre-match report/block action');
if (!safety.includes('https://beko2210.github.io/Binder')) failures.push('App policy links do not target Binder public site');
if (!safety.includes("functions.invoke<{ deleted?: boolean; error?: string }>('delete-account'")) failures.push('Client deletion does not use authenticated Edge Function');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder Phase 4 safety contract PASS');
