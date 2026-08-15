begin;
create extension if not exists pgtap;

create or replace function pg_temp.did_error(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;

select plan(28);

select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('f6111111-1111-4111-8111-111111111111','authenticated','authenticated','phase6-media@binder.test','{}','{}',now(),now()),
('f6222222-2222-4222-8222-222222222222','authenticated','authenticated','phase6-other@binder.test','{}','{}',now(),now());

insert into public.legal_acceptances(user_id,terms_version,privacy_version) values
('f6111111-1111-4111-8111-111111111111','2026-08-15','2026-08-15'),
('f6222222-2222-4222-8222-222222222222','2026-08-15','2026-08-15');

insert into public.profiles(user_id,first_name,bio,gender,onboarding_complete) values
('f6111111-1111-4111-8111-111111111111','Gallery','Gallery test','woman',false),
('f6222222-2222-4222-8222-222222222222','Other','Other test','man',false);
insert into public.user_private(user_id,birth_date) values
('f6111111-1111-4111-8111-111111111111','1992-01-01'),
('f6222222-2222-4222-8222-222222222222','1991-01-01');
insert into public.user_preferences(user_id,interested_in,min_age,max_age,max_distance_km) values
('f6111111-1111-4111-8111-111111111111',array['man'],18,60,100),
('f6222222-2222-4222-8222-222222222222',array['woman'],18,60,100);

insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
select 'profile-media', 'f6111111-1111-4111-8111-111111111111/' || n || '.webp',
       'f6111111-1111-4111-8111-111111111111'::uuid,
       'f6111111-1111-4111-8111-111111111111',
       '{"mimetype":"image/webp","size":100}'::jsonb
from generate_series(1,9) n;
insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
('profile-media','f6222222-2222-4222-8222-222222222222/other.webp','f6222222-2222-4222-8222-222222222222','f6222222-2222-4222-8222-222222222222','{"mimetype":"image/webp","size":100}'::jsonb);

select set_config('request.jwt.claims','{"sub":"f6111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select public.register_profile_media('f6111111-1111-4111-8111-111111111111/1.webp',900::smallint,1080::smallint,100,'image/webp');
select public.register_profile_media('f6111111-1111-4111-8111-111111111111/2.webp',1080::smallint,900::smallint,100,'image/webp');

select is((select count(*) from public.profile_media where user_id=auth.uid()),2::bigint,'Two registered gallery photos persist');
select is((select array_agg(position order by position) from public.profile_media where user_id=auth.uid()),array[0,1]::smallint[],'Registration allocates dense positions from zero');
select is((select count(*) from public.profile_media where user_id=auth.uid() and moderation_status='pending'),2::bigint,'New gallery photos are pending moderation');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from private.moderation_cases where source_type='photo_review' and subject_user_id='f6111111-1111-4111-8111-111111111111'),2::bigint,'Each registered photo enters moderation queue');

