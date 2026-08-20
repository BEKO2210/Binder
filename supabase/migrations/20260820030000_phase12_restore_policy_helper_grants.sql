-- Undo of the revoke in 20260820020000: those grants are load-bearing.
--
-- The review said an authenticated caller should not be able to ask
-- `private.is_account_active(<stranger>)` — true in principle, but RLS policies
-- are evaluated as the calling role, and the storage policies for profile media
-- call exactly these helpers. Taking EXECUTE away from `authenticated` made
-- every photo upload fail with
--
--   403 permission denied for function is_account_active
--
-- which the deletion integration test caught within the hour. The oracle it was
-- meant to close is behind another door anyway: `private` is not exposed
-- through PostgREST, so no client can call these directly. Documented here
-- rather than fixed by a revoke that breaks the app.
grant execute on function private.is_account_active(uuid) to authenticated;
grant execute on function private.has_current_legal_acceptance(uuid) to authenticated;
grant execute on function private.is_discovery_candidate(uuid, uuid) to authenticated;
