-- ============================================================
-- NODAAR TEAM HUB — Full Database Schema v2.1
-- Run this in Supabase SQL Editor (project: xzrczuoxlujzmztkupbz)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- TABLE: roles
-- ─────────────────────────────────────────────
create table if not exists public.roles (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null unique,
  description text,
  color       text default '#FE8A03',
  created_at  timestamptz default now()
);
alter table public.roles enable row level security;
drop policy if exists "Auth users can view roles" on public.roles;
drop policy if exists "Auth users can manage roles" on public.roles;
create policy "Auth users can view roles"   on public.roles for select using (auth.role() = 'authenticated');
create policy "Auth users can manage roles" on public.roles for all    using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: profiles
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  email        text,
  full_name    text,
  role         text default 'Member',
  phone        text,
  avatar_url   text,
  access_level text default 'Member', -- 'Admin' or 'Member'
  role_id      uuid references public.roles(id) on delete set null,
  created_at   timestamptz default now()
);

-- Ensure columns exist if table was created previously
alter table public.profiles add column if not exists role_id uuid references public.roles(id) on delete set null;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists access_level text default 'Member';

alter table public.profiles enable row level security;
drop policy if exists "Users can view all profiles"   on public.profiles;
drop policy if exists "Users can update own profile"  on public.profiles;
drop policy if exists "Users can update profiles"      on public.profiles;
drop policy if exists "Users can insert own profile"  on public.profiles;
drop policy if exists "Users can insert profiles"      on public.profiles;

create policy "Users can view all profiles"  on public.profiles for select using (auth.role() = 'authenticated');
create policy "Users can update profiles"    on public.profiles for update using (auth.role() = 'authenticated');
create policy "Users can insert profiles"    on public.profiles for insert with check (auth.role() = 'authenticated');

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, access_level, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when new.email = 'nodaarltd@gmail.com' then 'Admin' else coalesce(new.raw_user_meta_data->>'access_level', 'Member') end,
    case when new.email = 'nodaarltd@gmail.com' then 'Founder / Admin' else coalesce(new.raw_user_meta_data->>'role', 'Member') end
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    access_level = case when excluded.email = 'nodaarltd@gmail.com' then 'Admin' else excluded.access_level end;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- TABLE: tasks
-- ─────────────────────────────────────────────
create table if not exists public.tasks (
  id            uuid default uuid_generate_v4() primary key,
  title         text not null,
  description   text,
  status        text default 'To Do',
  priority      text default 'Medium',
  due_date      date,
  drive_link    text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  role_id       uuid references public.roles(id) on delete set null,
  is_admin_task boolean default false,
  created_at    timestamptz default now()
);
alter table public.tasks add column if not exists role_id uuid references public.roles(id) on delete set null;
alter table public.tasks add column if not exists is_admin_task boolean default false;

alter table public.tasks enable row level security;
drop policy if exists "Auth users can manage tasks" on public.tasks;
create policy "Auth users can manage tasks" on public.tasks for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: reports (daily standups)
-- ─────────────────────────────────────────────
create table if not exists public.reports (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references public.profiles(id) on delete cascade,
  done_today    text not null,
  plan_tomorrow text not null,
  blockers      text default 'None',
  drive_link    text,
  hours_worked  numeric default 8,
  mood          text default '👍 Good',
  report_date   date default current_date,
  created_at    timestamptz default now()
);
alter table public.reports enable row level security;
drop policy if exists "Auth users can manage reports" on public.reports;
create policy "Auth users can manage reports" on public.reports for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: okrs (Quarterly goals with role support)
-- ─────────────────────────────────────────────
create table if not exists public.okrs (
  id         uuid default uuid_generate_v4() primary key,
  objective  text not null,
  key_result text not null,
  quarter    text default 'Q4',
  target     numeric default 100,
  current    numeric default 0,
  baseline   numeric default 0,
  unit       text default '%',
  drive_link text,
  owner_id   uuid references public.profiles(id) on delete set null,
  role_id    uuid references public.roles(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.okrs add column if not exists role_id uuid references public.roles(id) on delete set null;

alter table public.okrs enable row level security;
drop policy if exists "Auth users can manage okrs" on public.okrs;
create policy "Auth users can manage okrs" on public.okrs for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: meetings
-- ─────────────────────────────────────────────
create table if not exists public.meetings (
  id               uuid default uuid_generate_v4() primary key,
  title            text not null,
  meeting_date     date not null,
  start_time       time default '09:00',
  end_time         time default '10:00',
  meet_link        text,
  drive_notes_link text,
  agenda           text,
  created_at       timestamptz default now()
);
alter table public.meetings enable row level security;
drop policy if exists "Auth users can manage meetings" on public.meetings;
create policy "Auth users can manage meetings" on public.meetings for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: ideas
-- ─────────────────────────────────────────────
create table if not exists public.ideas (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references public.profiles(id) on delete set null,
  title           text not null,
  description     text not null,
  expected_impact text,
  status          text default 'Proposed',
  drive_link      text,
  created_at      timestamptz default now()
);
alter table public.ideas enable row level security;
drop policy if exists "Auth users can manage ideas" on public.ideas;
create policy "Auth users can manage ideas" on public.ideas for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: notifications
-- ─────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  title      text not null,
  message    text,
  type       text default 'info',
  read       boolean default false,
  link_tab   text,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
drop policy if exists "Users see own notifications"          on public.notifications;
drop policy if exists "Auth users can insert notifications"  on public.notifications;
drop policy if exists "Users can update own notifications"   on public.notifications;
create policy "Users see own notifications"         on public.notifications for select using (auth.uid() = user_id);
create policy "Auth users can insert notifications" on public.notifications for insert with check (auth.role() = 'authenticated');
create policy "Users can update own notifications"  on public.notifications for update using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Storage: avatars bucket (public)
-- ─────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
-- ON CONFLICT (id) DO NOTHING;
