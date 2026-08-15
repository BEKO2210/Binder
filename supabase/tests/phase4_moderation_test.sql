begin;
create extension if not exists pgtap;
select plan(10);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('d1111111-1111-4111-8111-111111111111','authenticated','authenticated','moderation-a@binder.test','{}','{}',now(),now()),
('e2222222-2222-4222-8222-222222222222','authenticated','authenticated','moderation-b@binder.test','{}','{}',now(),now());

insert into public.legal_acceptances(user_id,terms_version,privacy_version) values
('d1111111-1111-4111-8111-111111111111','2026-08-15','2026-08-15'),
('e2222222-2222-4222-8222-222222222222','2026-08-15','2026-08-15');

insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
('profile-media','d1111111-1111-4111-8111-111111111111/review.webp','d1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":100}'::jsonb);

select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
insert into public.profile_media(user_id,storage_path,position,width,height,byte_size,mime_type)
values('d1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111/review.webp',0,1080,900,100,'image/webp');
reset role;

select is((select moderation_status from public.profile_media where user_id='d1111111-1111-4111-8111-111111111111'),'pending','Photo starts pending');
select is((select count(*) from private.moderation_cases where source_type='photo_review' and subject_user_id='d1111111-1111-4111-8111-111111111111'),1::bigint,'Photo creates one review case');
select ok(not has_function_privilege('authenticated','private.moderate_case(bigint,text,text,text)','execute'),'Authenticated users cannot execute moderator action function');
select ok(has_function_privilege('service_role','private.moderate_case(bigint,text,text,text)','execute'),'Server service role can execute moderator action function');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select private.moderate_case((select id from private.moderation_cases where source_type='photo_review' and subject_user_id='d1111111-1111-4111-8111-111111111111'),'approve_media','phase4-test','clean profile photo');
select is((select moderation_status from public.profile_media where user_id='d1111111-1111-4111-8111-111111111111'),'approved','Moderator approval changes media state');
select is((select status from private.moderation_cases where source_type='photo_review' and subject_user_id='d1111111-1111-4111-8111-111111111111'),'actioned','Photo review case becomes terminal');
select is((select count(*) from private.moderation_actions where action='approve_media' and actor='phase4-test'),1::bigint,'Media decision receives immutable action log');

insert into public.reports(reporter_id,reported_id,reason,details)
values('d1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222','underage','age concern');
select is((select priority from private.moderation_cases where source_type='report' and subject_user_id='e2222222-2222-4222-8222-222222222222'),100::smallint,'Underage report enters highest priority');

select private.moderate_case((select id from private.moderation_cases where source_type='report' and subject_user_id='e2222222-2222-4222-8222-222222222222'),'suspend','phase4-test','credible underage concern');
select is((select status from private.account_safety where user_id='e2222222-2222-4222-8222-222222222222'),'suspended','Moderator can suspend reported account');
select is((select count(*) from private.moderation_actions where action='suspend' and actor='phase4-test'),1::bigint,'Suspension is audit logged');

select * from finish();
rollback;
