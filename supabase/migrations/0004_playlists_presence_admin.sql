-- SLACKR: shared playlists, "online now" presence, and admin-edited public content.
-- Run AFTER 0003_username_sign_in.sql. Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
--   playlists       question sets shared by code. 'public' ones are listed for everyone,
--                   'unlisted' ones open only with their code. Featured = picked by the admin.
--   presence        one row per open app tab (a random client id), refreshed every minute
--   public_content  admin-edited JSON served to everyone (learning resources, analytical breakdowns)
--
-- Tables are closed to direct access; everything goes through the functions below, which the
-- FastAPI backend calls with the publishable key (plus the user's token when signed in).
-- Admin functions also need the admin key, a secret only the backend knows:
--   select value from private.app_config where key = 'admin_key';
-- Put it in the backend environment as SUPABASE_ADMIN_KEY. No service-role key is needed.

insert into private.app_config (key, value)
values ('admin_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function private.is_admin(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_key, '') <> ''
     and p_key = (select c.value from private.app_config c where c.key = 'admin_key');
$$;

-- ── Playlists ────────────────────────────────────────────────────────────────

create table if not exists public.playlists (
  -- 6 characters without look-alikes (no 0/O, 1/I/L)
  code         text primary key check (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  title        text not null check (char_length(btrim(title)) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 280),
  question_ids text[] not null check (cardinality(question_ids) between 1 and 500),
  visibility   text not null default 'public' check (visibility in ('public', 'unlisted')),
  featured     boolean not null default false,
  owner_id     uuid references auth.users (id) on delete cascade,
  owner_name   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists playlists_owner_idx on public.playlists (owner_id);
create index if not exists playlists_public_idx on public.playlists (featured desc, created_at desc) where visibility = 'public';

alter table public.playlists enable row level security;
revoke all on public.playlists from public, anon, authenticated;

create or replace function private.new_playlist_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 characters
  bytes bytea;
  v_code text;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, 1 + (get_byte(bytes, i) % 31), 1);
    end loop;
    exit when not exists (select 1 from public.playlists p where p.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function private.valid_question_ids(p_ids text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_ids) between 1 and 500
     and not exists (select 1 from unnest(p_ids) i where i !~ '^[A-Za-z0-9_.-]{3,48}$');
$$;

-- Signed-in users share their own sets. Returns the new code.
create or replace function public.create_playlist(p_title text, p_description text, p_ids text[], p_visibility text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_code text;
begin
  if uid is null then
    raise exception 'Sign in online to share a playlist.';
  end if;
  if not private.valid_question_ids(p_ids) then
    raise exception 'A playlist holds 1 to 500 questions.';
  end if;
  if (select count(*) from public.playlists p where p.owner_id = uid) >= 50 then
    raise exception 'You can share up to 50 playlists. Delete one first.';
  end if;
  new_code := private.new_playlist_code();
  insert into public.playlists (code, title, description, question_ids, visibility, owner_id, owner_name)
  values (
    new_code, btrim(p_title), coalesce(btrim(p_description), ''), p_ids, p_visibility, uid,
    (select pr.username from public.profiles pr where pr.id = uid)
  );
  return new_code;
end;
$$;

create or replace function public.delete_my_playlist(p_code text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.playlists p where p.code = upper(p_code) and p.owner_id = auth.uid() returning 1
  )
  select exists (select 1 from gone);
$$;

create or replace function public.playlist_by_code(p_code text)
returns table (code text, title text, description text, question_ids text[], visibility text, featured boolean,
               owner_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.title, p.description, p.question_ids, p.visibility, p.featured, p.owner_name, p.created_at
  from public.playlists p
  where p.code = upper(btrim(p_code));
$$;

-- The public list carries counts, not ids; opening one fetches it by code
create or replace function public.public_playlists(p_limit integer default 60)
returns table (code text, title text, description text, question_count integer, featured boolean,
               owner_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.title, p.description, cardinality(p.question_ids), p.featured, p.owner_name, p.created_at
  from public.playlists p
  where p.visibility = 'public'
  order by p.featured desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

create or replace function public.my_playlists()
returns table (code text, title text, question_count integer, visibility text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.title, cardinality(p.question_ids), p.visibility, p.created_at
  from public.playlists p
  where p.owner_id = auth.uid()
  order by p.created_at desc;
$$;

-- Admin: official playlists (no owner), feature/unfeature and remove anyone's
create or replace function public.admin_save_playlist(p_key text, p_code text, p_title text, p_description text,
                                                      p_ids text[], p_visibility text, p_featured boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text := upper(nullif(btrim(coalesce(p_code, '')), ''));
begin
  if not private.is_admin(p_key) then
    raise exception 'Admin only.';
  end if;
  if not private.valid_question_ids(p_ids) then
    raise exception 'A playlist holds 1 to 500 questions.';
  end if;
  if target is null then
    target := private.new_playlist_code();
    insert into public.playlists (code, title, description, question_ids, visibility, featured, owner_name)
    values (target, btrim(p_title), coalesce(btrim(p_description), ''), p_ids, p_visibility, p_featured, 'SLACKR');
  else
    update public.playlists p
    set title = btrim(p_title), description = coalesce(btrim(p_description), ''), question_ids = p_ids,
        visibility = p_visibility, featured = p_featured, updated_at = now()
    where p.code = target;
    if not found then
      raise exception 'No playlist with that code.' using errcode = 'P0002';
    end if;
  end if;
  return target;
end;
$$;

create or replace function public.admin_list_playlists(p_key text)
returns table (code text, title text, description text, question_ids text[], visibility text, featured boolean,
               owner_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.title, p.description, p.question_ids, p.visibility, p.featured, p.owner_name, p.created_at
  from public.playlists p
  where private.is_admin(p_key)
  order by p.featured desc, p.created_at desc;
$$;

create or replace function public.admin_delete_playlist(p_key text, p_code text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.playlists p where private.is_admin(p_key) and p.code = upper(p_code) returning 1
  )
  select exists (select 1 from gone);
$$;

-- ── Presence ("online now") ─────────────────────────────────────────────────

create table if not exists public.presence (
  client_id uuid primary key,
  user_id   uuid references auth.users (id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.presence enable row level security;
revoke all on public.presence from public, anon, authenticated;

-- Called every minute by each open tab. Returns how many are online (seen in the last 2 minutes).
create or replace function public.presence_ping(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.presence (client_id, user_id, last_seen)
  values (p_client, auth.uid(), now())
  on conflict (client_id) do update set user_id = excluded.user_id, last_seen = excluded.last_seen;
  delete from public.presence p where p.last_seen < now() - interval '10 minutes';
  select count(*) into n from public.presence p where p.last_seen > now() - interval '2 minutes';
  return n;
end;
$$;

create or replace function public.presence_leave(p_client uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.presence p where p.client_id = p_client;
$$;

-- Admin: who is online. Guests show without a name.
create or replace function public.admin_presence(p_key text)
returns table (username text, last_seen timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.username, p.last_seen
  from public.presence p
  left join public.profiles pr on pr.id = p.user_id
  where private.is_admin(p_key) and p.last_seen > now() - interval '2 minutes'
  order by pr.username nulls last, p.last_seen desc;
$$;

-- ── Public content edited by the admin ──────────────────────────────────────

create table if not exists public.public_content (
  key        text primary key check (key in ('learning_resources', 'analytical_breakdowns')),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint public_content_size check (pg_column_size(data) <= 2 * 1024 * 1024)
);

alter table public.public_content enable row level security;
revoke all on public.public_content from public, anon, authenticated;

create or replace function public.get_public_content(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.data from public.public_content c where c.key = p_key;
$$;

create or replace function public.admin_put_content(p_key text, p_content_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(p_key) then
    raise exception 'Admin only.';
  end if;
  insert into public.public_content (key, data, updated_at)
  values (p_content_key, p_data, now())
  on conflict (key) do update set data = excluded.data, updated_at = now();
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

revoke all on function private.is_admin(text) from public;
revoke all on function private.new_playlist_code() from public;
revoke all on function private.valid_question_ids(text[]) from public;

revoke all on function public.create_playlist(text, text, text[], text) from public;
revoke all on function public.delete_my_playlist(text) from public;
revoke all on function public.my_playlists() from public;
grant execute on function public.create_playlist(text, text, text[], text) to authenticated;
grant execute on function public.delete_my_playlist(text) to authenticated;
grant execute on function public.my_playlists() to authenticated;

revoke all on function public.playlist_by_code(text) from public;
revoke all on function public.public_playlists(integer) from public;
revoke all on function public.presence_ping(uuid) from public;
revoke all on function public.presence_leave(uuid) from public;
revoke all on function public.get_public_content(text) from public;
grant execute on function public.playlist_by_code(text) to anon, authenticated;
grant execute on function public.public_playlists(integer) to anon, authenticated;
grant execute on function public.presence_ping(uuid) to anon, authenticated;
grant execute on function public.presence_leave(uuid) to anon, authenticated;
grant execute on function public.get_public_content(text) to anon, authenticated;

revoke all on function public.admin_save_playlist(text, text, text, text, text[], text, boolean) from public;
revoke all on function public.admin_list_playlists(text) from public;
revoke all on function public.admin_delete_playlist(text, text) from public;
revoke all on function public.admin_presence(text) from public;
revoke all on function public.admin_put_content(text, text, jsonb) from public;
grant execute on function public.admin_save_playlist(text, text, text, text, text[], text, boolean) to anon;
grant execute on function public.admin_list_playlists(text) to anon;
grant execute on function public.admin_delete_playlist(text, text) to anon;
grant execute on function public.admin_presence(text) to anon;
grant execute on function public.admin_put_content(text, text, jsonb) to anon;
