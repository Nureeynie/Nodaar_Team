-- ============================================================
-- PHASE 7: automatic notifications on PRD events (applied live)
-- ============================================================
create or replace function public.notify_user(uid uuid, ntype text, ntitle text, nbody text, ntab text)
returns void language plpgsql security definer as $$
begin
  insert into public.notifications (user_id, type, title, body, link_tab)
  values (uid, ntype, ntitle, nbody, ntab);
end $$;

create or replace function public.trg_notify_score()
returns trigger language plpgsql security definer as $$
declare p public.periods;
begin
  select * into p from public.periods where id = new.period_id;
  perform public.notify_user(new.user_id, 'score', 'New weekly score: ' || coalesce(new.manual_override, new.weighted_total)::text || '/100',
    'Period ' || p.label || case when new.note is not null then ' — ' || new.note else '' end, 'scores');
  return new;
end $$;
drop trigger if exists trg_notify_score on public.weekly_scores;
create trigger trg_notify_score after insert or update on public.weekly_scores
  for each row execute function public.trg_notify_score();

create or replace function public.trg_notify_report_review()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'UPDATE' and new.status <> old.status and new.status in ('Approved','Rejected','Scored') then
    perform public.notify_user(new.user_id, 'report', 'Daily report ' || new.status || ' (' || new.report_date::text || ')', new.review_note, 'reports');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_report_review on public.daily_reports;
create trigger trg_notify_report_review after update on public.daily_reports
  for each row execute function public.trg_notify_report_review();

create or replace function public.trg_notify_leave()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'UPDATE' and new.status <> old.status and new.status in ('Approved','Declined') then
    perform public.notify_user(new.user_id, 'leave', 'Leave request ' || new.status, new.start_date::text || ' → ' || new.end_date::text, 'leave');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_leave on public.leave_requests;
create trigger trg_notify_leave after update on public.leave_requests
  for each row execute function public.trg_notify_leave();

create or replace function public.trg_notify_announcement()
returns trigger language plpgsql security definer as $$
declare ch record;
begin
  select * into ch from public.channels where id = new.channel_id;
  if ch.kind = 'announcements' then
    insert into public.notifications (user_id, type, title, body, link_tab)
    select p.id, 'announcement', '📢 ' || coalesce(left(coalesce(new.title, new.body, ''), 80), 'New announcement'), null, 'channels'
    from public.profiles p where p.active;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_announcement on public.channel_updates;
create trigger trg_notify_announcement after insert on public.channel_updates
  for each row execute function public.trg_notify_announcement();

create or replace function public.trg_notify_meeting()
returns trigger language plpgsql security definer as $$
begin
  if new.unit_id is null then
    insert into public.notifications (user_id, type, title, body, link_tab)
    select p.id, 'meeting', '📅 ' || new.title, to_char(new.start_time at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI') || ' WAT', 'meetings'
    from public.profiles p where p.active;
  else
    insert into public.notifications (user_id, type, title, body, link_tab)
    select m.user_id, 'meeting', '📅 ' || new.title, to_char(new.start_time at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI') || ' WAT', 'meetings'
    from public.unit_members m where m.unit_id = new.unit_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_meeting on public.meetings;
create trigger trg_notify_meeting after insert on public.meetings
  for each row execute function public.trg_notify_meeting();
