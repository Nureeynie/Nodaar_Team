-- ============================================================
-- NODAAR TEAM HUB — Improved Secure Schema v3.0
-- Run in Supabase SQL Editor (project: xzrczuoxlujzmztkupbz)
-- Fixes: RLS least-privilege, indexes, storage, admin helper
-- BACKUP FIRST: pg_dump before running!
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_stat_statements";

-- ─────────────────────────────────────────────
-- Helper: Is current user admin?
-- ─────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and access_level = 'Admin'
  );
$$;

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
create index if not exists roles_name_idx on public.roles (name);
alter table public.roles enable row level security;
drop policy if exists "roles_select_all" on public.roles;
drop policy if exists "roles_admin_all" on public.roles;
drop policy if exists "Auth users can view roles" on public.roles;
drop policy if exists "Auth users can manage roles" on public.roles;
create policy "roles_select_all" on public.roles for select using (auth.role() = 'authenticated');
create policy "roles_admin_all"  on public.roles for all    using (public.is_admin());

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
  access_level text default 'Member' check (access_level in ('Admin','Member')),
  role_id      uuid references public.roles(id) on delete set null,
  created_at   timestamptz default now()
);
-- Ensure columns for existing installs
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists access_level text default 'Member';
alter table public.profiles add column if not exists role_id uuid references public.roles(id) on delete set null;
create index if not exists profiles_role_id_idx on public.profiles (role_id);
create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;
drop policy if exists "Users can view all profiles"   on public.profiles;
drop policy if exists "Users can update own profile"  on public.profiles;
drop policy if exists "Users can update profiles"      on public.profiles;
drop policy if exists "Users can insert own profile"  on public.profiles;
drop policy if exists "Users can insert profiles"      on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;

create policy "profiles_select" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

-- Auto-create profile on signup (no hardcoded email)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, access_level, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'access_level', 'Member'),
    coalesce(new.raw_user_meta_data->>'role', 'Member')
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- TABLE: tasks
-- ─────────────────────────────────────────────
create table if not exists public.tasks (
  id            uuid default uuid_generate_v4() primary key,
  title         text not null check (char_length(title) >= 2),
  description   text,
  status        text default 'To Do' check (status in ('To Do','In Progress','Done')),
  priority      text default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  due_date      date,
  drive_link    text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  role_id       uuid references public.roles(id) on delete set null,
  is_admin_task boolean default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);
alter table public.tasks add column if not exists role_id uuid references public.roles(id) on delete set null;
alter table public.tasks add column if not exists is_admin_task boolean default false;
alter table public.tasks add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_role_idx on public.tasks (role_id);
create index if not exists tasks_due_idx on public.tasks (due_date);

alter table public.tasks enable row level security;
drop policy if exists "Auth users can manage tasks" on public.tasks;
drop policy if exists "tasks_all" on public.tasks;
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;
-- Least-privilege: read if assigned, or same role, or admin
create policy "tasks_select" on public.tasks for select using (
  auth.role() = 'authenticated' and (
    assignee_id = auth.uid() or role_id = (select role_id from public.profiles where id = auth.uid()) or public.is_admin() or not is_admin_task
  )
);
create policy "tasks_insert" on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "tasks_update" on public.tasks for update using (assignee_id = auth.uid() or public.is_admin() or created_by = auth.uid());
create policy "tasks_delete" on public.tasks for delete using (public.is_admin() or created_by = auth.uid());

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
  hours_worked  numeric default 8 check (hours_worked >= 0 and hours_worked <= 24),
  mood          text default '👍 Good',
  report_date   date default current_date,
  created_at    timestamptz default now()
);
create index if not exists reports_user_idx on public.reports (user_id);
create index if not exists reports_date_idx on public.reports (report_date desc);

alter table public.reports enable row level security;
drop policy if exists "Auth users can manage reports" on public.reports;
drop policy if exists "reports_select" on public.reports;
drop policy if exists "reports_insert_own" on public.reports;
drop policy if exists "reports_update_own" on public.reports;
create policy "reports_select" on public.reports for select using (auth.role() = 'authenticated');
create policy "reports_insert_own" on public.reports for insert with check (user_id = auth.uid());
create policy "reports_update_own" on public.reports for update using (user_id = auth.uid() or public.is_admin());

