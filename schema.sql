-- ==============================================================================
-- NODAAR TEAM HUB — SUPABASE DATABASE SCHEMA (100% FREE TIER COMPATIBLE)
-- Run this script in the Supabase SQL Editor (supabase.com -> Project -> SQL Editor)
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. USERS & PROFILES TABLE
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text not null,
  role text default 'Member', -- Marketing, Sales, Developer, Content Creator, etc.
  access_level text default 'Member', -- 'Admin' or 'Member'
  avatar_url text,
  phone text,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. TASKS TABLE (With Google Drive File Link support)
create table if not exists public.tasks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  assignee_id uuid references public.profiles(id) on delete set null,
  priority text default 'Medium', -- 'Critical', 'High', 'Medium', 'Low'
  status text default 'To Do', -- 'To Do', 'In Progress', 'Blocked', 'Done'
  due_date date,
  drive_link text, -- Google Drive folder or file link
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone
);

-- 3. OKRS & GOALS TABLE
create table if not exists public.okrs (
  id uuid default uuid_generate_v4() primary key,
  quarter text not null, -- 'Q1', 'Q2', 'Q3', 'Q4'
  objective text not null,
  key_result text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  unit text default '%', -- '%', 'leads', 'revenue', etc.
  baseline numeric default 0,
  target numeric not null,
  current numeric default 0,
  drive_link text, -- Google Drive documentation/report link
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. DAILY / WEEKLY REPORTS (With Drive link & blockers)
create table if not exists public.reports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  report_date date default current_date not null,
  done_today text not null,
  plan_tomorrow text not null,
  blockers text,
  hours_worked numeric(4,1) default 8.0,
  mood text default 'Great', -- 'Great', 'Good', 'Neutral', 'Tired', 'Blocked'
  drive_link text, -- Google Drive proof-of-work link
  admin_comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. MEETINGS & DECISIONS
create table if not exists public.meetings (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  meeting_date date not null,
  start_time time not null,
  end_time time not null,
  agenda text,
  decisions text,
  meet_link text, -- Google Meet or Zoom link
  drive_notes_link text, -- Google Drive meeting notes document link
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. IDEAS & INNOVATION
create table if not exists public.ideas (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  expected_impact text,
  status text default 'Under Review', -- 'Under Review', 'Approved', 'Implemented', 'Rejected'
  drive_link text, -- Pitch deck or doc link in Google Drive
  admin_comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. MILESTONES
create table if not exists public.milestones (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  target_date date,
  status text default 'In Progress', -- 'Planned', 'In Progress', 'Achieved'
  drive_link text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — OPEN & SAFE FOR TEAM ACCESS
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.okrs enable row level security;
alter table public.reports enable row level security;
alter table public.meetings enable row level security;
alter table public.ideas enable row level security;
alter table public.milestones enable row level security;

-- Profiles: Authenticated users can read all profiles; users can update their own
create policy "Authenticated users can view profiles" on public.profiles for select using (auth.role() = 'authenticated');
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);

-- Tasks: Authenticated users can view all tasks; insert and update tasks
create policy "Authenticated users can view tasks" on public.tasks for select using (auth.role() = 'authenticated');
create policy "Authenticated users can create tasks" on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update tasks" on public.tasks for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete tasks" on public.tasks for delete using (auth.role() = 'authenticated');

-- OKRs
create policy "Authenticated users can view okrs" on public.okrs for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage okrs" on public.okrs for all using (auth.role() = 'authenticated');

-- Reports
create policy "Authenticated users can view reports" on public.reports for select using (auth.role() = 'authenticated');
create policy "Users can submit reports" on public.reports for insert with check (auth.role() = 'authenticated');
create policy "Users and admins can update reports" on public.reports for update using (auth.role() = 'authenticated');

-- Meetings
create policy "Authenticated users can view meetings" on public.meetings for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage meetings" on public.meetings for all using (auth.role() = 'authenticated');

-- Ideas
create policy "Authenticated users can view ideas" on public.ideas for select using (auth.role() = 'authenticated');
create policy "Users can submit ideas" on public.ideas for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update ideas" on public.ideas for update using (auth.role() = 'authenticated');

-- Milestones
create policy "Authenticated users can view milestones" on public.milestones for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage milestones" on public.milestones for all using (auth.role() = 'authenticated');

-- Auto-create profile trigger on Supabase Auth Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, access_level)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when new.email = 'nodaarltd@gmail.com' then 'Administrator' else coalesce(new.raw_user_meta_data->>'role', 'Team Member') end,
    case when new.email = 'nodaarltd@gmail.com' then 'Admin' else coalesce(new.raw_user_meta_data->>'access_level', 'Member') end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger execution
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
