begin;
create extension if not exists pgtap;

select plan(4);

select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into auth.users (
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  'f9111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'phase9-quiet-hours@binder.test',
  '{}',
  '{}',
  now(),
  now()
);

insert into public.legal_acceptances (user_id,terms_version,privacy_version)
values (
  'f9111111-1111-4111-8111-111111111111',
  private.current_terms_version(),
  private.current_privacy_version()
);

update public.notification_preferences
set quiet_hours_enabled = true,
    quiet_start = time '22:00',
    quiet_end = time '08:00',
    timezone = 'Europe/Berlin',
    product = true
where user_id = 'f9111111-1111-4111-8111-111111111111';

create or replace function pg_temp.push_gate(p_kind text,p_at timestamptz)
returns table (decision text,next_allowed_at timestamptz,reason text)
language sql
as $$
  select gate.decision,gate.next_allowed_at,gate.reason
  from private.evaluate_push_gate(
    'f9111111-1111-4111-8111-111111111111',
    p_kind,
    null,
    null,
    p_at
  ) gate;
$$;

select is(
  (select decision from pg_temp.push_gate('product_notice',timestamptz '2026-01-15 22:30:00+00')),
  'defer',
  '(a) An eligible notification inside quiet hours is deferred'
);

select is(
  (select decision from pg_temp.push_gate('safety_alert',timestamptz '2026-01-15 22:30:00+00')),
  'allow',
  '(b) A safety alert bypasses quiet hours'
);

select is(
  (select decision from pg_temp.push_gate('product_notice',timestamptz '2026-01-16 07:00:00+00')),
  'allow',
  '(c) Delivery is allowed at the local quiet-hours end boundary'
);

select is(
  (select decision from pg_temp.push_gate('product_notice',timestamptz '2026-01-15 21:30:00+00')),
  'defer',
  '(d) 21:30 UTC is quiet at 22:30 in the recipient Europe/Berlin timezone'
);

select * from finish();
rollback;
