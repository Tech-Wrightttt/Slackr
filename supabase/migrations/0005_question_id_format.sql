-- SLACKR: accept every question ID format in shared playlists.
-- Run AFTER 0004_playlists_presence_admin.sql. Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
-- 0004 only allowed letters, digits and "_", but real IDs also use "-" and "." (2026S_FE-A_1, 2020A_FE_PM_7.1),
-- so saving those playlists failed. Same function, wider pattern.

create or replace function private.valid_question_ids(p_ids text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_ids) between 1 and 500
     and not exists (select 1 from unnest(p_ids) i where i !~ '^[A-Za-z0-9_.-]{3,48}$');
$$;

revoke all on function private.valid_question_ids(text[]) from public;
