-- ============================================================
-- NODAAR TEAM HUB — v3.4 Channels & User Management (MS Teams Style)
-- Run AFTER v6
-- Adds: channels, channel_members, channel_updates (Save/Draft/Publish)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. EXTEND PROFILES WITH STATUS & CHANNELS
-- ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists status text default 'active' check (status in ('active', 'draft', 'inactive')),
  add column if not exists department text;

-- ─────────────────────────────────────────────
-- 2. TABLE: channels (Departments, Teams & Public/Private Channels)
-- ─────────────────────────────────────────────
create table if not exists public.channels (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null unique,
  display_name text not null,
  description  text,
  icon         text default '💬',
  is_private   boolean default false,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now()
);

-- Seed default Microsoft Teams-style channels
insert into public.channels (name, display_name, description, icon, is_private)
values
  ('announcements', 'Announcements & All-Hands', 'Company-wide official announcements, policy updates, and executive briefings.', '📢', false),
  ('general', 'General Workspace', 'General team discussions, cross-functional questions, and daily operations.', '💬', false),
  ('engineering-tech', 'Engineering & Tech', 'Technical architecture, sprint deliverable reviews, Supabase schemas, and bugs.', '💻', true),
  ('product-design', 'Product & UI-UX Design', 'Design systems, Figma decks, user research, and product feature specs.', '🎨', true),
  ('growth-marketing', 'Growth & Marketing', 'Brand campaigns, pitch proposals, social assets, and client partnerships.', '🚀', true),
  ('executive-leadership', 'Executive Leadership', 'Confidential founder directives, financial models, and strategic OKRs.', '🔒', true)
on conflict (name) do nothing;

alter table public.channels enable row level security;

-- ─────────────────────────────────────────────
-- 3. TABLE: channel_members (Channel membership & access control)
-- ─────────────────────────────────────────────
create table if not exists public.channel_members (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text default 'member' check (role in ('admin', 'member')),
  joined_at   timestamptz default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user_idx on public.channel_members(user_id);
create index if not exists channel_members_channel_idx on public.channel_members(channel_id);

alter table public.channel_members enable row level security;

-- ─────────────────────────────────────────────
-- 4. TABLE: channel_updates (Admin & Team Updates, Drafts, Deliverables)
-- ─────────────────────────────────────────────
create table if not exists public.channel_updates (
  id           uuid default uuid_generate_v4() primary key,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  body         text not null,
  update_type  text default 'general' check (update_type in ('announcement', 'priority', 'deliverable', 'general')),
  status       text default 'published' check (status in ('published', 'draft', 'archived')),
  drive_link   text,
  reactions    jsonb default '{}'::jsonb,
  replies      jsonb default '[]'::jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists channel_updates_channel_idx on public.channel_updates(channel_id);
create index if not exists channel_updates_status_idx on public.channel_updates(status);
create index if not exists channel_updates_created_idx on public.channel_updates(created_at desc);

alter table public.channel_updates enable row level security;

-- ─────────────────────────────────────────────
-- 5. RLS POLICIES
-- ─────────────────────────────────────────────

-- Channels policies
drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels for select using (
  auth.role() = 'authenticated' and (
    is_private = false or
    public.is_admin() or
    exists (select 1 from public.channel_members cm where cm.channel_id = channels.id and cm.user_id = auth.uid())
  )
);

drop policy if exists "channels_admin_all" on public.channels;
create policy "channels_admin_all" on public.channels for all using (public.is_admin());

-- Channel Members policies
drop policy if exists "channel_members_select" on public.channel_members;
create policy "channel_members_select" on public.channel_members for select using (
  auth.role() = 'authenticated' and (
    public.is_admin() or
    user_id = auth.uid() or
    exists (select 1 from public.channels c where c.id = channel_members.channel_id and c.is_private = false)
  )
);

drop policy if exists "channel_members_admin" on public.channel_members;
create policy "channel_members_admin" on public.channel_members for all using (public.is_admin());

-- Channel Updates policies
drop policy if exists "channel_updates_select" on public.channel_updates;
create policy "channel_updates_select" on public.channel_updates for select using (
  auth.role() = 'authenticated' and (
    -- Drafts are only visible to the author or admins
    (status = 'published' or author_id = auth.uid() or public.is_admin()) and
    -- Channel must be accessible
    exists (
      select 1 from public.channels c
      where c.id = channel_updates.channel_id and (
        c.is_private = false or
        public.is_admin() or
        exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())
      )
    )
  )
);

drop policy if exists "channel_updates_insert" on public.channel_updates;
create policy "channel_updates_insert" on public.channel_updates for insert with check (
  auth.role() = 'authenticated' and (
    public.is_admin() or
    exists (
      select 1 from public.channels c
      where c.id = channel_updates.channel_id and (
        c.is_private = false or
        exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())
      )
    )
  )
);

drop policy if exists "channel_updates_update" on public.channel_updates;
create policy "channel_updates_update" on public.channel_updates for update using (
  author_id = auth.uid() or public.is_admin()
);

drop policy if exists "channel_updates_delete" on public.channel_updates;
create policy "channel_updates_delete" on public.channel_updates for delete using (
  author_id = auth.uid() or public.is_admin()
);
