-- ============================================================
-- NODAAR TEAM HUB — PHASE 8 (UI parity + legacy shape fixes)
-- Aligns the live schema with the redesigned admin/member UI and
-- repairs the legacy table shapes the PRD screens depend on.
-- Run AFTER schema.v12.notifications.sql
--
-- Applied live to xzrczuoxlujzmztkupbz in single-statement batches
-- (the Supabase connector rejects large multi-statement batches).
-- ============================================================

-- ── weekly_feedback: PRD 8.2 idea/problem shape ─────────────
alter table public.weekly_feedback add column if not exists title text;
alter table public.weekly_feedback add column if not exists section text;
alter table public.weekly_feedback add column if not exists severity text
  check (severity is null or severity in ('Low','Medium','High','Critical'));
alter table public.weekly_feedback add column if not exists score int
  check (score is null or (score between 0 and 100));
alter table public.weekly_feedback add column if not exists reviewed_by uuid
  references public.profiles(id);
alter table public.weekly_feedback add column if not exists reviewed_at timestamptz;

-- widen status to the PRD lifecycle:
-- Submitted / Approved / In progress / Implemented / Rejected
alter table public.weekly_feedback drop constraint if exists weekly_feedback_status_check;
alter table public.weekly_feedback add constraint weekly_feedback_status_check
  check (status in ('Open','Submitted','Approved','In progress','Implemented','Rejected','Reviewed','Resolved','Dismissed'));

alter table public.weekly_feedback alter column content drop not null;

-- ── tasks: evidence URL, PRD statuses, unit + OKR links ──────
alter table public.tasks add column if not exists evidence_url text;
alter table public.tasks add column if not exists unit_id uuid references public.units(id) on delete set null;
alter table public.tasks add column if not exists okr_id uuid references public.okrs(id) on delete set null;
alter table public.tasks add column if not exists key_result_id uuid references public.key_results(id) on delete set null;
alter table public.tasks add column if not exists extension_requested boolean default false;
alter table public.tasks add column if not exists extension_note text;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('To Do','To do','In Progress','In progress','In Review','In review','Done','Blocked'));

-- ── daily_reports: missed-report marker (auto 0) ────────────
alter table public.daily_reports add column if not exists missed_report boolean default false;
alter table public.daily_reports add column if not exists edited_by_admin boolean default false;

-- ── library_items: broken link + open counters ──────────────
alter table public.library_items add column if not exists broken_link boolean default false;
alter table public.library_items add column if not exists open_count int default 0;
alter table public.library_items add column if not exists last_broken_report_at timestamptz;
alter table public.library_items add column if not exists updated_at timestamptz default now();

-- ── task_updates: extension request type ────────────────────
alter table public.task_updates add column if not exists update_type text default 'progress';

-- ============================================================
-- LEGACY SHAPE FIXES
-- The pre-existing tables were created by an earlier schema with
-- different column shapes. These statements relax the NOT NULL
-- constraints and add the PRD datetime columns.
-- ============================================================

-- meetings: legacy shape was (meeting_date date, start_time time,
-- end_time time). The PRD needs one real datetime.
alter table public.meetings add column if not exists starts_at timestamptz;
alter table public.meetings add column if not exists ends_at timestamptz;
alter table public.meetings alter column meeting_date drop not null;
alter table public.meetings alter column start_time drop not null;
alter table public.meetings alter column end_time drop not null;

update public.meetings
   set starts_at = (meeting_date::text || ' ' || start_time::text)::timestamptz
 where starts_at is null and meeting_date is not null and start_time is not null;

-- okrs: legacy NOT NULL columns that the PRD shape does not use
alter table public.okrs alter column quarter drop not null;
alter table public.okrs alter column objective drop not null;
alter table public.okrs alter column key_result drop not null;
alter table public.okrs alter column target drop not null;

-- channel_updates: status was lowercase-only; the UI writes 'Published'
alter table public.channel_updates drop constraint if exists channel_updates_status_check;
alter table public.channel_updates add constraint channel_updates_status_check
  check (status in ('published','Published','draft','Draft','archived','Archived'));

