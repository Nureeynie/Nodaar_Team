-- ============================================================
-- NODAAR TEAM HUB — v3.3 Team Scoring & Member Evaluations
-- Run AFTER v5
-- ============================================================

-- ─────────────────────────────────────────────
-- TABLE: member_scores
-- Supports automatic activity scores + admin manual evaluations
-- ─────────────────────────────────────────────
create table if not exists public.member_scores (
  id                   uuid default uuid_generate_v4() primary key,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  mode                 text default 'auto' check (mode in ('auto', 'manual', 'blended')),
  manual_score         numeric default 80 check (manual_score >= 0 and manual_score <= 100),
  task_score           numeric default 80 check (task_score >= 0 and task_score <= 100),
  attendance_score     numeric default 80 check (attendance_score >= 0 and attendance_score <= 100),
  collaboration_score  numeric default 80 check (collaboration_score >= 0 and collaboration_score <= 100),
  leadership_score     numeric default 80 check (leadership_score >= 0 and leadership_score <= 100),
  admin_notes          text,
  scored_by            uuid references public.profiles(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique(user_id)
);

create index if not exists member_scores_user_idx on public.member_scores (user_id);

alter table public.member_scores enable row level security;

drop policy if exists "member_scores_select" on public.member_scores;
drop policy if exists "member_scores_admin" on public.member_scores;

-- All authenticated members can view scores
create policy "member_scores_select" on public.member_scores
  for select using (auth.role() = 'authenticated');

-- Only admins can insert/update/delete member scores
create policy "member_scores_admin" on public.member_scores
  for all using (public.is_admin());
