-- Stagera VR initial schema (private by default with Row Level Security - NFR-06)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text check (role in ('student', 'lecturer', 'job_seeker', 'professional')),
  field text,
  practice_goals text[] default '{}',
  difficulties text[] default '{}',
  app_language text not null default 'en' check (app_language in ('en', 'fr')),
  keep_recordings boolean not null default true,
  auto_delete_30d boolean not null default false,
  captions_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  practice_type text not null check (practice_type in ('presentation', 'interview', 'pitch', 'panel')),
  venue text not null check (venue in ('classroom', 'lecture_hall', 'auditorium', 'interview_room', 'panel_room')),
  audience_behaviour text not null check (audience_behaviour in ('supportive', 'attentive', 'distracted', 'challenging')),
  interruption_level text not null check (interruption_level in ('none', 'low', 'medium', 'high')),
  follow_ups boolean not null default true,
  questions_at_end boolean not null default true,
  unexpected_questions boolean not null default false,
  time_limit_minutes integer not null default 15,
  one_min_warning boolean not null default true,
  coached_mode boolean not null default false,
  session_goals text[] default '{}',
  topics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pairing_codes (
  code char(4) primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  setup_id uuid references public.saved_setups(id) on delete set null,
  expires_at timestamptz not null,
  paired_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  setup_id uuid references public.saved_setups(id) on delete set null,
  title text not null,
  practice_type text not null,
  coached_mode boolean not null default false,
  hint_used boolean not null default false,
  duration_seconds integer not null default 0,
  wpm numeric(5,1),
  filler_count integer default 0,
  filler_breakdown jsonb default '{}'::jsonb,
  eye_contact_zones jsonb default '{"left":0,"centre":0,"right":0}'::jsonb,
  topics_covered integer default 0,
  topics_total integer default 0,
  transcript text,
  recommendations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.flagged_moments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  timestamp_seconds integer not null,
  moment_type text not null check (moment_type in ('question', 'skipped_slide', 'long_pause', 'pace_spike', 'hint_used', 'we_ownership')),
  label text not null,
  transcript_excerpt text,
  ai_tip text,
  recovery_successful boolean
);

alter table public.profiles enable row level security;
alter table public.saved_setups enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.sessions enable row level security;
alter table public.flagged_moments enable row level security;

create policy "Users manage own profile" on public.profiles for all using (auth.uid() = id);
create policy "Users manage own setups" on public.saved_setups for all using (auth.uid() = user_id);
create policy "Users manage own pairing codes" on public.pairing_codes for all using (auth.uid() = user_id);
create policy "Users manage own sessions" on public.sessions for all using (auth.uid() = user_id);
create policy "Users manage own flagged moments" on public.flagged_moments for all using (auth.uid() = user_id);
