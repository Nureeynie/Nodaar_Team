-- ============================================================
-- PHASE 5 (PRD): OKRs, URL-only Library w/ access grants,
-- dashboards, exports. Run AFTER schema.v9.phase4.sql
-- ============================================================

-- ── OKRs (PRD 9) ────────────────────────────────────────────
create table if not exists public.okrs (
  id          uuid default uuid_generate_v4() primary key,
  period_id   uuid references public.periods(id),     -- monthly/quarterly period
  unit_id     uuid references public.units(id),       -- null = company-wide
  title       text not null,
  description text,
  owner_id    uuid references public.profiles(id),
  status      text default 'On Track' check (status in ('On Track','At Risk','Off Track','Done')),
  progress    int default 0 check (progress between 0 and 100),
  created_at  timestamptz default now()
);
create table if not exists public.key_results (
  id          uuid default uuid_generate_v4() primary key,
  okr_id      uuid references public.okrs(id) on delete cascade not null,
  title       text not null,
  target      text,
  current     text,
  progress    int default 0 check (progress between 0 and 100),
  created_at  timestamptz default now()
);

-- ── LIBRARY: URL-ONLY documents, NO uploads (PRD 11) ────────
create table if not exists public.library_items (
  id          uuid default uuid_generate_v4() primary key,
  title       text not null,
  url         text not null,                          -- external link only
  description text,
  category    text,
  added_by    uuid references public.profiles(id),
  created_at  timestamptz default now()
);
-- access grants: scope = everyone | unit:<id> | member:<id>
create table if not exists public.library_grants (
  id          uuid default uuid_generate_v4() primary key,
  item_id     uuid references public.library_items(id) on delete cascade not null,
  scope       text not null,                          -- 'everyone' | 'unit:<uuid>' | 'member:<uuid>'
  unique (item_id, scope)
);

-- helper: can this user see this item?
create or replace function public.can_see_library_item(item_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.library_grants g
    where g.item_id = can_see_library_item.item_id
      and (g.scope = 'everyone'
           or g.scope = 'member:' || auth.uid()::text
           or (g.scope like 'unit:%' and exists (
                select 1 from public.unit_members m
                where m.unit_id = substring(g.scope from 6)::uuid and m.user_id = auth.uid())))
  );
$$;

-- ── RLS ────────────────────────────────────────────────────
alter table public.okrs enable row level security;
alter table public.key_results enable row level security;
alter table public.library_items enable row level security;
alter table public.library_grants enable row level security;

drop policy if exists "okrs read" on public.okrs;
create policy "okrs read" on public.okrs for select using (
  unit_id is null or public.is_admin_uid(auth.uid())
  or exists (select 1 from public.unit_members m where m.unit_id = okrs.unit_id and m.user_id = auth.uid())
);
drop policy if exists "okrs admin write" on public.okrs;
create policy "okrs admin write" on public.okrs for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "krs read" on public.key_results;
create policy "krs read" on public.key_results for select using (
  exists (select 1 from public.okrs o where o.id = key_results.okr_id and (
    o.unit_id is null or public.is_admin_uid(auth.uid())
    or exists (select 1 from public.unit_members m where m.unit_id = o.unit_id and m.user_id = auth.uid()))))
);
drop policy if exists "krs admin write" on public.key_results;
create policy "krs admin write" on public.key_results for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "library read granted" on public.library_items;
create policy "library read granted" on public.library_items for select
  using (public.is_admin_uid(auth.uid()) or public.can_see_library_item(id));
drop policy if exists "library admin write" on public.library_items;
create policy "library admin write" on public.library_items for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists "grants read" on public.library_grants;
create policy "grants read" on public.library_grants for select
  using (public.is_admin_uid(auth.uid()) or public.can_see_library_item(item_id));
drop policy if exists "grants admin write" on public.library_grants;
create policy "grants admin write" on public.library_grants for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));
