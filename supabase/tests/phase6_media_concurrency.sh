#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
USER_ID="f6333333-3333-4333-8333-333333333333"
ATTEMPTS=12

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
select set_config('request.jwt.claims','{"role":"service_role"}',false);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('${USER_ID}','authenticated','authenticated','phase6-media-race@binder.test','{}','{}',now(),now());
insert into public.legal_acceptances(user_id,terms_version,privacy_version)
values('${USER_ID}','2026-08-15','2026-08-15');
insert into public.profiles(user_id,first_name,bio,gender,onboarding_complete)
values('${USER_ID}','MediaRace','Concurrency','woman',false);
insert into public.user_private(user_id,birth_date) values('${USER_ID}','1992-01-01');
insert into public.user_preferences(user_id,interested_in,min_age,max_age,max_distance_km)
values('${USER_ID}',array['man'],18,60,100);
insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
select 'profile-media','${USER_ID}/race-' || n || '.webp','${USER_ID}'::uuid,'${USER_ID}','{"mimetype":"image/webp","size":100}'::jsonb
from generate_series(1,${ATTEMPTS}) n;
SQL

register_one() {
  local n="$1"
  if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"${USER_ID}","role":"authenticated"}',true);
set local role authenticated;
select * from public.register_profile_media('${USER_ID}/race-${n}.webp',1080::smallint,1080::smallint,100,'image/webp');
commit;
SQL
  then
    return 0
  fi
}

echo "Running ${ATTEMPTS} simultaneous gallery registrations..."
pids=()
for n in $(seq 1 "$ATTEMPTS"); do
  register_one "$n" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

COUNTS="$(psql "$DB_URL" -X -At -F '|' -c "
select
  (select count(*) from public.profile_media where user_id='${USER_ID}'::uuid),
  (select count(distinct position) from public.profile_media where user_id='${USER_ID}'::uuid),
  (select min(position) from public.profile_media where user_id='${USER_ID}'::uuid),
  (select max(position) from public.profile_media where user_id='${USER_ID}'::uuid),
  (select count(*) from private.moderation_cases where source_type='photo_review' and subject_user_id='${USER_ID}'::uuid);
")"
if [[ "$COUNTS" != '6|6|0|5|6' ]]; then
  echo "Six-photo allocation invariant failed: expected 6|6|0|5|6, got ${COUNTS}" >&2
  exit 1
fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.profile_media set moderation_status='approved',moderated_at=clock_timestamp()
where user_id='${USER_ID}'::uuid;
update public.profiles set onboarding_complete=true where user_id='${USER_ID}'::uuid;
SQL

ORDER_A="$(psql "$DB_URL" -X -At -c "select array_agg(id order by position)::text from public.profile_media where user_id='${USER_ID}'::uuid")"
ORDER_B="$(psql "$DB_URL" -X -At -c "select array_agg(id order by position desc)::text from public.profile_media where user_id='${USER_ID}'::uuid")"

reorder() {
  local order="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"${USER_ID}","role":"authenticated"}',true);
set local role authenticated;
select public.reorder_my_profile_media('${order}'::uuid[]);
commit;
SQL
}

echo "Racing two complete gallery reorders..."
reorder "$ORDER_A" & p1=$!
reorder "$ORDER_B" & p2=$!
wait "$p1"
wait "$p2"

FINAL_ORDER="$(psql "$DB_URL" -X -At -c "select array_agg(id order by position)::text from public.profile_media where user_id='${USER_ID}'::uuid")"
if [[ "$FINAL_ORDER" != "$ORDER_A" && "$FINAL_ORDER" != "$ORDER_B" ]]; then
  echo "Atomic reorder invariant failed: final order is neither complete serial outcome" >&2
  echo "A=${ORDER_A}" >&2
  echo "B=${ORDER_B}" >&2
  echo "final=${FINAL_ORDER}" >&2
  exit 1
fi

BAD_POSITIONS="$(psql "$DB_URL" -X -At -c "select count(*) from (select position,count(*) c from public.profile_media where user_id='${USER_ID}'::uuid group by position having count(*)<>1) bad")"
if [[ "$BAD_POSITIONS" != '0' ]]; then
  echo "Reorder left duplicate/missing position groups: ${BAD_POSITIONS}" >&2
  exit 1
fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
select set_config('request.jwt.claims','{"role":"service_role"}',false);
delete from auth.users where id='${USER_ID}'::uuid;
delete from storage.objects where bucket_id='profile-media' and name like '${USER_ID}/%';
SQL

echo "PASS: ${ATTEMPTS} concurrent uploads -> exactly 6 slots; concurrent reorders -> one complete serial order."
