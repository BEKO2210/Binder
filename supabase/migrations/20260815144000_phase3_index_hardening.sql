begin;

create index if not exists match_read_state_user_id_idx
  on public.match_read_state (user_id);

create index if not exists report_context_match_id_idx
  on private.report_context (match_id)
  where match_id is not null;

create index if not exists report_context_message_id_idx
  on private.report_context (message_id)
  where message_id is not null;

create index if not exists push_outbox_match_id_idx
  on private.push_outbox (match_id);

create index if not exists push_outbox_message_id_idx
  on private.push_outbox (message_id)
  where message_id is not null;

commit;
