begin;
create extension if not exists pgtap;
create or replace function pg_temp.did_error(statement text) returns boolean language plpgsql as $$ begin execute statement; return false; exception when others then return true; end $$;
select plan(36);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('f1111111-1111-4111-8111-111111111111','authenticated','authenticated','beta-a@binder.test','{}','{}',now(),now()),
('f2222222-2222-4222-8222-222222222222','authenticated','authenticated','beta-b@binder.test','{}','{}',now(),now()),
('f3333333-3333-4333-8333-333333333333','authenticated','authenticated','beta-c@binder.test','{}','{}',now(),now());

select is((select diagnostics_enabled from private.beta_preferences where user_id='f1111111-1111-4111-8111-111111111111'),false,'New user starts with optional diagnostics disabled');
select is((select rank_variant from private.beta_preferences where user_id='f1111111-1111-4111-8111-111111111111'),'baseline_v1','New user receives explicit baseline ranking variant');
select ok(not has_table_privilege('authenticated','private.beta_client_events','select'),'Client cannot read diagnostic event table');
select ok(not has_table_privilege('authenticated','private.discovery_impressions','select'),'Client cannot read ranking impression table');
select ok(not has_function_privilege('authenticated','private.beta_daily_summary(integer)','execute'),'Client cannot read operator beta dashboard');
select has_index('private','moderation_actions','moderation_actions_case_id_idx','Phase 4 moderation action FK receives covering index');
select has_index('private','moderation_cases','moderation_cases_media_id_idx','Phase 4 media FK receives covering index');
select has_index('private','moderation_cases','moderation_cases_report_id_idx','Phase 4 report FK receives covering index');

select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select privacy_version from public.get_legal_gate()),'2026-08-15','Beta instrumentation remains inside the initial pre-user privacy-policy version');
select public.accept_legal_terms('2026-08-15','2026-08-15');
select is((select diagnostics_enabled from public.get_beta_settings()),false,'Beta settings expose diagnostics off by default');
select is((select client_retention_days from public.get_beta_settings()),30::smallint,'Client diagnostic retention contract is 30 days');
select is(public.record_beta_client_event('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','app_session','app',10,1,'ok','android','0.5.0'),false,'Disabled diagnostics drop client event');
select is(public.set_beta_diagnostics(true),true,'User can explicitly opt into beta diagnostics');
select is(public.record_beta_client_event('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','app_session','app',10,1,'ok','android','0.5.0'),true,'Opted-in client event persists');
select is(public.record_beta_client_event('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','app_session','app',10,1,'ok','android','0.5.0'),false,'Client event ID makes retry idempotent');
select ok(pg_temp.did_error($sql$select public.record_beta_client_event('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','raw_message_body','chat',10,1,'ok','android','0.5.0')$sql$),'Arbitrary event names cannot smuggle user content into telemetry');
select isnt(public.submit_beta_feedback('ux',4::smallint,'The deck feels clear.'),null::uuid,'User can submit bounded private beta feedback');
reset role;
select is((select count(*) from private.beta_feedback where user_id='f1111111-1111-4111-8111-111111111111'),1::bigint,'Feedback is stored privately');
select is((select count(*) from private.beta_client_events where user_id='f1111111-1111-4111-8111-111111111111'),1::bigint,'Exactly one diagnostic event exists after retry');

select set_config('request.jwt.claims','{"sub":"f2222222-2222-4222-8222-222222222222","role":"authenticated"}',true); set local role authenticated;
select ok(pg_temp.did_error($sql$select public.submit_beta_feedback('bug',3::smallint,'x')$sql$),'Feedback requires current legal/privacy acceptance');
select public.accept_legal_terms('2026-08-15','2026-08-15');
reset role;
select set_config('request.jwt.claims','{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}',true); set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.profiles(user_id,first_name,bio,gender,interests,onboarding_complete) values
('f1111111-1111-4111-8111-111111111111','Alpha','Alpha bio','woman',array['Coffee','Music'],false),
('f2222222-2222-4222-8222-222222222222','Beta','Beta bio','man',array['Coffee','Music'],false),
('f3333333-3333-4333-8333-333333333333','Gamma','Gamma bio','man',array['Coffee'],false);
insert into public.user_private(user_id,birth_date,location,location_updated_at) values
('f1111111-1111-4111-8111-111111111111','1992-01-01',extensions.st_setsrid(extensions.st_makepoint(9.190,48.890),4326)::extensions.geography,now()),
('f2222222-2222-4222-8222-222222222222','1991-01-01',extensions.st_setsrid(extensions.st_makepoint(9.190,49.025),4326)::extensions.geography,now()),
('f3333333-3333-4333-8333-333333333333','1990-01-01',extensions.st_setsrid(extensions.st_makepoint(9.190,48.935),4326)::extensions.geography,now());
insert into public.user_preferences(user_id,interested_in,min_age,max_age,max_distance_km) values
('f1111111-1111-4111-8111-111111111111',array['man'],18,60,100),
('f2222222-2222-4222-8222-222222222222',array['woman'],18,60,100),
('f3333333-3333-4333-8333-333333333333',array['woman'],18,60,100);
insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
('profile-media','f1111111-1111-4111-8111-111111111111/beta.webp','f1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":100}'::jsonb),
('profile-media','f2222222-2222-4222-8222-222222222222/beta.webp','f2222222-2222-4222-8222-222222222222','f2222222-2222-4222-8222-222222222222','{"mimetype":"image/webp","size":100}'::jsonb),
('profile-media','f3333333-3333-4333-8333-333333333333/beta.webp','f3333333-3333-4333-8333-333333333333','f3333333-3333-4333-8333-333333333333','{"mimetype":"image/webp","size":100}'::jsonb);
insert into public.profile_media(user_id,storage_path,position,width,height,byte_size,mime_type) values
('f1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111/beta.webp',0,1080,900,100,'image/webp'),
('f2222222-2222-4222-8222-222222222222','f2222222-2222-4222-8222-222222222222/beta.webp',0,1080,900,100,'image/webp'),
('f3333333-3333-4333-8333-333333333333','f3333333-3333-4333-8333-333333333333/beta.webp',0,1080,900,100,'image/webp');
update public.profile_media set moderation_status='approved',moderated_at=clock_timestamp();
update public.profiles set onboarding_complete=true;

