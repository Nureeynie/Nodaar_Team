-- ============================================================
-- PHASE 2 (PRD): Daily core
-- daily_reports (late flag + exact time), leave_requests,
-- daily deadline setting, blockers view, nightly auto-0 job.
-- Run AFTER schema.v6.phase1.sql
-- ============================================================

-- ── Daily deadline (admin-set) on org_settings ─────────────
alter table public.org_settings add column if not exists daily_report_deadline time default '18:00:00';

-- ── DAILY REPORTS (PRD 6.4) ─────────────────────────────────
create table if not exists public.daily_reports (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  report_date   date not null,
  did_yesterday text,
  doing_today   text,
  blockers      text,
  evidence_url  text,                       -- URL only (PRD: no uploads)
  submitted_at  timestamptz default now(),
  is_late       boolean default false,
  late_minutes  int default 0,
  status        text default 'Submitted' check (status in ('Submitted','Approved','Rejected','Scored')),
  score         int check (score between 0 and 100),   -- manual, admin-entered only
  review_note   text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz default now(),
  unique (user_id, report_date)
);
create index if not exists daily_reports_user_date_idx on public.daily_reports(user_id, report_date desc);
create index if not exists daily_reports_status_idx on public.daily_reports(status);

-- ── LEAVE REQUESTS (PRD 6.7) ────────────────────────────────
create table if not exists public.leave_requests (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  start_date date not null,
  end_date   date not null,
  reason     text,
  status     text default 'Pending' check (status in ('Pending','Approved','Declined')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ── RLS ────────────────────────────────────────────────────
alter table public.daily_reports enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists "daily read own+admin" on public.daily_reports;
create policy "daily read own+admin" on public.daily_reports for select
  using (auth.uid() = user_id or public.is_admin_uid(auth.uid()));
drop policy if exists "daily insert own" on public.daily_reports;
create policy "daily insert own" on public.daily_reports for insert
  with check (auth.uid() = user_id);
drop policy if exists "daily update own-submitted" on public.daily_reports;
create policy "daily update own-submitted" on public.daily_reports for update
  using (auth.uid() = user_id and status in ('Submitted','Rejected'));
drop policy if exists "daily admin review" on public.daily_reports;
create policy "daily admin review" on public.daily_reports for update
  using (public.is_admin_uid(auth.uid()));

drop policy if exists "leave read own+admin" on public.leave_requests;
create policy "leave read own+admin" on public.leave_requests for select
  using (auth.uid() = user_id or public.is_admin_uid(auth.uid()));
drop policy if exists "leave insert own" on public.leave_requests;
create policy "leave insert own" on public.leave_requests for insert with check (auth.uid() = user_id);
drop policy if exists "leave admin decide" on public.leave_requests;
create policy "leave admin decide" on public.leave_requests for update using (public.is_admin_uid(auth.uid()));

-- ── BLOCKERS BOARD view (PRD 6.4) ───────────────────────────
create or replace view public.open_blockers as
  select r.id, r.user_id, p.full_name as member, r.report_date, r.blockers, r.status, r.submitted_at
  from public.daily_reports r join public.profiles p on p.id = r.user_id
  where r.blockers is not null and r.blockers <> '' and r.status in ('Submitted','Approved');

-- ── Nightly job: missed daily report = 0 (PRD 12.4) ────────
-- Requires pg_cron (Supabase: Database → Extensions → pg_cron).
-- Skips holidays/days-off (is_working_day=false) and approved leave.
create or replace function public.record_missed_daily_reports()
returns void language plpgsql security definer as $$
declare d date;
begin
  d := (now() at time zone 'Africa/Lagos')::date - 1;  -- yesterday
  if not public.is_working_day(d) then return; end if;
  insert into public.daily_reports (user_id, report_date, status, score, review_note)
  select p.id, d, 'Scored', 0, 'Missed — auto 0'
  from public.profiles p
  where p.active
    and not exists (select 1 from public.daily_reports r where r.user_id = p.id and r.report_date = d)
    and not exists (select 1 from public.leave_requests l
                    where l.user_id = p.id and l.status = 'Approved' and d between l.start_date and l.end_date)
  on conflict (user_id, report_date) do nothing;
end $$;

-- schedule nightly at 00:30 Lagos (pg_cron must be enabled):
-- select cron.schedule('nightly-missed-reports', '30 0 * * *', $$select public.record_missed_daily_reports()$$);
