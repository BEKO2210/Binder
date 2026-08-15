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

select plan(45);

select has_table('public','notification_preferences','Notification preferences exist');
select has_table('private','push_deliveries','Private delivery ledger exists');
select has_column('public','device_tokens','installation_id','Device tokens have stable installation ownership');
select col_not_null('public','device_tokens','installation_id','Installation ownership is mandatory');
select has_function('public','register_push_token',array['text','text','uuid'],'Token registration requires an installation ID');
select has_function('public','claim_push_deliveries',array['uuid','integer'],'Dispatcher claims delivery rows through a service RPC');
select hasnt_column('private','push_outbox','body','Logical outbox never stores notification or message bodies');
select hasnt_column('private','push_deliveries','body','Delivery ledger never stores notification or message bodies');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('f7111111-1111-4111-8111-111111111111','authenticated','authenticated','phase7-a@binder.test','{}','{}',now(),now()),
('f7222222-2222-4222-8222-222222222222','authenticated','authenticated','phase7-b@binder.test','{}','{}',now(),now()),
('f7333333-3333-4333-8333-333333333333','authenticated','authenticated','phase7-c@binder.test','{}','{}',now(),now()),
('f7444444-4444-4444-8444-444444444444','authenticated','authenticated','phase7-d@binder.test','{}','{}',now(),now());

insert into public.legal_acceptances(user_id,terms_version,privacy_version) values
('f7111111-1111-4111-8111-111111111111','2026-08-15','2026-08-15'),
('f7222222-2222-4222-8222-222222222222','2026-08-15','2026-08-15'),
('f7333333-3333-4333-8333-333333333333','2026-08-15','2026-08-15'),
('f7444444-4444-4444-8444-444444444444','2026-08-15','2026-08-15');

select is((select count(*) from public.notification_preferences where user_id::text like 'f7%'),4::bigint,'New accounts receive server notification defaults');

