begin;

create or replace function public.get_my_matches()
returns table (
  match_id uuid,
  other_user_id uuid,
  first_name text,
  age integer,
  bio text,
  primary_photo_path text,
  matched_at timestamptz,
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select
      m.id,
      m.created_at,
      case when m.user_low = auth.uid() then m.user_high else m.user_low end as other_id
    from public.matches m
    where m.status = 'active'
      and auth.uid() in (m.user_low, m.user_high)
  )
  select
    mine.id,
    mine.other_id,
    p.first_name,
    extract(year from age(current_date, pr.birth_date))::integer,
    p.bio,
    media.storage_path,
    mine.created_at,
    left(last_message.body, 140),
    last_message.created_at,
    (
      select count(*)
      from public.messages unread
      where unread.match_id = mine.id
        and unread.sender_id <> auth.uid()
        and (read_state.last_read_at is null or unread.created_at > read_state.last_read_at)
    )
  from mine
  join public.profiles p on p.user_id = mine.other_id
  join public.user_private pr on pr.user_id = mine.other_id
  left join public.match_read_state read_state
    on read_state.match_id = mine.id and read_state.user_id = auth.uid()
  left join lateral (
    select pm.storage_path
    from public.profile_media pm
    where pm.user_id = mine.other_id and pm.position = 0
    limit 1
  ) media on true
  left join lateral (
    select msg.body, msg.created_at
    from public.messages msg
    where msg.match_id = mine.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) last_message on true
  order by coalesce(last_message.created_at, mine.created_at) desc, mine.id;
$$;

revoke all on function public.get_my_matches() from public, anon;
grant execute on function public.get_my_matches() to authenticated;

commit;
