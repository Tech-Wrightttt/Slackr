-- SLACKR online accounts + per-user backup.
-- Run AFTER 0001_bug_reports.sql. Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
-- Storage model (kept deliberately small):
--   profiles   one row per account: the username shown in the app
--   user_data  one row per account: the same JSON backup the app already exports
--              (attempts, SRS schedules, settings, bookmarks, deferred, sessions)
--   bug_reports (0001) gains an optional user_id, filled by the server, never by the client
--
-- Every user can only see and change their own rows (row-level security on auth.uid()).
-- The browser only ever uses the public anon/publishable key. No service-role key is needed.

-- ── Profiles ─────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

revoke all on public.profiles from anon;
grant select, update (username) on public.profiles to authenticated;

-- Create the profile when someone signs up. The app passes the username as sign-up metadata:
--   supabase.auth.signUp({ email, password, options: { data: { username } } })
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up form say "username taken" before submitting, without exposing other profiles
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- ── Per-user backup (the "online copy" of the local JSON) ───────────────────

create table if not exists public.user_data (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  data           jsonb not null,
  schema_version integer not null default 1,
  updated_at     timestamptz not null default now(),
  -- Keeps the database small: a heavy user's backup is ~1-2 MB; 5 MB leaves room for years of use
  constraint user_data_size check (pg_column_size(data) <= 5 * 1024 * 1024)
);

alter table public.user_data enable row level security;

drop policy if exists "Read own data" on public.user_data;
create policy "Read own data" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Insert own data" on public.user_data;
create policy "Insert own data" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own data" on public.user_data;
create policy "Update own data" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own data" on public.user_data;
create policy "Delete own data" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

-- updated_at is set by the server so devices can't fake "newer"
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before insert or update on public.user_data
  for each row execute function public.touch_updated_at();

-- ── Bug reports: remember who sent it when they were signed in ──────────────

alter table public.bug_reports
  add column if not exists user_id uuid default auth.uid() references auth.users (id) on delete set null;

-- user_id is not in the insert grant from 0001, so the column default (the real caller) always applies
