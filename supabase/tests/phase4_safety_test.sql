begin;
create extension if not exists pgtap;
create or replace function pg_temp.did_error(statement text) returns boolean language plpgsql as $$ begin execute statement; return false; exception when others then return true; end $$;
select plan(22);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('a1111111-1111-4111-8111-111111111111','authenticated','authenticated','phase4-a@binder.test','{}','{}',now(),now()),
('b2222222-2222-4222-8222-222222222222','authenticated','authenticated','phase4-b@binder.test','{}','{}',now(),now()),
('c3333333-3333-4333-8333-333333333333','authenticated','authenticated','phase4-c@binder.test','{}','{}',now(),now());

select is((select status from private.account_safety where user_id='a1111111-1111-4111-8111-111111111111'),'active','New auth user receives active safety state');

select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select accepted from public.get_legal_gate()),false,'Legal gate starts closed');
select ok(pg_temp.did_error($sql$select public.accept_legal_terms('old','old')$sql$),'Stale policy versions cannot be accepted');
select public.accept_legal_terms('2026-08-15','2026-08-15');
select is((select accepted from public.get_legal_gate()),true,'Current legal versions open the gate');
reset role;

insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
('profile-media','a1111111-1111-4111-8111-111111111111/p4.webp','a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":100}'::jsonb),
('profile-media','b2222222-2222-4222-8222-222222222222/p4.webp','b2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','{"mimetype":"image/webp","size":100}'::jsonb);

select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select public.complete_my_onboarding('Alpha','1992-01-01','woman','Alpha bio',array['Coffee'],array['man'],18::smallint,60::smallint,100::smallint);
insert into public.profile_media(user_id,storage_path,position,width,height,byte_size,mime_type) values('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111/p4.webp',0,900,1080,100,'image/webp');
select is((select moderation_status from public.profile_media where user_id=auth.uid()),'pending','New media is pending moderation');
select ok(pg_temp.did_error($sql$update public.profile_media set moderation_status='approved' where user_id=auth.uid()$sql$),'Client cannot self-approve media');
select public.finalize_my_onboarding(); select public.set_my_location(48.90,9.19); reset role;
select is((select count(*) from private.moderation_cases where source_type='photo_review' and subject_user_id='a1111111-1111-4111-8111-111111111111'),1::bigint,'Photo upload enters moderation queue');
update public.profile_media set moderation_status='approved',moderated_at=clock_timestamp() where user_id='a1111111-1111-4111-8111-111111111111';

select set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}',true); set local role authenticated;
select ok(pg_temp.did_error($sql$select public.complete_my_onboarding('Beta','1990-01-01','man','Beta bio',array['Hiking'],array['woman'],18::smallint,60::smallint,100::smallint)$sql$),'UGC onboarding is blocked before Terms acceptance');
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Beta','1990-01-01','man','Beta bio',array['Hiking'],array['woman'],18::smallint,60::smallint,100::smallint);
insert into public.profile_media(user_id,storage_path,position,width,height,byte_size,mime_type) values('b2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222/p4.webp',0,1080,900,100,'image/webp');
select public.finalize_my_onboarding(); select public.set_my_location(48.80,9.18); reset role;

select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select count(*) from public.get_discovery_batch(20) where target_user_id='b2222222-2222-4222-8222-222222222222'),0::bigint,'Pending photo blocks discovery exposure'); reset role;
update public.profile_media set moderation_status='approved',moderated_at=clock_timestamp() where user_id='b2222222-2222-4222-8222-222222222222';
set local role authenticated;
select is((select count(*) from public.get_discovery_batch(20) where target_user_id='b2222222-2222-4222-8222-222222222222'),1::bigint,'Approved photo restores discovery eligibility');
select public.report_user('b2222222-2222-4222-8222-222222222222','harassment','Safety test',null,null,false);
reset role;
select is((select count(*) from private.moderation_cases where source_type='report' and subject_user_id='b2222222-2222-4222-8222-222222222222'),1::bigint,'Report creates moderation case');
select is((select priority from private.moderation_cases where source_type='report' and subject_user_id='b2222222-2222-4222-8222-222222222222' order by id desc limit 1),70::smallint,'Harassment report receives elevated priority');
select ok(not has_table_privilege('authenticated','private.moderation_cases','select'),'Moderation queue is not client-readable');
select ok(not has_table_privilege('authenticated','public.legal_acceptances','insert'),'Legal acceptance cannot be forged with direct table insert');

-- Fully prepare Gamma so a terminal account transition has real product state to shut down.
insert into public.legal_acceptances(user_id,terms_version,privacy_version) values('c3333333-3333-4333-8333-333333333333','2026-08-15','2026-08-15');
insert into public.profiles(user_id,first_name,bio,gender,onboarding_complete) values('c3333333-3333-4333-8333-333333333333','Gamma','G','nonbinary',true);
insert into public.device_tokens(user_id,token,platform,enabled) values('a1111111-1111-4111-8111-111111111111','ExponentPushToken[phase4-delete-token]','android',true);
insert into public.matches(user_low,user_high,status) values(least('a1111111-1111-4111-8111-111111111111'::uuid,'c3333333-3333-4333-8333-333333333333'::uuid),greatest('a1111111-1111-4111-8111-111111111111'::uuid,'c3333333-3333-4333-8333-333333333333'::uuid),'active');

select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select ok(public.prepare_account_deletion(),'Deletion preparation succeeds');
select ok(public.prepare_account_deletion(),'Deletion preparation is idempotent'); reset role;
select is((select status from private.account_safety where user_id='a1111111-1111-4111-8111-111111111111'),'deletion_requested','Deletion immediately changes account safety state');
select is((select onboarding_complete from public.profiles where user_id='a1111111-1111-4111-8111-111111111111'),false,'Deletion immediately hides the profile');
select is((select status from public.matches where 'a1111111-1111-4111-8111-111111111111'::uuid in (user_low,user_high) order by created_at desc limit 1),'unmatched','Deletion closes active matches');
select is((select enabled from public.device_tokens where user_id='a1111111-1111-4111-8111-111111111111'),false,'Deletion disables push delivery');
select ok(not private.can_view_profile('a1111111-1111-4111-8111-111111111111'),'Restricted account is not publicly viewable without self context');
select * from finish(); rollback;
