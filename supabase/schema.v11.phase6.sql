-- ============================================================
-- PHASE 6 (PRD): Channels — unit-private + admin announcements,
-- notifications. Run AFTER schema.v10.phase5.sql
-- (channels/channel_members/channel_updates from v7 already exist)
-- ============================================================

-- ── Channel kinds: general | unit | announcements ──────────
alter table public.channels add column if not exists kind text default 'general'
  check (kind in ('general','unit','announcements'));
alter table public.channels add column if not exists unit_id uuid references public.units(id) on delete cascade;

-- ── Auto-create a private channel per unit (trigger) ───────
create or replace function public.create_unit_channel()
returns trigger language plpgsql security definer as $$
begin
  insert into public.channels (name, display_name, description, icon, is_private, kind, unit_id)
  values (
    'unit-' || new.name, '🏢 ' || new.name, 'Private channel for unit ' || new.name, '🏢', true, 'unit', new.id
  )
  on conflict (name) do nothing;
  -- add all current unit members
  insert into public.channel_members (channel_id, user_id)
  select c.id, m.user_id from public.channels c, public.unit_members m
  where c.unit_id = new.id and m.unit_id = new.id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists units_create_channel on public.units;
create trigger units_create_channel after insert on public.units
  for each row execute function public.create_unit_channel();

-- when a member joins a unit, add them to the unit channel
create or replace function public.add_member_to_unit_channel()
returns trigger language plpgsql security definer as $$
begin
  insert into public.channel_members (channel_id, user_id)
  select id, new.user_id from public.channels where unit_id = new.unit_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists unit_members_join_channel on public.unit_members;
create trigger unit_members_join_channel after insert on public.unit_members
  for each row execute function public.add_member_to_unit_channel();

-- ── Ensure announcements channel exists (admin-only posting) ─
insert into public.channels (name, display_name, description, icon, is_private, kind)
values ('announcements', '📢 Announcements', 'Admin-only company announcements', '📢', false, 'announcements')
on conflict (name) do update set kind = 'announcements';

-- ── Announcements: only admins can post ────────────────────
create or replace function public.announcements_admin_only()
returns trigger language plpgsql as $$
declare ch record;
begin
  select * into ch from public.channels where id = new.channel_id;
  if ch.kind = 'announcements' and not public.is_admin_uid(auth.uid()) then
    raise exception 'Only admins can post in #announcements';
  end if;
  return new;
end $$;
drop trigger if exists announcements_guard on public.channel_updates;
create trigger announcements_guard before insert on public.channel_updates
  for each row execute function public.announcements_admin_only();

-- unit channels: only unit members or admins can post
create or replace function public.unit_channel_guard()
returns trigger language plpgsql as $$
declare ch record;
begin
  select * into ch from public.channels where id = new.channel_id;
  if ch.kind = 'unit' and not public.is_admin_uid(auth.uid()) and not exists (
    select 1 from public.channel_members cm where cm.channel_id = new.channel_id and cm.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this unit channel';
  end if;
  return new;
end $$;
drop trigger if exists unit_channel_guard on public.channel_updates;
create trigger unit_channel_guard before insert on public.channel_updates
  for each row execute function public.unit_channel_guard();

-- ── NOTIFICATIONS (PRD 14) ──────────────────────────────────
create table if not exists public.notifications (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,  -- recipient
  type       text not null,                       -- mention, score, report_due, meeting, announcement, leave
  title      text not null,
  body       text,
  link_tab   text,                                -- tab to open
  read       boolean default false,
  created_at timestamptz default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, read, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notif read own" on public.notifications;
create policy "notif read own" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "notif insert self-or-admin" on public.notifications;
create policy "notif insert self-or-admin" on public.notifications for insert
  with check (auth.uid() = user_id or public.is_admin_uid(auth.uid()));
drop policy if exists "notif update own" on public.notifications;
create policy "notif update own" on public.notifications for update using (auth.uid() = user_id);
drop policy if exists "notif delete own" on public.notifications;
create policy "notif delete own" on public.notifications for delete using (auth.uid() = user_id);
