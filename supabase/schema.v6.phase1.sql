-- helper: admin check by uid (wraps existing is_admin())
create or replace function public.is_admin_uid(uid uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.access_level = 'Admin');
$$;

-- ============================================================
-- NODAAR TEAM HUB — PHASE 1 (PRD): Foundation
-- units, positions, multi-unit membership, account hardening
-- (must_change_password, active), audit_log, last-admin guard.
-- Run AFTER schema.improved.sql, v4, v5.
-- ============================================================

-- ── Account hardening on profiles ──────────────────────────
alter table public.profiles add column if not exists must_change_password boolean default true;
alter table public.profiles add column if not exists active boolean default true;
-- existing users are grandfathered as active, no forced change
update public.profiles set active = true where active is null;

-- ── UNITS ──────────────────────────────────────────────────
create table if not exists public.units (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null unique,
  description text,
  lead_id     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz default now()
);

-- ── POSITIONS (reusable unit role titles) ─────────────────
create table if not exists public.positions (
  id     uuid default uuid_generate_v4() primary key,
  title  text not null unique,
  created_at timestamptz default now()
);

-- ── UNIT MEMBERSHIP (many-to-many, role per membership) ────
create table if not exists public.unit_members (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  unit_id    uuid references public.units(id) on delete cascade not null,
  position_id uuid references public.positions(id) on delete set null,
  joined_at  timestamptz default now(),
  unique (user_id, unit_id)
);
create index if not exists unit_members_user_idx on public.unit_members(user_id);
create index if not exists unit_members_unit_idx on public.unit_members(unit_id);

-- ── AUDIT LOG (PRD 7.8) ────────────────────────────────────
create table if not exists public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.profiles(id),
  action     text not null,
  target     text,
  old_value  text,
  new_value  text,
  created_at timestamptz default now()
);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

-- ── RLS ────────────────────────────────────────────────────
alter table public.units enable row level security;
alter table public.positions enable row level security;
alter table public.unit_members enable row level security;
alter table public.audit_log enable row level security;

-- helper: current user is admin (adjust to your is_admin() if defined)
create or replace function public.is_admin_uid(uid uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.access_level = 'Admin');
$$;

drop policy if exists "units read" on public.units;
create policy "units read" on public.units for select using (true);
drop policy if exists "units admin write" on public.units;
create policy "units admin write" on public.units for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "positions read" on public.positions;
create policy "positions read" on public.positions for select using (true);
drop policy if exists "positions admin write" on public.positions;
create policy "positions admin write" on public.positions for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "unit_members read" on public.unit_members;
create policy "unit_members read" on public.unit_members for select using (true);
drop policy if exists "unit_members admin write" on public.unit_members;
create policy "unit_members admin write" on public.unit_members for all
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "audit read admin" on public.audit_log;
create policy "audit read admin" on public.audit_log for select using (public.is_admin_uid(auth.uid()));
drop policy if exists "audit insert" on public.audit_log;
create policy "audit insert" on public.audit_log for insert with check (true);

-- profiles: admins can update active/access_level/must_change_password; users can't deactivate themselves via API misuse
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles for update
  using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

-- ── LAST-ADMIN GUARD (PRD 3.4): last admin cannot be demoted/deactivated ──
create or replace function public.prevent_last_admin()
returns trigger language plpgsql security definer as $$
declare admin_count int;
begin
  if TG_OP = 'UPDATE' and old.access_level = 'Admin'
     and new.access_level <> 'Admin' or (TG_OP='UPDATE' and old.active and not new.active and old.access_level='Admin') then
    select count(*) into admin_count from public.profiles where access_level='Admin' and active and id <> old.id;
    if admin_count = 0 then
      raise exception 'Cannot demote or deactivate the last remaining admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_last_admin on public.profiles;
create trigger trg_last_admin before update on public.profiles
  for each row execute function public.prevent_last_admin();

-- ── New users default to must_change_password = true (PRD 4.3) ──
create or replace function public.set_forced_pw_on_new_user()
returns trigger language plpgsql security definer as $$
begin
  new.must_change_password := true;
  new.active := coalesce(new.active, true);
  return new;
end $$;
drop trigger if exists trg_forced_pw on public.profiles;
create trigger trg_forced_pw before insert on public.profiles
  for each row execute function public.set_forced_pw_on_new_user();
