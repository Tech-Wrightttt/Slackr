-- SLACKR: sign in with a username on any device.
-- Run AFTER 0002_accounts_and_user_data.sql. Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
-- Supabase Auth signs in by email, so the backend needs a username's email. Exposing that lookup
-- to everyone holding the publishable key would leak every user's email, so it's gated by a secret
-- that only the FastAPI backend knows (env SUPABASE_LOGIN_LOOKUP_KEY).
--
-- After running this, read the generated secret once and put it in the backend environment:
--   select value from private.app_config where key = 'login_lookup_key';
-- Without it the app still works; people sign in with their email on new devices.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

-- 64 random hex characters (two v4 UUIDs, 244 random bits)
insert into private.app_config (key, value)
values ('login_lookup_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.email_for_login(p_username text, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_username)
    and coalesce(p_key, '') <> ''
    and p_key = (select c.value from private.app_config c where c.key = 'login_lookup_key');
$$;

revoke all on function public.email_for_login(text, text) from public;
grant execute on function public.email_for_login(text, text) to anon;