select set_config('request.jwt.claims','{"sub":"f6111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.register_profile_media('f6222222-2222-4222-8222-222222222222/other.webp',100::smallint,100::smallint,100,'image/webp')$sql$),'Cannot register another user storage path');
select ok(pg_temp.did_error($sql$select * from public.register_profile_media('f6111111-1111-4111-8111-111111111111/3.webp',1081::smallint,100::smallint,100,'image/webp')$sql$),'Server rejects over-1080 metadata');
select ok(pg_temp.did_error($sql$select * from public.register_profile_media('f6111111-1111-4111-8111-111111111111/3.webp',100::smallint,100::smallint,100,'image/jpeg')$sql$),'Server rejects non-WebP metadata');
reset role;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profile_media set moderation_status='approved',moderated_at=clock_timestamp()
where user_id='f6111111-1111-4111-8111-111111111111' and storage_path in (
'f6111111-1111-4111-8111-111111111111/1.webp','f6111111-1111-4111-8111-111111111111/2.webp');

select set_config('request.jwt.claims','{"sub":"f6111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select public.finalize_my_onboarding();
select is((select onboarding_complete from public.profiles where user_id=auth.uid()),true,'Gallery user completes onboarding with uploaded media');
select public.set_primary_profile_media((select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/2.webp'));
select is((select storage_path from public.profile_media where user_id=auth.uid() and position=0),'f6111111-1111-4111-8111-111111111111/2.webp','Approved secondary photo can become primary atomically');

select public.register_profile_media('f6111111-1111-4111-8111-111111111111/3.webp',1080::smallint,1080::smallint,100,'image/webp');
select is((select position from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/3.webp'),2::smallint,'Third photo receives next free position');
select ok(pg_temp.did_error($sql$select public.set_primary_profile_media((select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/3.webp'))$sql$),'Pending photo cannot become primary on completed profile');
select ok(pg_temp.did_error($sql$select public.reorder_my_profile_media(array[(select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/3.webp'),(select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/1.webp'),(select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/2.webp')])$sql$),'Completed profile reorder rejects pending primary');

select public.reorder_my_profile_media(array[
(select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/1.webp'),
(select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/3.webp'),
(select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/2.webp')]);
select is((select string_agg(storage_path,',' order by position) from public.profile_media where user_id=auth.uid()),
'f6111111-1111-4111-8111-111111111111/1.webp,f6111111-1111-4111-8111-111111111111/3.webp,f6111111-1111-4111-8111-111111111111/2.webp','Atomic reorder persists exact requested order');

select is((select storage_path from public.remove_my_profile_media((select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/1.webp'))),'f6111111-1111-4111-8111-111111111111/1.webp','Removing primary returns storage path for client cleanup');
select is((select count(*) from public.profile_media where user_id=auth.uid()),2::bigint,'Primary removal deletes only selected metadata');
select is((select storage_path from public.profile_media where user_id=auth.uid() and position=0),'f6111111-1111-4111-8111-111111111111/2.webp','Primary removal auto-promotes another approved photo');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from private.moderation_cases where source_type='photo_review' and subject_user_id='f6111111-1111-4111-8111-111111111111'),2::bigint,'Deleting photo cascades its contradictory photo-review case');

select set_config('request.jwt.claims','{"sub":"f6111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.remove_my_profile_media((select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/2.webp'))$sql$),'Cannot remove primary when only replacement is pending');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profile_media set moderation_status='approved',moderated_at=clock_timestamp()
where storage_path='f6111111-1111-4111-8111-111111111111/3.webp';
select set_config('request.jwt.claims','{"sub":"f6111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select storage_path from public.remove_my_profile_media((select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/2.webp'))),'f6111111-1111-4111-8111-111111111111/2.webp','Approved replacement allows primary removal');
select is((select storage_path from public.profile_media where user_id=auth.uid() and position=0),'f6111111-1111-4111-8111-111111111111/3.webp','Approved replacement becomes primary');
select ok(pg_temp.did_error($sql$select * from public.remove_my_profile_media((select id from public.profile_media where storage_path='f6111111-1111-4111-8111-111111111111/3.webp'))$sql$),'Completed profile cannot delete its final photo');

select public.register_profile_media('f6111111-1111-4111-8111-111111111111/4.webp',1080::smallint,1080::smallint,100,'image/webp');
select public.register_profile_media('f6111111-1111-4111-8111-111111111111/5.webp',1080::smallint,1080::smallint,100,'image/webp');
select public.register_profile_media('f6111111-1111-4111-8111-111111111111/6.webp',1080::smallint,1080::smallint,100,'image/webp');
select public.register_profile_media('f6111111-1111-4111-8111-111111111111/7.webp',1080::smallint,1080::smallint,100,'image/webp');
select public.register_profile_media('f6111111-1111-4111-8111-111111111111/8.webp',1080::smallint,1080::smallint,100,'image/webp');
select is((select count(*) from public.profile_media where user_id=auth.uid()),6::bigint,'Gallery fills to exactly six photos');
select is((select count(distinct position) from public.profile_media where user_id=auth.uid()),6::bigint,'All six gallery positions remain unique');
select ok(pg_temp.did_error($sql$select * from public.register_profile_media('f6111111-1111-4111-8111-111111111111/9.webp',1080::smallint,1080::smallint,100,'image/webp')$sql$),'Seventh profile photo is rejected');
select ok(pg_temp.did_error($sql$select public.reorder_my_profile_media(array[(select id from public.profile_media where user_id=auth.uid() order by position limit 1)])$sql$),'Reorder cannot omit gallery members');
select ok(pg_temp.did_error($sql$select public.reorder_my_profile_media(array[(select id from public.profile_media where user_id=auth.uid() order by position limit 1),(select id from public.profile_media where user_id=auth.uid() order by position limit 1),(select id from public.profile_media where user_id=auth.uid() order by position offset 1 limit 1),(select id from public.profile_media where user_id=auth.uid() order by position offset 2 limit 1),(select id from public.profile_media where user_id=auth.uid() order by position offset 3 limit 1),(select id from public.profile_media where user_id=auth.uid() order by position offset 4 limit 1)])$sql$),'Reorder rejects duplicate media IDs');
select ok(not has_function_privilege('anon','public.register_profile_media(text,smallint,smallint,integer,text)','execute'),'Anonymous clients cannot register profile media');
reset role;

select set_config('request.jwt.claims','{"sub":"f6222222-2222-4222-8222-222222222222","role":"authenticated"}',true); set local role authenticated;
select ok(pg_temp.did_error($sql$select public.set_primary_profile_media((select id from public.profile_media where user_id='f6111111-1111-4111-8111-111111111111' order by position limit 1))$sql$),'Another user cannot mutate gallery primary');
reset role;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from public.profile_media where user_id='f6111111-1111-4111-8111-111111111111' and split_part(storage_path,'/',1) <> user_id::text),0::bigint,'All gallery metadata remains owner-path scoped');

select * from finish();
rollback;
