// The Play data safety form describes what the app really stores. A column
// added to the database and forgotten in the form is exactly how a store
// listing starts lying, so the two are compared here instead of by memory.
//
// docs/play-datensicherheit.md has to name every column a user's data lands in.
// Adding one without a line in the document fails this gate.
import { readFileSync } from 'node:fs';

const doc = readFileSync('docs/play-datensicherheit.md', 'utf8');
const types = readFileSync('src/types/database.ts', 'utf8');

// Tables holding personal data. Machinery (queues, versions, backups) is listed
// as ignored on purpose, with the reason, rather than silently skipped.
const PERSONAL_TABLES = {
  profiles: 'profile a user fills in',
  user_private: 'birth date and location',
  user_preferences: 'who someone is looking for',
  profile_media: 'photos',
  profile_audio: 'voice intro',
  messages: 'conversations',
  device_tokens: 'push tokens',
  reports: 'safety reports',
  blocks: 'blocks',
  decisions: 'bind and pass',
  legal_acceptances: 'consent records',
  notification_preferences: 'notification settings',
  match_read_state: 'read state',
  matches: 'matches',
};
// Bookkeeping only: no field a person typed, nothing that describes them.
const IGNORED = new Set(['id', 'created_at', 'updated_at', 'moderated_at', 'accepted_at', 'last_read_at', 'last_registered_at', 'location_updated_at', 'ended_at', 'position', 'width', 'height', 'byte_size', 'mime_type', 'status', 'enabled', 'onboarding_complete']);

const problems = [];

for (const [table, purpose] of Object.entries(PERSONAL_TABLES)) {
  const start = types.indexOf(`      ${table}: {`);
  if (start === -1) {
    problems.push(`${table} (${purpose}) is gone from src/types/database.ts — regenerate the types or drop it from this gate.`);
    continue;
  }
  const rowStart = types.indexOf('Row: {', start);
  const rowEnd = types.indexOf('}', rowStart);
  const columns = types
    .slice(rowStart + 'Row: {'.length, rowEnd)
    .split('\n')
    .map((line) => line.trim().split(':')[0])
    .filter((name) => /^[a-z_]+$/.test(name));

  if (!doc.includes(table)) {
    problems.push(`docs/play-datensicherheit.md never mentions the table ${table} (${purpose}).`);
    continue;
  }
  for (const column of columns) {
    if (IGNORED.has(column)) continue;
    if (column.endsWith('_id') && column !== 'user_id') continue;
    if (!doc.includes(column)) {
      problems.push(`docs/play-datensicherheit.md does not mention ${table}.${column} — decide which data type it belongs to before the next release.`);
    }
  }
}

// The declaration also names where the data leaves the device to.
for (const claim of ['privacy.html', 'delete-account.html', 'dataSafety']) {
  if (!doc.includes(claim)) problems.push(`docs/play-datensicherheit.md no longer states ${claim}.`);
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error('\nThe data safety document and the database disagree. The form in the Play Console is a statement about this schema.');
  process.exit(1);
}

console.log(`Data safety document covers ${Object.keys(PERSONAL_TABLES).length} personal tables.`);
