-- SLACKR: show who is online by username on the dashboard.
-- Run AFTER 0005_question_id_format.sql. Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
-- presence_ping now returns the online count plus the usernames of signed-in people online
-- (one entry per person, however many tabs they have open, at most 50). Guests stay anonymous.
-- Usernames are already public handles; no email or id leaves the database.

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
  delete from public.presence p where p.last_seen < now() - interval '10 minutes';

  select count(*) into total from public.presence p where p.last_seen > now() - interval '2 minutes';

  select coalesce(array_agg(u.username order by u.username), '{}') into names
  from (
    select distinct pr.username
    from public.presence p
    join public.profiles pr on pr.id = p.user_id
    where p.last_seen > now() - interval '2 minutes'
    order by pr.username
    limit 50
  ) u;

  return jsonb_build_object('online', total, 'users', to_jsonb(names));
end;
$$;

revoke all on function public.presence_ping(uuid) from public;
grant execute on function public.presence_ping(uuid) to anon, authenticated;
