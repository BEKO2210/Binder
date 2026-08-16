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

select plan(43);

select is(
  (select email from private.admin_members where role = 'owner'),
  'belkis.aslani@gmail.com',
  'Belkis is the only bootstrapped admin email'
);
select is((select role from private.admin_members where email = 'belkis.aslani@gmail.com'), 'owner', 'Bootstrap account is owner');
select ok(not has_table_privilege('authenticated', 'private.admin_members', 'select'), 'Authenticated clients cannot read the admin membership table');
select ok(not has_function_privilege('anon', 'public.claim_admin_session()', 'execute'), 'Anonymous clients cannot claim an admin session');
select ok(has_function_privilege('authenticated', 'public.claim_admin_session()', 'execute'), 'Authenticated clients can attempt the guarded session claim');

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'belkis.aslani@gmail.com', now(), '{}', '{}', now(), now()),
('81000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'subject@binder.test', now(), '{}', '{}', now(), now()),
('81000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'reporter@binder.test', now(), '{}', '{}', now(), now()),
('81000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'stranger@binder.test', now(), '{}', '{}', now(), now());

insert into auth.sessions(id, user_id) values
('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001'),
('83000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000005');

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete) values
('81000000-0000-4000-8000-000000000003', 'Subject', 'Moderation test subject', 'man', false),
('81000000-0000-4000-8000-000000000004', 'Reporter', '', 'woman', false),
('81000000-0000-4000-8000-000000000005', 'Stranger', '', 'nonbinary', false);

insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
('profile-media', '81000000-0000-4000-8000-000000000003/admin-one.webp', '81000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', '{"mimetype":"image/webp","size":100}'::jsonb),
('profile-media', '81000000-0000-4000-8000-000000000003/admin-two.webp', '81000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', '{"mimetype":"image/webp","size":100}'::jsonb);

insert into public.profile_media(user_id, storage_path, position, width, height, byte_size, mime_type) values
('81000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003/admin-one.webp', 0, 1080, 900, 100, 'image/webp'),
('81000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003/admin-two.webp', 1, 900, 1080, 100, 'image/webp');

insert into public.reports(id, reporter_id, reported_id, reason, details) values
('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000003', 'spam', 'Repeated promotion'),
('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000003', 'underage', 'Credible age concern');

insert into private.report_context(report_id, reported_profile_snapshot) values
('82000000-0000-4000-8000-000000000001', '{"first_name":"Subject","age":25}'::jsonb),
('82000000-0000-4000-8000-000000000002', '{"first_name":"Subject","age":15}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000005"}', true);
set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.claim_admin_session()$sql$), 'A normal Binder account cannot claim admin access');
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select is((select admin_role from public.claim_admin_session()), 'owner', 'Confirmed bootstrap email claims the owner role');
select ok((select can_review_media and can_review_reports and can_suspend_accounts from public.claim_admin_session()), 'Owner receives all moderation permissions');
select is((select pending_media from public.admin_dashboard_summary()), 2::bigint, 'Dashboard counts both pending photo cases');
select is((select open_reports from public.admin_dashboard_summary()), 2::bigint, 'Dashboard counts both open report cases');
select is((select count(*) from public.admin_list_media_queue()), 2::bigint, 'Owner can read the photo queue');
select is((select count(*) from public.admin_list_report_queue()), 2::bigint, 'Owner can read the report queue');
select is(
  (select moderator_status from public.admin_prepare_moderator_invite('moderator@binder.test', true, true, false)),
  'invited',
  'Owner can create a pending moderator invitation'
);
select ok(
  (select needs_invite from public.admin_prepare_moderator_invite('moderator@binder.test', true, true, false)),
  'Unknown moderator email requires an Auth invitation'
);
reset role;

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'moderator@binder.test', now(), '{}', '{}', now(), now()
);

insert into auth.sessions(id, user_id) values
('83000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select is((select admin_role from public.claim_admin_session()), 'moderator', 'Invited confirmed email claims the moderator role');
select ok(
  (select can_review_media and can_review_reports and not can_suspend_accounts from public.claim_admin_session()),
  'Moderator receives only the permissions assigned by owner'
);
reset role;
delete from auth.sessions where id = '83000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select ok(
  pg_temp.did_error($sql$select * from public.admin_dashboard_summary()$sql$),
  'Deleting an Auth session immediately revokes dashboard access'
);
reset role;
insert into auth.sessions(id, user_id) values
('83000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002');
update auth.users set email = 'changed@binder.test' where id = '81000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.admin_list_media_queue()$sql$), 'Changing the confirmed Auth email immediately revokes the bound admin identity');
reset role;
update auth.users set email = 'moderator@binder.test' where id = '81000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.admin_list_moderators()$sql$), 'Moderator cannot list or manage moderators');
select ok(
  pg_temp.did_error($sql$select * from public.admin_prepare_moderator_invite('attacker@binder.test', true, true, true)$sql$),
  'Moderator cannot invite another moderator'
);
select is((select count(*) from public.admin_list_media_queue()), 2::bigint, 'Media reviewer can read pending media');
select is((select count(*) from public.admin_list_report_queue()), 2::bigint, 'Report reviewer can read pending reports');
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name like '%/admin-%'),
  2::bigint,
  'Media reviewer can download registered pending profile media'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000005"}', true);
