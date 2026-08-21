// A conversation for the black-box journeys to walk into.
//
// The chat journey needs two people who are already matched. Deciding twice
// through the app would make the journey about the deck instead of about the
// chat, so the pair is arranged here — with the same rule as every other
// staging script: it is labelled, and `remove` can only take away what `create`
// made.
//
//   node scripts/stage-test-match.mjs create
//   node scripts/stage-test-match.mjs remove
import { execFileSync } from 'node:child_process';

const [mode] = process.argv.slice(2);
if (!['create', 'remove'].includes(mode)) {
  console.error('usage: stage-test-match.mjs <create|remove>');
  process.exit(2);
}

const projectRef = process.env.BINDER_PROJECT_REF ?? 'sbohsxtzitqhyswznhec';
const testName = process.env.BINDER_TEST_NAME ?? 'Testlauf (Testkonto)';

function query(sql) {
  const raw = execFileSync(`${process.env.HOME}/.local/bin/supabase`, ['db', 'query', '--linked', sql], { encoding: 'utf8', env: { ...process.env, SUPABASE_PROJECT_REF: projectRef } });
  const match = /\[[\s\S]*\]/.exec(raw);
  return match ? JSON.parse(match[0]) : [];
}

if (mode === 'create') {
  const rows = query(`
    with me as (select user_id from public.profiles where first_name = '${testName}' limit 1),
    partner as (
      select p.user_id from public.profiles p
      join auth.users u on u.id = p.user_id
      where u.raw_user_meta_data->>'binder_demo_profile' = 'true'
        and p.first_name <> '${testName}'
      order by p.created_at
      limit 1
    ),
    created as (
      insert into public.matches (user_low, user_high, status)
      select least((select user_id from me), (select user_id from partner)),
             greatest((select user_id from me), (select user_id from partner)),
             'active'
      where (select count(*) from me) = 1 and (select count(*) from partner) = 1
      returning id
    )
    select (select count(*) from created)::int as created`);
  const created = rows[0]?.created ?? 0;
  console.log(created === 1 ? 'Ein Match für den Testlauf steht bereit.' : 'Kein Match angelegt — Testkonto oder Demo-Profil fehlt.');
  process.exit(created === 1 ? 0 : 1);
}

query(`
  delete from public.messages where match_id in (
    select m.id from public.matches m
    join public.profiles p on p.user_id in (m.user_low, m.user_high)
    where p.first_name = '${testName}'
  );
  delete from public.matches where id in (
    select m.id from public.matches m
    join public.profiles p on p.user_id in (m.user_low, m.user_high)
    where p.first_name = '${testName}'
  )`);
console.log('Match und Nachrichten des Testlaufs entfernt.');