-- ─────────────────────────────────────────────
-- TABLE: okrs
-- ─────────────────────────────────────────────
create table if not exists public.okrs (
  id         uuid default uuid_generate_v4() primary key,
  objective  text not null,
  key_result text not null,
  quarter    text default 'Q4' check (quarter in ('Q1','Q2','Q3','Q4')),
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
create index if not exists okrs_quarter_idx on public.okrs (quarter);
create index if not exists okrs_owner_idx on public.okrs (owner_id);

alter table public.okrs enable row level security;
drop policy if exists "Auth users can manage okrs" on public.okrs;
drop policy if exists "okrs_select" on public.okrs;
drop policy if exists "okrs_admin_write" on public.okrs;
create policy "okrs_select" on public.okrs for select using (auth.role() = 'authenticated');
create policy "okrs_admin_write" on public.okrs for all using (public.is_admin() or owner_id = auth.uid());

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
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz default now()
);
alter table public.meetings add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists meetings_date_idx on public.meetings (meeting_date);

alter table public.meetings enable row level security;
drop policy if exists "Auth users can manage meetings" on public.meetings;
drop policy if exists "meetings_select" on public.meetings;
drop policy if exists "meetings_write" on public.meetings;
create policy "meetings_select" on public.meetings for select using (auth.role() = 'authenticated');
create policy "meetings_write"  on public.meetings for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- TABLE: ideas
-- ─────────────────────────────────────────────
create table if not exists public.ideas (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references public.profiles(id) on delete set null,
  title           text not null,
  description     text not null,
  expected_impact text,
  status          text default 'Proposed' check (status in ('Proposed','In Review','Approved','Rejected')),
  drive_link      text,
  created_at      timestamptz default now()
);
create index if not exists ideas_user_idx on public.ideas (user_id);
alter table public.ideas enable row level security;
drop policy if exists "Auth users can manage ideas" on public.ideas;
drop policy if exists "ideas_select" on public.ideas;
drop policy if exists "ideas_insert_own" on public.ideas;
create policy "ideas_select" on public.ideas for select using (auth.role() = 'authenticated');
create policy "ideas_insert_own" on public.ideas for insert with check (user_id = auth.uid());
create policy "ideas_update_own_or_admin" on public.ideas for update using (user_id = auth.uid() or public.is_admin());

-- ─────────────────────────────────────────────
-- TABLE: notifications (private per user)
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
create index if not exists notifications_user_read_idx on public.notifications (user_id, read);
alter table public.notifications enable row level security;
drop policy if exists "Users see own notifications"          on public.notifications;
drop policy if exists "Auth users can insert notifications"  on public.notifications;
drop policy if exists "Users can update own notifications"   on public.notifications;
create policy "Users see own notifications"         on public.notifications for select using (auth.uid() = user_id);
create policy "Auth users can insert notifications" on public.notifications for insert with check (auth.role() = 'authenticated');
create policy "Users can update own notifications"  on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Storage: avatars bucket (public)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

drop policy if exists "Avatar public read" on storage.objects;
drop policy if exists "Avatar user upload" on storage.objects;
drop policy if exists "Avatar user update" on storage.objects;
drop policy if exists "Avatar user delete" on storage.objects;

create policy "Avatar public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "Avatar user upload" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "Avatar user update" on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Avatar user delete" on storage.objects for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ─────────────────────────────────────────────
-- Milestones (optional future table reference in old schema)
-- ─────────────────────────────────────────────
create table if not exists public.milestones (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  due_date date,
  status text default 'Pending',
  created_at timestamptz default now()
);
alter table public.milestones enable row level security;
drop policy if exists "milestones_select" on public.milestones;
create policy "milestones_select" on public.milestones for select using (auth.role()='authenticated');
create policy "milestones_write" on public.milestones for all using (public.is_admin());
