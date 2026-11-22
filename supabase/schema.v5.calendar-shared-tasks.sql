-- ============================================================
-- NODAAR TEAM HUB — v3.2 Mon-Sat 10am-4pm + Calendar + Shared Tasks
-- Run AFTER v4
-- ============================================================

-- ─────────────────────────────────────────────
-- TABLE: org_settings (work schedule for 10-member team)
-- ─────────────────────────────────────────────
create table if not exists public.org_settings (
  id           uuid default uuid_generate_v4() primary key,
  work_days    text[] default array['Mon','Tue','Wed','Thu','Fri','Sat'], -- Mon-Sat
  work_start   time default '10:00',
  work_end     time default '16:00',
  timezone     text default 'Africa/Lagos',
  max_members  int default 10,
  created_at   timestamptz default now()
);
insert into public.org_settings (work_days, work_start, work_end, timezone, max_members)
values (array['Mon','Tue','Wed','Thu','Fri','Sat'], '10:00','16:00','Africa/Lagos',10)
on conflict do nothing;
alter table public.org_settings enable row level security;
drop policy if exists "org_settings_select" on public.org_settings;
create policy "org_settings_select" on public.org_settings for select using (auth.role()='authenticated');
drop policy if exists "org_settings_admin" on public.org_settings;
create policy "org_settings_admin" on public.org_settings for all using (public.is_admin());

-- Helper: Is working day (Mon-Sat 10-4, Lagos time)
create or replace function public.is_working_day(d date)
returns boolean language sql as $$
  select extract(dow from d)::int between 1 and 6; -- 1=Mon .. 6=Sat, 0=Sun
$$;

-- ─────────────────────────────────────────────
-- TABLE: task_assignees (Many members can share a task)
-- Migrate existing single assignee to this table
-- ─────────────────────────────────────────────
create table if not exists public.task_assignees (
  task_id  uuid not null references public.tasks(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz default now(),
  primary key (task_id, user_id)
);
create index if not exists task_assignees_task_idx on public.task_assignees (task_id);
create index if not exists task_assignees_user_idx on public.task_assignees (user_id);

-- Backfill from existing tasks.assignee_id
insert into public.task_assignees (task_id, user_id)
select id, assignee_id from public.tasks where assignee_id is not null
on conflict do nothing;

alter table public.task_assignees enable row level security;
drop policy if exists "task_assignees_select" on public.task_assignees;
drop policy if exists "task_assignees_write" on public.task_assignees;
create policy "task_assignees_select" on public.task_assignees for select using (auth.role()='authenticated');
create policy "task_assignees_write"  on public.task_assignees for all using (auth.role()='authenticated');

-- View: tasks with assignee list + working hours check
create or replace view public.tasks_with_assignees as
select 
  t.*,
  (select json_agg(json_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url))
   from public.task_assignees ta join public.profiles p on p.id=ta.user_id where ta.task_id=t.id) as assignees,
  (select count(*) from public.task_assignees where task_id=t.id) as assignee_count
from public.tasks t;

-- ─────────────────────────────────────────────
-- TABLE: calendar_events (Teams-like calendar)
-- Meetings auto-sync here; also supports custom events
-- ─────────────────────────────────────────────
create table if not exists public.calendar_events (
  id          uuid default uuid_generate_v4() primary key,
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  location    text, -- Meet link or room
  drive_link  text,
  event_type  text default 'meeting' check (event_type in ('meeting','task_deadline','work_hours','holiday','custom')),
  meeting_id  uuid references public.meetings(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now(),
  check (end_at > start_at)
);
create index if not exists calendar_events_start_idx on public.calendar_events (start_at);
create index if not exists calendar_events_type_idx on public.calendar_events (event_type);

-- Auto-create calendar event when meeting is created
create or replace function public.sync_meeting_to_calendar()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.calendar_events (title, description, start_at, end_at, location, drive_link, event_type, meeting_id, created_by)
    values (
      new.title, new.agenda,
      (new.meeting_date || ' ' || new.start_time)::timestamptz,
      (new.meeting_date || ' ' || new.end_time)::timestamptz,
      new.meet_link, new.drive_notes_link, 'meeting', new.id, auth.uid()
    );
  elsif tg_op = 'UPDATE' then
    update public.calendar_events set title=new.title, description=new.agenda, start_at=(new.meeting_date || ' ' || new.start_time)::timestamptz, end_at=(new.meeting_date || ' ' || new.end_time)::timestamptz, location=new.meet_link, drive_link=new.drive_notes_link where meeting_id=new.id;
  elsif tg_op = 'DELETE' then
    delete from public.calendar_events where meeting_id=old.id;
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_meeting_calendar_sync on public.meetings;
create trigger trg_meeting_calendar_sync after insert or update or delete on public.meetings for each row execute procedure public.sync_meeting_to_calendar();

-- Backfill existing meetings to calendar
insert into public.calendar_events (title, description, start_at, end_at, location, drive_link, event_type, meeting_id)
select title, agenda, (meeting_date || ' ' || start_time)::timestamptz, (meeting_date || ' ' || end_time)::timestamptz, meet_link, drive_notes_link, 'meeting', id from public.meetings
on conflict do nothing;

alter table public.calendar_events enable row level security;
drop policy if exists "calendar_select" on public.calendar_events;
drop policy if exists "calendar_write" on public.calendar_events;
create policy "calendar_select" on public.calendar_events for select using (auth.role()='authenticated');
create policy "calendar_write"  on public.calendar_events for all using (auth.role()='authenticated');

-- ─────────────────────────────────────────────
-- Enforce 10-member limit (trigger)
-- ─────────────────────────────────────────────
create or replace function public.enforce_team_limit()
returns trigger language plpgsql as $$
declare cnt int;
begin
  select count(*) into cnt from public.profiles;
  if cnt >= 10 and tg_op='INSERT' then
    raise exception 'Team limit reached (10 members). Remove a member first.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_team_limit on public.profiles;
create trigger trg_team_limit before insert on public.profiles for each row execute procedure public.enforce_team_limit();
