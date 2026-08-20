// Fills Google's data safety CSV from one declared answer map.
//
// The form has 782 rows and 217 questions; clicking through it on a phone is how
// wrong answers happen — the exported form claimed ethnic origin, called the
// location approximate, and marked stored data as ephemeral. So the answers live
// here, next to the reason for each one, and the CSV is generated:
//
//   node scripts/play-data-safety-csv.mjs docs/play-data-safety-export.csv
//
// Import the result in Play Console (App content → Data safety → Import), or
// POST it to /androidpublisher/v3/applications/{package}/dataSafety.
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2] ?? 'docs/play-data-safety-export.csv';
const output = process.argv[3] ?? 'docs/play-data-safety.csv';

// Which data types Binder collects. Everything absent here is answered "no".
// Evidence for each line is in docs/play-datensicherheit.md.
const COLLECTED = {
  PSL_NAME: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'] },
  PSL_EMAIL: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'] },
  PSL_USER_ACCOUNT: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT', 'PSL_FRAUD_PREVENTION_SECURITY'] },
  // profiles.spirituality — Article 9 GDPR, volunteered from a fixed list.
  PSL_POLITICAL_RELIGIOUS: { control: 'OPTIONAL', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_PERSONALIZATION'] },
  // profiles.gender together with user_preferences.interested_in.
  PSL_SEXUAL_ORIENTATION_GENDER_IDENTITY: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_PERSONALIZATION'] },
  // user_private.birth_date plus the optional lifestyle attributes.
  PSL_OTHER_PERSONAL: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_PERSONALIZATION'] },
  // Accuracy.Balanced is roughly 100 m — that is precise, not approximate.
  PSL_PRECISE_LOCATION: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_PERSONALIZATION'] },
  PSL_OTHER_MESSAGES: { control: 'OPTIONAL', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_FRAUD_PREVENTION_SECURITY'] },
  PSL_PHOTOS: { control: 'OPTIONAL', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_FRAUD_PREVENTION_SECURITY'] },
  PSL_AUDIO: { control: 'OPTIONAL', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_FRAUD_PREVENTION_SECURITY'] },
  // decisions, matches, the ranking measurement.
  PSL_USER_INTERACTION: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_PERSONALIZATION', 'PSL_ANALYTICS'] },
  // profiles.bio and interests: open text the user writes.
  PSL_USER_GENERATED_CONTENT: { control: 'OPTIONAL', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_FRAUD_PREVENTION_SECURITY'] },
  // blocks, reports, legal acceptances, notification settings, filters.
  PSL_OTHER_APP_ACTIVITY: { control: 'REQUIRED', purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_FRAUD_PREVENTION_SECURITY'] },
  // device_tokens: FCM token and installation id, only with notifications on.
  PSL_DEVICE_ID: { control: 'OPTIONAL', purposes: ['PSL_APP_FUNCTIONALITY'] },
  // Beta diagnostics, off unless the user switches them on.
  PSL_PERFORMANCE_DIAGNOSTICS: { control: 'OPTIONAL', purposes: ['PSL_ANALYTICS'] },
};

// Answers outside the per-data-type grid.
const TOP_LEVEL = {
  PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA: 'true',
  PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT: 'true',      // HTTPS everywhere, no http:// in the code
  PSL_INDEPENDENTLY_VALIDATED: 'false',                   // no external audit has happened
  PSL_ACCOUNT_DELETION_URL: 'https://beko2210.github.io/Binder/delete-account.html',
  PSL_DATA_DELETION_URL: 'https://beko2210.github.io/Binder/delete-account.html',
};
const SINGLE_CHOICE = {
  PSL_SUPPORT_DATA_DELETION_BY_USER: 'DATA_DELETION_YES',
};
const MULTI_CHOICE = {
  // Email and password, or Sign in with Google. Nothing else.
  PSL_SUPPORTED_ACCOUNT_CREATION_METHODS: ['PSL_ACM_USER_ID_PASSWORD', 'PSL_ACM_OAUTH'],
};

function parse(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r') field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const quote = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const rows = parse(readFileSync(input, 'utf8'));
const header = rows[0];
const body = rows.slice(1).filter((row) => row.length >= 5);

const changes = [];
for (const row of body) {
  const [question, response, previous] = row;
  let next = '';

  if (question in TOP_LEVEL) next = TOP_LEVEL[question];
  else if (question in SINGLE_CHOICE) next = response === SINGLE_CHOICE[question] ? 'true' : '';
  else if (question in MULTI_CHOICE) next = MULTI_CHOICE[question].includes(response) ? 'true' : '';
  else if (question.startsWith('PSL_DATA_TYPES_')) next = response in COLLECTED ? 'true' : '';
  else if (question.startsWith('PSL_DATA_USAGE_RESPONSES:')) {
    const [, type, aspect] = question.split(':');
    const entry = COLLECTED[type];
    if (entry) {
      // Collected, never shared: no advertising network, no analytics SDK, and
      // Google, Supabase and Brevo only process on Binder's behalf.
      if (aspect === 'PSL_DATA_USAGE_COLLECTION_AND_SHARING') next = response === 'PSL_DATA_USAGE_ONLY_COLLECTED' ? 'true' : '';
      // Nothing is processed in memory only — all of it is stored server-side.
      else if (aspect === 'PSL_DATA_USAGE_EPHEMERAL') next = 'false';
      else if (aspect === 'DATA_USAGE_USER_CONTROL') next = response === `PSL_DATA_USAGE_USER_CONTROL_${entry.control}` ? 'true' : '';
      else if (aspect === 'DATA_USAGE_COLLECTION_PURPOSE') next = entry.purposes.includes(response) ? 'true' : '';
      else if (aspect === 'DATA_USAGE_SHARING_PURPOSE') next = '';
    }
  }

  if (next !== previous) changes.push(`${question}${response ? `:${response}` : ''}: ${previous || '(leer)'} -> ${next || '(leer)'}`);
  row[2] = next;
}

writeFileSync(output, [header, ...body].map((row) => row.map(quote).join(',')).join('\n') + '\n');
console.log(`${output}: ${body.length} Zeilen, ${changes.length} Änderungen gegenüber ${input}`);
for (const change of changes) console.log(`  ${change}`);