select set_config('request.jwt.claims','{"sub":"f7222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.set_my_notification_preferences(true,true,true,true,true,false,true,true,true,time '22:00',time '08:00','Not/A_Timezone')$sql$),'Invalid timezones are rejected server-side');
reset role;

select is(
  (select decision from private.evaluate_push_gate('f7222222-2222-4222-8222-222222222222','new_message',null,null,timestamptz '2026-01-15 23:00:00+00')),
  'suppress',
  'A message without an active match is ineligible before quiet-hour evaluation'
);

update public.notification_preferences
set quiet_hours_enabled=true,quiet_start=time '22:00',quiet_end=time '08:00',timezone='UTC'
where user_id='f7222222-2222-4222-8222-222222222222';

insert into public.matches(id,user_low,user_high,status,created_at) values
('f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7222222-2222-4222-8222-222222222222','active',now());
delete from private.push_outbox;

select is(
  (select decision from private.evaluate_push_gate('f7222222-2222-4222-8222-222222222222','new_match','f7000000-0000-4000-8000-000000000001',null,timestamptz '2026-01-15 23:00:00+00')),
  'defer',
  'Overnight quiet hours defer eligible match push'
);
select is(
  (select next_allowed_at from private.evaluate_push_gate('f7222222-2222-4222-8222-222222222222','new_match','f7000000-0000-4000-8000-000000000001',null,timestamptz '2026-01-15 23:00:00+00')),
  timestamptz '2026-01-16 08:00:00+00',
  'Quiet-hours deferral ends at the exact local window boundary'
);
select is(
  (select decision from private.evaluate_push_gate('f7222222-2222-4222-8222-222222222222','safety_alert',null,null,timestamptz '2026-01-15 23:00:00+00')),
  'allow',
  'Safety alerts deliberately bypass quiet hours'
);

update public.notification_preferences set quiet_hours_enabled=false where user_id='f7222222-2222-4222-8222-222222222222';

select set_config('request.jwt.claims','{"sub":"f7222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
create temp table first_registration as
select public.register_push_token('ExponentPushToken[phase7-device-b-one]','android','f7b00000-0000-4000-8000-000000000001') as id;
reset role;
select ok((select id is not null from first_registration),'Authenticated registration returns a device row ID');
select is((select count(*) from public.device_tokens where user_id='f7222222-2222-4222-8222-222222222222' and enabled),1::bigint,'One enabled token belongs to account B');

select set_config('request.jwt.claims','{"sub":"f7222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[phase7-device-b-two]','android','f7b00000-0000-4000-8000-000000000001');
reset role;
select is((select count(*) from public.device_tokens where token='ExponentPushToken[phase7-device-b-one]'),0::bigint,'Token rotation removes the stale token row');
select is((select count(*) from public.device_tokens where installation_id='f7b00000-0000-4000-8000-000000000001'),1::bigint,'Token rotation keeps one installation row');

select set_config('request.jwt.claims','{"sub":"f7333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[phase7-device-b-two]','android','f7b00000-0000-4000-8000-000000000001');
reset role;
select is((select user_id from public.device_tokens where installation_id='f7b00000-0000-4000-8000-000000000001'),'f7333333-3333-4333-8333-333333333333'::uuid,'One installation can transfer atomically to a new signed-in account');
select is((select count(*) from public.device_tokens where user_id='f7222222-2222-4222-8222-222222222222' and enabled),0::bigint,'Transferred installation no longer notifies the prior account');

select set_config('request.jwt.claims','{"sub":"f7222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[phase7-device-b-two]','android','f7b00000-0000-4000-8000-000000000001');
reset role;

insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000101','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000201','SECRET MESSAGE CONTENT',now());

select is((select count(*) from private.push_outbox where kind='new_message' and message_id='f7000000-0000-4000-8000-000000000101'),1::bigint,'One message commit creates one logical outbox event');
insert into private.push_outbox(recipient_id,kind,match_id,message_id,dedupe_key)
values ('f7222222-2222-4222-8222-222222222222','new_message','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000101','f7000000-0000-4000-8000-000000000101')
on conflict (recipient_id,kind,dedupe_key) do nothing;
select is((select count(*) from private.push_outbox where kind='new_message' and message_id='f7000000-0000-4000-8000-000000000101'),1::bigint,'Retrying enqueue cannot duplicate the logical event');

create temp table first_claim as
select * from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000001',10);
select is((select count(*) from first_claim),1::bigint,'Dispatcher claims one delivery for one enabled device');
select is((select body from first_claim),'Open Binder to continue the conversation.','Message push uses generic lock-screen copy');
select ok((select position('SECRET' in body)=0 from first_claim),'Remote payload excludes message UGC');
select is((select attempts from private.push_deliveries where id=(select delivery_id from first_claim)),1::smallint,'First claim records exactly one send attempt');
select is((select count(*) from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000002',10)),0::bigint,'A claimed delivery cannot be concurrently claimed again');

select public.record_push_ticket((select delivery_id from first_claim),'f7d00000-0000-4000-8000-000000000001','phase7-ticket-ok',null,null,false);
select is((select status from private.push_deliveries where id=(select delivery_id from first_claim)),'ticketed','Successful Expo ticket enters receipt wait');
update private.push_deliveries set ticketed_at=now()-interval '20 seconds' where id=(select delivery_id from first_claim);
create temp table first_receipt_claim as select * from public.claim_push_receipts('f7d00000-0000-4000-8000-000000000001',10);
select is((select count(*) from first_receipt_claim),1::bigint,'Ticket becomes receipt-checkable after the wait boundary');
select public.record_push_receipt((select delivery_id from first_claim),'f7d00000-0000-4000-8000-000000000001',true,null,null,false);
select is((select status from private.push_deliveries where id=(select delivery_id from first_claim)),'delivered','Successful receipt finalizes the device delivery');
select is((select status from private.push_outbox where id=(select outbox_id from private.push_deliveries where id=(select delivery_id from first_claim))),'delivered','Delivered device finalizes logical outbox state');

delete from private.push_outbox;
update public.notification_preferences set messages=false where user_id='f7222222-2222-4222-8222-222222222222';
insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000102','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000202','disabled category',now());
select private.expand_push_outbox(10);
select is((select status from private.push_outbox where message_id='f7000000-0000-4000-8000-000000000102'),'suppressed','Message category toggle is enforced before device expansion');

delete from private.push_outbox;
update public.notification_preferences set messages=true where user_id='f7222222-2222-4222-8222-222222222222';
insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000103','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000203','late unmatch',now());
update public.matches set status='unmatched',ended_at=clock_timestamp() where id='f7000000-0000-4000-8000-000000000001';
select private.expand_push_outbox(10);
select is((select status from private.push_outbox where message_id='f7000000-0000-4000-8000-000000000103'),'suppressed','Unmatch after enqueue suppresses late push');

delete from private.push_outbox;
update public.matches set status='active',ended_at=null where id='f7000000-0000-4000-8000-000000000001';
insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000104','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000204','transfer after expansion',now());
select private.expand_push_outbox(10);
select set_config('request.jwt.claims','{"sub":"f7333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[phase7-device-b-two]','android','f7b00000-0000-4000-8000-000000000001');
reset role;
select is((select count(*) from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000003',10)),0::bigint,'Token ownership transfer prevents a stale delivery claim');
select is((select status from private.push_deliveries limit 1),'suppressed','Transferred-token delivery records an explicit suppression');

delete from private.push_outbox;
select set_config('request.jwt.claims','{"sub":"f7222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[phase7-device-b-two]','android','f7b00000-0000-4000-8000-000000000001');
reset role;
insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000105','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000205','retry path',now());
create temp table retry_claim as select * from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000004',10);
select public.record_push_ticket((select delivery_id from retry_claim),'f7d00000-0000-4000-8000-000000000004',null,'ExpoServerError','temporary',true);
select is((select status from private.push_deliveries where id=(select delivery_id from retry_claim)),'retry','Transient send error schedules retry');
select is((select attempts from private.push_deliveries where id=(select delivery_id from retry_claim)),1::smallint,'Retry reuses the original delivery row and attempt counter');
update private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=(select delivery_id from retry_claim);
create temp table retry_claim_two as select * from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000005',10);
select public.record_push_ticket((select delivery_id from retry_claim_two),'f7d00000-0000-4000-8000-000000000005',null,'InvalidCredentials','permanent',false);
select is((select status from private.push_deliveries where id=(select delivery_id from retry_claim)),'dead','Permanent failure enters dead-letter state');
select is((select status from private.push_outbox limit 1),'dead','All-dead deliveries finalize the logical outbox as dead');

delete from private.push_outbox;
insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000107','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000207','stale worker lease',now());
create temp table stale_claim as select * from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000007',10);
update private.push_deliveries set claimed_at=now()-interval '3 minutes' where id=(select delivery_id from stale_claim);
create temp table recovered_claim as select * from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000008',10);
select is((select delivery_id from recovered_claim),(select delivery_id from stale_claim),'Expired worker lease is reclaimed on the original delivery row');
select is((select attempts from private.push_deliveries where id=(select delivery_id from stale_claim)),2::smallint,'Recovered delivery increments the bounded attempt count exactly once');
select public.record_push_ticket((select delivery_id from recovered_claim),'f7d00000-0000-4000-8000-000000000008',null,'InvalidCredentials','permanent',false);

delete from private.push_outbox;
insert into public.messages(id,match_id,sender_id,client_message_id,body,created_at)
values ('f7000000-0000-4000-8000-000000000106','f7000000-0000-4000-8000-000000000001','f7111111-1111-4111-8111-111111111111','f7000000-0000-4000-8000-000000000206','invalid device',now());
create temp table invalid_claim as select * from public.claim_push_deliveries('f7d00000-0000-4000-8000-000000000006',10);
select public.record_push_ticket((select delivery_id from invalid_claim),'f7d00000-0000-4000-8000-000000000006',null,'DeviceNotRegistered','uninstalled',false);
select is((select status from private.push_deliveries where id=(select delivery_id from invalid_claim)),'dead','DeviceNotRegistered is a permanent delivery failure');
select is((select enabled from public.device_tokens where installation_id='f7b00000-0000-4000-8000-000000000001'),false,'DeviceNotRegistered disables the stale token automatically');

select ok(not has_function_privilege('anon','public.register_push_token(text,text,uuid)','execute'),'Anonymous clients cannot register push tokens');
select ok(not has_function_privilege('authenticated','public.claim_push_deliveries(uuid,integer)','execute'),'Authenticated clients cannot operate the dispatcher');

select * from finish();
rollback;