select is((select count(*) from private.beta_server_events where event_name='onboarding_completed'),3::bigint,'Onboarding completion is captured from authoritative profile transitions');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name='discovery_impressions' and column_name in ('latitude','longitude','bio','photo','storage_path')),0::bigint,'Ranking telemetry stores no coordinates, bio or media path');

select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select count(*) from public.get_discovery_batch(20)),2::bigint,'Discovery returns two compatible candidates');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select candidate_count from private.discovery_batches where viewer_id='f1111111-1111-4111-8111-111111111111' order by created_at desc limit 1),2::smallint,'Discovery batch records candidate count and ranking variant');
select is((select position from private.discovery_impressions where viewer_id='f1111111-1111-4111-8111-111111111111' and candidate_id='f2222222-2222-4222-8222-222222222222' order by created_at desc limit 1),1::smallint,'Higher interest overlap ranks before a closer lower-overlap profile');
select is((select distance_bucket_km from private.discovery_impressions where viewer_id='f1111111-1111-4111-8111-111111111111' and candidate_id='f2222222-2222-4222-8222-222222222222' order by created_at desc limit 1),10::smallint,'Ranking telemetry coarsens distance to a 10 km bucket');

select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select matched from public.record_decision('f2222222-2222-4222-8222-222222222222','bind')),false,'First bind waits for reciprocal decision');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select decision from private.discovery_impressions where viewer_id='f1111111-1111-4111-8111-111111111111' and candidate_id='f2222222-2222-4222-8222-222222222222' order by created_at desc limit 1),'bind','Authoritative decision attaches to latest ranking impression');
select is((select count(*) from private.beta_server_events where event_name='decision_bind' and user_id='f1111111-1111-4111-8111-111111111111'),1::bigint,'Bind is captured from decision table trigger');

select set_config('request.jwt.claims','{"sub":"f2222222-2222-4222-8222-222222222222","role":"authenticated"}',true); set local role authenticated;
select * from public.get_discovery_batch(20);
select is((select matched from public.record_decision('f1111111-1111-4111-8111-111111111111','bind')),true,'Reciprocal bind creates match under Phase 5 instrumentation');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from private.beta_server_events where event_name='match_created'),2::bigint,'One match creates one per-member funnel event');

select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select public.send_message((select id from public.matches where 'f1111111-1111-4111-8111-111111111111'::uuid in (user_low,user_high) and 'f2222222-2222-4222-8222-222222222222'::uuid in (user_low,user_high)), '30000000-0000-4000-8000-000000000001','Hello beta');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from private.beta_server_events where event_name='first_message_sent'),1::bigint,'First message funnel event is server-authored exactly once');

select set_config('request.jwt.claims','{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select public.report_user(
  'f2222222-2222-4222-8222-222222222222',
  'other',
  'Beta report',
  (select id from public.matches where 'f1111111-1111-4111-8111-111111111111'::uuid in (user_low,user_high) and 'f2222222-2222-4222-8222-222222222222'::uuid in (user_low,user_high)),
  null,
  false
);
select is(public.set_beta_diagnostics(false),false,'User can opt out again');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*) from private.beta_client_events where user_id='f1111111-1111-4111-8111-111111111111'),0::bigint,'Opt-out immediately deletes optional client diagnostics');
select is((select count(*) from private.beta_server_events where event_name='report_submitted'),1::bigint,'Safety report funnel event remains authoritative and content-free');
select is((select matches from private.beta_daily_summary(1) limit 1),1::bigint,'Operator daily summary counts unique matches rather than per-member events');

select * from finish();
rollback;
