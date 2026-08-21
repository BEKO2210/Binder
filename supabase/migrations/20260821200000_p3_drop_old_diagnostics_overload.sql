-- Two functions with the same name, one argument apart, and PostgREST refuses
-- to guess.
--
-- The acknowledgement work added `p_include_acknowledged` with a default, which
-- looks harmless: old callers keep working. Over HTTP they do not. PostgREST
-- resolves a call by the argument names it is given, and `{p_limit: 50}` fits
-- both the old one-argument function and the new two-argument one. It answers
-- with "Could not choose the best candidate function" — which is what the
-- dashboard showed instead of the diagnostics list.
--
-- The old overload is dropped rather than kept for compatibility: there is one
-- caller, it ships from this repository, and an ambiguous API surface is worse
-- than a breaking change nobody outside can notice.
drop function if exists public.admin_diagnostics_client_errors(integer);

-- And the new one never had its default grant taken away. A function is
-- executable by PUBLIC unless somebody says otherwise; the permission check
-- inside would still have refused an anonymous caller, but a door that is
-- locked on the inside is not the same as a door that is closed.
revoke all on function public.admin_diagnostics_client_errors(integer,boolean) from public, anon;
grant execute on function public.admin_diagnostics_client_errors(integer,boolean) to authenticated;
