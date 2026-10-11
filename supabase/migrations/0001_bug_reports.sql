-- SLACKR bug reports and content flags.
-- Review, then run it yourself in Supabase: SQL Editor -> paste -> Run.
--
-- Access model:
--   * Anyone using the app (anon key) can INSERT a report. Nobody can read, change or delete
--     reports through the public API; there are no SELECT/UPDATE/DELETE policies for anon/authenticated.
--   * You (admin) read them in the Supabase dashboard (Table Editor), which uses the service role.

create table if not exists public.bug_reports (
  id          bigint generated always as identity primary key,
  client_id   uuid        not null unique,            -- generated on the device; makes retries safe
  kind        text        not null check (kind in ('question', 'explanation', 'general')),
  question_id text                 check (question_id is null or char_length(question_id) <= 64),
  category    text        not null check (char_length(category) <= 32),
  message     text        not null default '' check (char_length(message) <= 1000),
  context     jsonb       not null default '{}'::jsonb check (pg_column_size(context) <= 2048),
  created_at  timestamptz not null default now(),
  received_at timestamptz not null default now(),
  resolved    boolean     not null default false
);

create index if not exists bug_reports_question_idx on public.bug_reports (question_id) where question_id is not null;
create index if not exists bug_reports_open_idx on public.bug_reports (received_at desc) where not resolved;

alter table public.bug_reports enable row level security;

drop policy if exists "Anyone can submit a report" on public.bug_reports;
create policy "Anyone can submit a report"
  on public.bug_reports
  for insert
  to anon, authenticated
  with check (resolved = false);

-- Only INSERT is granted; the public API cannot read reports back.
revoke all on public.bug_reports from anon, authenticated;
grant insert (client_id, kind, question_id, category, message, context, created_at)
  on public.bug_reports to anon, authenticated;