-- ============================================================
-- RLS RECURSION FIX
-- channels_select referenced channel_members, whose policy
-- referenced channels -> "infinite recursion detected in policy".
-- Both now go through SECURITY DEFINER helpers that bypass RLS.
-- ============================================================

create or replace function public.is_channel_member(channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members cm
     where cm.channel_id = is_channel_member.channel_id
       and cm.user_id = auth.uid());
$$;

create or replace function public.is_public_channel(channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
     where c.id = is_public_channel.channel_id
       and c.is_private = false);
$$;

drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels for select
  using ((auth.role() = 'authenticated')
     and (is_private = false or is_admin() or public.is_channel_member(id)));

drop policy if exists "channel_members_select" on public.channel_members;
create policy "channel_members_select" on public.channel_members for select
  using ((auth.role() = 'authenticated')
     and (is_admin() or user_id = auth.uid() or public.is_public_channel(channel_id)));

-- ============================================================
-- ADMIN POLICIES for the columns and tables the admin screens write
-- ============================================================

create policy "weekly_feedback admin write" on public.weekly_feedback for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

create policy "tasks admin write" on public.tasks for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

create policy "daily admin insert" on public.daily_reports for insert
  with check (public.is_admin_uid(auth.uid()));

create policy "meeting_attendance read all" on public.meeting_attendance for select using (true);
create policy "meeting_attendance admin write" on public.meeting_attendance for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

create policy "leave admin insert" on public.leave_requests for insert
  with check (public.is_admin_uid(auth.uid()));

drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles" on public.profiles for select using (true);

-- ── helper: is this period locked? ──────────────────────────
create or replace function public.period_is_locked(period_id uuid)
returns boolean language sql stable as $$
  select coalesce((select locked from public.periods where id = period_id), false);
$$;

-- ============================================================
-- TRIGGER FIXES
-- sync_meeting_to_calendar() and trg_notify_meeting() both read the
-- legacy meeting_date + start_time columns and crashed on the PRD
-- shape. They now prefer starts_at / ends_at. The notification
-- trigger's emoji prefix was also removed.
-- ============================================================

create or replace function public.sync_meeting_to_calendar() returns trigger language plpgsql as $$
declare
  s timestamptz;
  e timestamptz;
begin
  s := coalesce(new.starts_at, (new.meeting_date::text || ' ' || new.start_time::text)::timestamptz);
  e := coalesce(new.ends_at,
                (new.meeting_date::text || ' ' || coalesce(new.end_time::text, new.start_time::text))::timestamptz,
                s);
  if tg_op = 'INSERT' then
    insert into public.calendar_events (title, description, start_at, end_at, location, drive_link, event_type, meeting_id, created_by)
    values (new.title, coalesce(new.agenda, new.description), s, e,
            coalesce(new.location, new.meet_link), new.drive_notes_link, 'meeting', new.id, auth.uid());
  elsif tg_op = 'UPDATE' then
    update public.calendar_events
       set title = new.title,
           description = coalesce(new.agenda, new.description),
           start_at = s, end_at = e,
           location = coalesce(new.location, new.meet_link),
           drive_link = new.drive_notes_link
     where meeting_id = new.id;
  elsif tg_op = 'DELETE' then
    delete from public.calendar_events where meeting_id = old.id;
    return old;
  end if;
  return new;
end; $$;

create or replace function public.trg_notify_meeting() returns trigger language plpgsql as $$
declare
  s timestamptz;
begin
  s := coalesce(new.starts_at, (new.meeting_date::text || ' ' || new.start_time::text)::timestamptz);
  if new.unit_id is null then
    insert into public.notifications (user_id, type, title, body, link_tab)
    select p.id, 'meeting', 'New meeting: ' || new.title,
           to_char(s at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI') || ' WAT', 'meetings'
      from public.profiles p where p.active;
  else
    insert into public.notifications (user_id, type, title, body, link_tab)
    select m.user_id, 'meeting', 'New meeting: ' || new.title,
           to_char(s at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI') || ' WAT', 'meetings'
      from public.unit_members m where m.unit_id = new.unit_id;
  end if;
  return new;
end; $$;
