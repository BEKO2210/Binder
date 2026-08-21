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

// Whatever the Play form declares as a special category, the privacy policy has
// to name in words. The form said Binder collects sexual orientation — true,
// `user_preferences.interested_in` together with the profile gender — while the
// policy listed only beliefs under Article 9 and never mentioned it. A person
// reads the policy, not a CSV in a repository.
const SPECIAL_CATEGORIES = {
  PSL_SEXUAL_ORIENTATION_GENDER_IDENTITY: {
    en: /sexual orientation/i,
    de: /sexuelle Orientierung/i,
  },
  PSL_POLITICAL_RELIGIOUS: {
    en: /religion or worldview/i,
    de: /Religion oder (?:Weltanschauung|\u00dcberzeugung)/i,
  },
};

const csv = readFileSync('docs/play-data-safety.csv', 'utf8');
const policies = { en: readFileSync('site/privacy.html', 'utf8'), de: readFileSync('site/de/privacy.html', 'utf8') };
for (const [type, patterns] of Object.entries(SPECIAL_CATEGORIES)) {
  const declared = new RegExp(`PSL_DATA_TYPES_[A-Z_]+,${type},true`).test(csv);
  if (!declared) continue;
  for (const [locale, pattern] of Object.entries(patterns)) {
    if (!pattern.test(policies[locale])) {
      problems.push(`The Play form declares ${type}, but site/${locale === 'en' ? '' : `${locale}/`}privacy.html never names it (${pattern}). Article 13 GDPR asks for the words, not the checkbox.`);
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
