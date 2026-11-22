-- ============================================================
-- NODAAR TEAM HUB — v3.1 Meetings + Daily Task Updates
-- Run AFTER schema.improved.sql
-- Adds: meeting_participants (per-attendee scores) + task_updates (daily logs)
-- ============================================================

-- ─────────────────────────────────────────────
-- TABLE: meeting_participants (Per-attendee scoring)
-- present, contribution, understanding, stayed_till_close → overall %
-- ─────────────────────────────────────────────
create table if not exists public.meeting_participants (
  id                 uuid default uuid_generate_v4() primary key,
  meeting_id         uuid not null references public.meetings(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  present            boolean default true,
  present_pct        numeric default 100 check (present_pct >= 0 and present_pct <= 100),
  contribution       numeric default 0 check (contribution >= 0 and contribution <= 100),
  understanding      numeric default 0 check (understanding >= 0 and understanding <= 100),
  stayed_till_close  boolean default true,
  stayed_pct         numeric default 100 check (stayed_pct >= 0 and stayed_pct <= 100),
  overall_pct        numeric default 0, -- computed: avg of 4
  notes              text,
  scored_by          uuid references public.profiles(id) on delete set null,
  created_at         timestamptz default now(),
  unique(meeting_id, user_id)
);
create index if not exists meeting_participants_meeting_idx on public.meeting_participants (meeting_id);
create index if not exists meeting_participants_user_idx on public.meeting_participants (user_id);

-- Auto-compute overall_pct
create or replace function public.compute_meeting_score()
returns trigger language plpgsql as $$
begin
  -- If not present, overall is 0
  if new.present = false then
    new.overall_pct := 0;
  else
    new.overall_pct := round( (new.present_pct::numeric * 0.25 + new.contribution * 0.30 + new.understanding * 0.30 + new.stayed_pct * 0.15) );
    if new.overall_pct > 100 then new.overall_pct := 100; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_compute_meeting_score on public.meeting_participants;
create trigger trg_compute_meeting_score before insert or update on public.meeting_participants for each row execute procedure public.compute_meeting_score();

alter table public.meeting_participants enable row level security;
drop policy if exists "meeting_participants_select" on public.meeting_participants;
drop policy if exists "meeting_participants_write" on public.meeting_participants;
create policy "meeting_participants_select" on public.meeting_participants for select using (auth.role() = 'authenticated');
create policy "meeting_participants_write"  on public.meeting_participants for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: task_updates (Daily log per task)
-- Each user logs progress daily for assigned tasks
-- ─────────────────────────────────────────────
create table if not exists public.task_updates (
  id            uuid default uuid_generate_v4() primary key,
  task_id       uuid not null references public.tasks(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  update_date   date default current_date,
  progress_pct  numeric default 0 check (progress_pct >= 0 and progress_pct <= 100),
  hours         numeric default 0 check (hours >= 0 and hours <= 24),
  description   text not null,
  blockers      text default 'None',
  drive_link    text,
  mood          text default '👍 Good',
  created_at    timestamptz default now(),
  unique(task_id, user_id, update_date) -- one update per task per user per day
);
create index if not exists task_updates_task_idx on public.task_updates (task_id);
create index if not exists task_updates_user_date_idx on public.task_updates (user_id, update_date desc);
create index if not exists task_updates_date_idx on public.task_updates (update_date desc);

alter table public.task_updates enable row level security;
drop policy if exists "task_updates_select" on public.task_updates;
drop policy if exists "task_updates_insert_own" on public.task_updates;
drop policy if exists "task_updates_update_own" on public.task_updates;
create policy "task_updates_select" on public.task_updates for select using (auth.role() = 'authenticated');
create policy "task_updates_insert_own" on public.task_updates for insert with check (user_id = auth.uid());
create policy "task_updates_update_own" on public.task_updates for update using (user_id = auth.uid() or public.is_admin());

-- Helper: Get user's daily streak (days with at least one task_update)
create or replace function public.user_daily_streak(uid uuid)
returns int language sql as $$
  select count(*)::int from (
    select update_date from public.task_updates where user_id = uid
    group by update_date order by update_date desc
  ) s;
$$;

-- View: Task progress summary
create or replace view public.task_progress_summary as
select 
  t.id as task_id,
  t.title,
  t.status,
  count(u.id) as update_count,
  coalesce(avg(u.progress_pct),0) as avg_daily_progress,
  coalesce(sum(u.hours),0) as total_hours,
  max(u.update_date) as last_update
from public.tasks t
left join public.task_updates u on u.task_id = t.id
group by t.id, t.title, t.status;
