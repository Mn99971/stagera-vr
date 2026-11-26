-- Stagera VR migration 0002: CV/interview context persistence, Q&A transcript,
-- AI feedback payload, and persistent headset <-> phone session link state.

alter table public.saved_setups
  add column if not exists interview_context jsonb default null;

alter table public.sessions
  add column if not exists venue text default 'lecture_hall',
  add column if not exists qa_transcript jsonb default '[]'::jsonb,
  add column if not exists ai_feedback jsonb default null;

create table if not exists public.pairing_session_links (
  code char(4) primary key,
  status text not null default 'paired'
    check (status in ('paired', 'in_session', 'generating_report', 'report_ready', 'ended')),
  setup_payload jsonb default null,
  report_payload jsonb default null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

alter table public.pairing_session_links enable row level security;

-- Public short-lived 4-digit pairing code access so an unauthenticated Quest browser
-- and the paired phone companion can synchronize session state & report handoff.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pairing_session_links'
      and policyname = 'Pairing links accessible by code'
  ) then
    create policy "Pairing links accessible by code"
      on public.pairing_session_links
      for all
      using (expires_at > now())
      with check (true);
  end if;
end $$;