set local role authenticated;
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-media' and name like '%/admin-%'),
  0::bigint,
  'Non-admin cannot use the admin storage policy'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select lives_ok(
  $sql$select public.admin_review_media((select case_id from public.admin_list_media_queue() order by case_id limit 1), 'approve_media', null)$sql$,
  'Media reviewer can approve a queued photo'
);
select is(
  auth.uid(),
  '81000000-0000-4000-8000-000000000002'::uuid,
  'Admin media review restores the authenticated caller context'
);
reset role;
select is(
  (select moderation_status from public.profile_media where storage_path like '%/admin-one.webp'),
  'approved',
  'Approved action changes the server-controlled media state'
);
select is(
  (select actor from private.moderation_actions where action = 'approve_media' order by id desc limit 1),
  'moderator@binder.test',
  'Audit actor is derived from the confirmed session, not client input'
);

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select ok(
  pg_temp.did_error($sql$select public.admin_review_media((select case_id from public.admin_list_media_queue() order by case_id limit 1), 'reject_media', '')$sql$),
  'Rejecting media requires a reason'
);
select lives_ok(
  $sql$select public.admin_review_media((select case_id from public.admin_list_media_queue() order by case_id limit 1), 'reject_media', 'Image violates profile rules')$sql$,
  'Media reviewer can reject with an audit reason'
);
reset role;
select is(
  (select moderation_status from public.profile_media where storage_path like '%/admin-two.webp'),
  'rejected',
  'Rejected action changes the server-controlled media state'
);

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select lives_ok(
  $sql$select public.admin_review_report((select case_id from public.admin_list_report_queue() where reason = 'spam'), 'dismiss', 'No violation found')$sql$,
  'Report reviewer can dismiss a report'
);
select ok(
  pg_temp.did_error($sql$select public.admin_review_report((select case_id from public.admin_list_report_queue() where reason = 'underage'), 'suspend', 'Confirmed policy violation')$sql$),
  'Report reviewer without suspension permission cannot suspend an account'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select public.admin_update_moderator('moderator@binder.test', true, true, true, true);
select ok(
  (select can_suspend_accounts from public.admin_list_moderators() where moderator_email = 'moderator@binder.test'),
  'Owner can grant suspension permission explicitly'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select lives_ok(
  $sql$select public.admin_review_report((select case_id from public.admin_list_report_queue() where reason = 'underage'), 'suspend', 'Confirmed underage safety violation')$sql$,
  'Authorized safety moderator can suspend the reported account'
);
reset role;
select is(
  (select status from private.account_safety where user_id = '81000000-0000-4000-8000-000000000003'),
  'suspended',
  'Suspension uses the existing account-safety invariant'
);
select is(
  (select actor from private.moderation_actions where action = 'suspend' order by id desc limit 1),
  'moderator@binder.test',
  'Suspension receives the immutable authenticated actor'
);

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select public.admin_update_moderator('moderator@binder.test', false, true, true, true);
select is(
  (select moderator_status from public.admin_list_moderators() where moderator_email = 'moderator@binder.test'),
  'disabled',
  'Owner can disable a moderator immediately'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.admin_dashboard_summary()$sql$), 'Disabled moderator immediately loses dashboard access');
reset role;

select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"83000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select ok(
  pg_temp.did_error($sql$select * from public.admin_prepare_moderator_invite('belkis.aslani@gmail.com', true, true, true)$sql$),
  'Owner membership cannot be replaced through moderator management'
);
reset role;

select is((select count(*) from private.moderation_actions), 4::bigint, 'Every completed moderation decision has one audit action');
select ok(has_function_privilege('service_role', 'private.moderate_case(bigint,text,text,text)', 'execute'), 'Existing service-role operator path remains compatible');

delete from auth.users where id = '81000000-0000-4000-8000-000000000001';
select ok(
  exists (
    select 1 from private.admin_members
    where email = 'belkis.aslani@gmail.com' and user_id is null and status = 'invited'
  ),
  'Deleting the owner Auth account safely returns the fixed owner membership to invited state'
);

select * from finish();
rollback;
