-- ============================================================
-- PHASE 3 (PRD): Performance scoring engine
-- Score criteria w/ weights (30/20/25/15/10), weekly scores,
-- monthly rollup, locked periods (immutable once locked).
-- Run AFTER schema.v7.phase2.sql
-- ============================================================

-- ── SCORE CRITERIA (admin-defined, weighted) ────────────────
-- PRD weights: Quality 30, Output 20, Timeliness 25, Initiative 15, Communication 10
create table if not exists public.score_criteria (
  id       uuid default uuid_generate_v4() primary key,
  key      text unique not null,              -- 'quality','output','timeliness','initiative','communication'
  label    text not null,
  weight   int not null check (weight between 0 and 100),
  max_points int default 10,                 -- each criterion scored 0..max_points
  active   boolean default true
);
insert into public.score_criteria (key, label, weight, max_points) values
  ('quality',       'Quality of Work',        30, 10),
  ('output',        'Output / Volume',        20, 10),
  ('timeliness',    'Timeliness & Deadlines', 25, 10),
  ('initiative',    'Initiative',             15, 10),
  ('communication', 'Communication',          10, 10)
on conflict (key) do nothing;

-- ── PERIODS (admin sets months / weeks / dates) ─────────────
create table if not exists public.periods (
  id          uuid default uuid_generate_v4() primary key,
  type        text not null check (type in ('weekly','monthly')),
  label       text not null,                 -- e.g. '2026-W47' / '2026-11'
  start_date  date not null,
  end_date    date not null,
  locked      boolean default false,
  locked_by   uuid references public.profiles(id),
  locked_at   timestamptz,
  created_at  timestamptz default now(),
  unique (type, label)
);

-- ── WEEKLY SCORES (manual entry by admin; NO auto-suggest) ──
create table if not exists public.weekly_scores (
  id          uuid default uuid_generate_v4() primary key,
  period_id   uuid references public.periods(id) not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  criterion_scores jsonb not null,           -- {"quality":8,"output":7,...} each 0..10
  weighted_total numeric(5,2),               -- computed = sum(score/10 * weight) → 0..100
  manual_override numeric(5,2),              -- optional direct 0-100 by admin (audit-logged)
  note        text,
  scored_by   uuid references public.profiles(id),
  scored_at   timestamptz default now(),
  created_at  timestamptz default now(),
  unique (period_id, user_id)
);

-- ── MONTHLY ROLLUP (locked when month period locked) ───────
create table if not exists public.monthly_scores (
  id          uuid default uuid_generate_v4() primary key,
  period_id   uuid references public.periods(id) not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  weekly_avg  numeric(5,2),                  -- avg of weekly weighted totals
  final_score numeric(5,2),                  -- = weekly_avg (manual override allowed by admin)
  note        text,
  scored_by   uuid references public.profiles(id),
  scored_at   timestamptz default now(),
  unique (period_id, user_id)
);

-- ── Prevent edits to scores of a LOCKED period ─────────────
create or replace function public.prevent_locked_period_edit()
returns trigger language plpgsql as $$
declare p public.periods;
begin
  select * into p from public.periods where id = coalesce(new.period_id, old.period_id);
  if p.locked then
    raise exception 'Period % is locked — scores are immutable. Reopen requires admin + audit note.', p.label;
  end if;
  return new;
end $$;
drop trigger if exists weekly_scores_locked_guard on public.weekly_scores;
create trigger weekly_scores_locked_guard before insert or update on public.weekly_scores
  for each row execute function public.prevent_locked_period_edit();
drop trigger if exists monthly_scores_locked_guard on public.monthly_scores;
create trigger monthly_scores_locked_guard before insert or update on public.monthly_scores
  for each row execute function public.prevent_locked_period_edit();

-- ── Weighted score computation ──────────────────────────────
create or replace function public.compute_weighted_total(criterion_scores jsonb)
returns numeric language sql immutable as $$
  select coalesce(sum(
    (coalesce((criterion_scores->>c.key)::numeric, 0) / c.max_points) * c.weight
  ), 0)::numeric(5,2)
  from public.score_criteria c where c.active;
$$;

-- auto-fill weighted_total on insert/update
create or replace function public.set_weekly_weighted()
returns trigger language plpgsql as $$
begin
  new.weighted_total := public.compute_weighted_total(new.criterion_scores);
  return new;
end $$;
drop trigger if exists weekly_scores_calc on public.weekly_scores;
create trigger weekly_scores_calc before insert or update on public.weekly_scores
  for each row execute function public.set_weekly_weighted();

-- ── RLS ────────────────────────────────────────────────────
alter table public.score_criteria enable row level security;
alter table public.periods enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.monthly_scores enable row level security;

drop policy if exists "criteria read all" on public.score_criteria;
create policy "criteria read all" on public.score_criteria for select using (true);
drop policy if exists "criteria admin write" on public.score_criteria;
create policy "criteria admin write" on public.score_criteria for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "periods read all" on public.periods;
create policy "periods read all" on public.periods for select using (true);
drop policy if exists "periods admin write" on public.periods;
create policy "periods admin write" on public.periods for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

-- PRD 10.2: members see ONLY their own scores
drop policy if exists "weekly read own+admin" on public.weekly_scores;
create policy "weekly read own+admin" on public.weekly_scores for select
  using (auth.uid() = user_id or public.is_admin_uid(auth.uid()));
drop policy if exists "weekly admin write" on public.weekly_scores;
create policy "weekly admin write" on public.weekly_scores for insert
  with check (public.is_admin_uid(auth.uid()));
drop policy if exists "weekly admin update" on public.weekly_scores;
create policy "weekly admin update" on public.weekly_scores for update using (public.is_admin_uid(auth.uid()));

drop policy if exists "monthly read own+admin" on public.monthly_scores;
create policy "monthly read own+admin" on public.monthly_scores for select
  using (auth.uid() = user_id or public.is_admin_uid(auth.uid()));
drop policy if exists "monthly admin write" on public.monthly_scores;
create policy "monthly admin write" on public.monthly_scores for insert
  with check (public.is_admin_uid(auth.uid()));
drop policy if exists "monthly admin update" on public.monthly_scores;
create policy "monthly admin update" on public.monthly_scores for update using (public.is_admin_uid(auth.uid()));
