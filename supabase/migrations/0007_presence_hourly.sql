-- SLACKR: tabs ping presence once an hour instead of every minute (fewer Vercel function calls).
-- Run AFTER 0006_presence_usernames.sql. Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
-- "Online" widens from the last 2 minutes to the last 65 minutes (one hourly ping plus slack), and
-- stale rows are kept for 2 hours. Closed tabs still drop out at once through presence_leave.

drop function if exists public.presence_ping(uuid);

create function public.presence_ping(p_client uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  names text[];
begin
  insert into public.presence (client_id, user_id, last_seen)
  values (p_client, auth.uid(), now())
  on conflict (client_id) do update set user_id = excluded.user_id, last_seen = excluded.last_seen;
  delete from public.presence p where p.last_seen < now() - interval '2 hours';

  select count(*) into total from public.presence p where p.last_seen > now() - interval '65 minutes';

  select coalesce(array_agg(u.username order by u.username), '{}') into names
  from (
    select distinct pr.username
    from public.presence p
    join public.profiles pr on pr.id = p.user_id
    where p.last_seen > now() - interval '65 minutes'
    order by pr.username
    limit 50
  ) u;

  return jsonb_build_object('online', total, 'users', to_jsonb(names));
end;
$$;

revoke all on function public.presence_ping(uuid) from public;
grant execute on function public.presence_ping(uuid) to anon, authenticated;

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
  where private.is_admin(p_key) and p.last_seen > now() - interval '65 minutes'
  order by pr.username nulls last, p.last_seen desc;
$$;
