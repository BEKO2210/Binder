-- Seeing a stranger's profile needs a reason, not just the absence of a block.
--
-- `private.can_view_profile` asked four questions: are both accounts active,
-- have both accepted the current terms, has the target finished onboarding, and
-- is there no block in either direction. Everything else followed from that —
-- the profile row, the photos in storage, the attributes, the voice intro, the
-- rounded distance.
--
-- What it never asked was *why* this person may look. So anyone holding a user
-- id could keep reading that profile forever: after an unmatch (which sets a
-- status and creates no block), after the filters on either side stopped
-- matching, after the person moved to the other end of the country. A id that
-- was handed out once in a match stayed a key.
--
-- The reason is now part of the rule, and there are exactly three:
--
--   * it is you
--   * you are in a match with them, and it is still live
--   * they are a candidate for your deck right now — which is the same
--     `private.is_discovery_candidate` the deck itself is built from, so what
--     you may look at is what you could be shown
--
-- Blocks and suspensions keep working: `is_discovery_candidate` already refuses
-- them, and a match with a blocked person is ended by the block.
create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when target_user_id = auth.uid() then true
    else
      exists (
        select 1
        from public.matches m
        where m.status = 'active'
          and ((m.user_low = auth.uid() and m.user_high = target_user_id)
            or (m.user_high = auth.uid() and m.user_low = target_user_id))
      )
      or private.is_discovery_candidate(auth.uid(), target_user_id)
  end;
$$;

revoke all on function private.can_view_profile(uuid) from public, anon;
grant execute on function private.can_view_profile(uuid) to authenticated;
