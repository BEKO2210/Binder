-- A push token is a string Expo issued, and the database took any string.
--
-- The length was checked, sixteen to five hundred and twelve characters, and
-- nothing else. Anything in that range was accepted and queued for delivery,
-- where Expo rejects it and the delivery dead-letters — so the cost is a phone
-- that quietly registers rubbish and never hears anything again, and a queue
-- carrying rows that were never deliverable. Nobody else is harmed by it,
-- which is why it stayed: it is a self-inflicted denial of service and one
-- regular expression.
--
-- The constraint is added NOT VALID on purpose. Everything written from now on
-- has to look like a token; rows that already exist are left where they are,
-- because deleting somebody's registration to satisfy a new rule would silence
-- their phone without asking anybody. They fail at Expo as they always did,
-- and dead-letter with their reason.
begin;

alter table public.device_tokens
  drop constraint if exists device_tokens_expo_shape;

alter table public.device_tokens
  add constraint device_tokens_expo_shape
  check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9._%+-]+\]$')
  not valid;

commit;
