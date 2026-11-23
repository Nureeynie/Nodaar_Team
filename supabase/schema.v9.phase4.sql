-- ============================================================
-- PHASE 4 (PRD): Meetings, weekly ideas/problems, leave
-- Run AFTER schema.v8.phase3.sql
-- ============================================================

-- ── MEETINGS (PRD 7) ──
-- meetings table may pre-exist from v4: add PRD columns if missing
alter table public.meetings add column if not exists description text;
alter table public.meetings add column if not exists location text;
alter table public.meetings add column if not exists organizer_id uuid references public.profiles(id);
alter table public.meetings add column if not exists unit_id uuid references public.units(id);
alter table public.meetings add column if not exists minutes text;
──────────────────────────────────────
create table if not exists public.meetings (
  id          uuid default uuid_generate_v4() primary key,
  title       text not null,
  description text,
  start_time  timestamptz not null,
  end_time    timestamptz,
  location    text,                          -- room or meeting link
  organizer_id uuid references public.profiles(id),
  unit_id     uuid references public.units(id),  -- null = everyone
  minutes     text,                          -- notes after the meeting
  created_at  timestamptz default now()
);
create index if not exists meetings_start_idx on public.meetings(start_time);

-- meeting attendance / per-member contribution score
create table if not exists public.meeting_attendance (
  id         uuid default uuid_generate_v4() primary key,
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  attended   boolean default false,
  note       text,
  unique (meeting_id, user_id)
);

-- ── WEEKLY IDEAS & PROBLEMS (PRD 8.2: 1 idea + 1 problem/week) ──
create table if not exists public.weekly_feedback (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  period_id  uuid references public.periods(id),   -- weekly period
  type       text not null check (type in ('idea','problem')),
  content    text not null,
  status     text default 'Open' check (status in ('Open','Reviewed','Resolved','Dismissed')),
  admin_note text,
  created_at timestamptz default now(),
  unique (user_id, period_id, type)               -- exactly 1 idea + 1 problem per week
);

-- ── RLS ────────────────────────────────────────────────────
alter table public.meetings enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.weekly_feedback enable row level security;

drop policy if exists "meetings read" on public.meetings;
create policy "meetings read" on public.meetings for select using (
  unit_id is null or public.is_admin_uid(auth.uid())
  or exists (select 1 from public.unit_members m where m.unit_id = meetings.unit_id and m.user_id = auth.uid())
);
drop policy if exists "meetings admin write" on public.meetings;
create policy "meetings admin write" on public.meetings for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "attendance read" on public.meeting_attendance;
create policy "attendance read" on public.meeting_attendance for select using (
  auth.uid() = user_id or public.is_admin_uid(auth.uid())
  or exists (select 1 from public.meetings mt join public.unit_members m on m.unit_id = mt.unit_id
             where mt.id = meeting_attendance.meeting_id and m.user_id = auth.uid())
);
drop policy if exists "attendance admin write" on public.meeting_attendance;
create policy "attendance admin write" on public.meeting_attendance for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "feedback read own+admin" on public.weekly_feedback;
create policy "feedback read own+admin" on public.weekly_feedback for select
  using (auth.uid() = user_id or public.is_admin_uid(auth.uid()));
drop policy if exists "feedback insert own" on public.weekly_feedback;
create policy "feedback insert own" on public.weekly_feedback for insert with check (auth.uid() = user_id);
drop policy if exists "feedback update own-open" on public.weekly_feedback;
create policy "feedback update own-open" on public.weekly_feedback for update
  using (auth.uid() = user_id and status = 'Open');
drop policy if exists "feedback admin update" on public.weekly_feedback;
create policy "feedback admin update" on public.weekly_feedback for update using (public.is_admin_uid(auth.uid()));
