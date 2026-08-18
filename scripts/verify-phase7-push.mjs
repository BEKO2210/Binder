import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260815222359_phase7_push_reliability.sql','utf8');
const worker = readFileSync('supabase/functions/dispatch-push/index.ts','utf8');
const notifications = readFileSync('src/lib/notifications.ts','utf8');
const root = readFileSync('src/Root.tsx','utf8');
const chat = readFileSync('src/screens/ChatScreen.tsx','utf8');
const app = JSON.parse(readFileSync('app.json','utf8'));
const eas = JSON.parse(readFileSync('eas.json','utf8'));
// The runbooks were consolidated into AGENTS.md, which is now the only
// document in the repository. The contract is unchanged: the activation
// conditions have to be written down somewhere a human will find them.
const activation = readFileSync('AGENTS.md','utf8');
const failures = [];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredMigrationContracts = [
  'notification_preferences',
  'push_deliveries',
  'unique (outbox_id, token_snapshot)',
  'for update skip locked',
  'token_ownership_changed',
  'private.evaluate_push_gate',
  "p_error_code = 'DeviceNotRegistered'",
  "status = 'dead'",
  'private.push_retry_at',
  'private.recover_stale_push_claims',
  'get_match_messages_page',
];
for (const contract of requiredMigrationContracts) if (!migration.includes(contract)) failures.push(`Phase 7 migration missing: ${contract}`);
if ((migration.match(/private\.evaluate_push_gate\(/g) ?? []).length < 3) failures.push('Eligibility/preferences gate is not rechecked at expansion and immediate delivery claim');
if (!migration.includes("p_kind <> 'safety_alert'")) failures.push('Safety/quiet-hours policy is not explicit');

for (const contract of ['push/send','push/getReceipts','x-binder-dispatch-secret','record_push_ticket','record_push_receipt','ReceiptUnavailable']) {
  if (!worker.includes(contract)) failures.push(`Dispatcher missing: ${contract}`);
}
if (/message(?:_|\.)body/i.test(worker)) failures.push('Dispatcher references message body/UGC');
if (!migration.includes('Open Binder to continue the conversation.')) failures.push('Dispatcher generic message copy is not frozen');
// The notification a phone shows is product copy in fifteen languages. The
// database only says which language the recipient reads; the words come from
// the locale files through a generated file, so a sentence has one home.
if (!worker.includes('pushCopy(')) failures.push('Dispatcher does not translate the notification for the recipient');
if (!/language/.test(worker)) failures.push('Dispatcher ignores the recipient language');

for (const contract of ['addPushTokenListener','getExpoPushTokenAsync','AndroidNotificationVisibility.PRIVATE','notificationChannelId','parseNotificationRoute','UUID_PATTERN','syncNotificationPreferences','loadNotificationPreferences']) {
  if (!notifications.includes(contract)) failures.push(`Client notification runtime missing: ${contract}`);
}
if (notifications.indexOf('addNotificationResponseReceivedListener(handle)') > notifications.indexOf('getLastNotificationResponseAsync()')) {
  failures.push('Cold-start notification listener must exist before the last-response snapshot is requested');
}
if (!root.includes('observeNotificationResponses') || !root.includes('fetchMatches')) failures.push('Root does not validate and resolve notification navigation against server matches');
// The pagination control's words moved into the locale file; the contract is
// that the control exists and is wired, not where its label is stored.
const chatCopy = `${chat}\n${readFileSync('src/i18n/locales/en.json', 'utf8')}`;
if (!chat.includes("AppState.addEventListener('change'") || !chat.includes('fetchMessagesPage') || !chatCopy.includes('Load earlier messages')) failures.push('Chat reconnect/pagination contract is incomplete');
for (const forbidden of [/\bpro\b/i, /\bpremium\b/i, /\bboost\b/i, /\bpaywall\b/i, /\bpurchase\b/i]) {
  if (forbidden.test([migration, worker, notifications, root, chat].join('\n'))) failures.push(`Monetization surface is forbidden in Phase 7 runtime: ${forbidden}`);
}
if (app.expo?.scheme !== 'binder') failures.push('Binder deep-link scheme is missing');
if (!UUID_PATTERN.test(app.expo?.extra?.eas?.projectId ?? '')) failures.push('A real EAS project ID is missing from app config');
if (app.expo?.plugins?.flat?.().includes('expo-notifications') !== true) failures.push('Expo notifications plugin is missing');
if (eas.build?.preview?.distribution !== 'internal' || eas.build?.preview?.android?.buildType !== 'apk') failures.push('Two-device EAS preview APK profile is missing');
if (eas.build?.production?.android?.buildType !== 'app-bundle') failures.push('Android EAS production profile is missing');
for (const contract of ['FCM v1','Supabase Cron','dispatch secret','device evidence']) {
  if (!activation.includes(contract)) failures.push(`Production activation gate missing: ${contract}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder Phase 7 push + communication contract PASS');
