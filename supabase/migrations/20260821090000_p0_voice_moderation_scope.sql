-- A moderator may hear a voice message when it is reported, and not before.
--
-- The public privacy policy says, in every language:
--
--   "Moderators can listen to a recording only when it has been reported or is
--    referenced by a message under review."
--
-- The rule the server enforced said something else. It allowed any moderator
-- with `review_media` to read any object that some `messages` row points at —
-- and every voice message creates exactly such a row. So the condition was
-- always true for every recording ever sent, reported or not. The comment above
-- it said the rule "mirrors the photo rule", and that is where it went wrong:
-- photos are moderated *before* anyone sees them, which is itself the promise
-- made about photos. Voice messages carry the opposite promise, and copying the
-- photo rule quietly broke it.
--
-- The rule below is the sentence from the policy, written as SQL:
--
--   reported            → a report whose context points at this exact message
--   under review        → a report about the conversation this message is in,
--                         with a moderation case still open or being reviewed
--
-- A closed case (actioned, dismissed) stops granting access, because a finished
-- review is not a review. Nothing else changes: the permission check stays, the
-- bucket stays, the reference guard stays.
create or replace function private.admin_can_read_voice_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_has_permission('review_media')
    and exists (
      select 1
      from public.messages msg
      join private.report_context rc
        on rc.message_id = msg.id
        or (
          rc.match_id = msg.match_id
          and exists (
            select 1
            from private.moderation_cases mc
            where mc.report_id = rc.report_id
              and mc.status in ('open', 'reviewing')
          )
        )
      where msg.audio_path = p_storage_path
    );
$$;

revoke all on function private.admin_can_read_voice_object(text) from public, anon;
grant execute on function private.admin_can_read_voice_object(text) to authenticated;
