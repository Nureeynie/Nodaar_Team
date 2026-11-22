-- ============================================================
-- NODAAR TEAM HUB — SCHEMA V8: WHATSAPP GROUPS & MANAGEMENT (FIXED)
-- Safe, idempotent script for Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Company-wide',
  channel_id TEXT, -- Stored as text to allow channel slugs or UUIDs without type conflicts
  url TEXT NOT NULL,
  description TEXT,
  access TEXT NOT NULL DEFAULT 'All Members',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Idempotent Policies: drop if existing before creating
DROP POLICY IF EXISTS "Allow authenticated read whatsapp_groups" ON public.whatsapp_groups;
CREATE POLICY "Allow authenticated read whatsapp_groups"
  ON public.whatsapp_groups FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow admin all whatsapp_groups" ON public.whatsapp_groups;
CREATE POLICY "Allow admin all whatsapp_groups"
  ON public.whatsapp_groups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.access_level = 'Admin'
    )
  );

-- Pre-seed default Lagos HQ groups
INSERT INTO public.whatsapp_groups (id, name, category, channel_id, url, description, access, is_pinned)
VALUES
  ('wa_all_team', 'Nodaar Lagos HQ — All Team Broadcast', 'Company-wide', 'ch_announcements', 'https://chat.whatsapp.com/invites/nodaar-all-team-hq', 'Official organization announcements, emergency alerts, daily Lagos HQ 10:00 - 16:00 shift sync.', 'All Members', true),
  ('wa_engineering', 'Engineering & Dev Operations', 'Engineering', 'ch_engineering', 'https://chat.whatsapp.com/invites/nodaar-engineering-tech', 'GitHub code reviews, PR deployments, Supabase backend updates, and urgent bug fixes.', 'Engineering Team', true),
  ('wa_design', 'Product Design & UI/UX Reviews', 'Design & UI', 'ch_design', 'https://chat.whatsapp.com/invites/nodaar-product-design', 'Figma prototypes, deliverable reviews, UI asset handoffs, and creative sync.', 'Design Team', false),
  ('wa_marketing', 'Marketing & Community Growth', 'Marketing', 'ch_marketing', 'https://chat.whatsapp.com/invites/nodaar-marketing-outreach', 'Social media campaigns, pitch deck attachments, client sync, and community partnerships.', 'Marketing Team', false),
  ('wa_executive', 'Executive & Admin Leadership', 'Management', 'ch_general', 'https://chat.whatsapp.com/invites/nodaar-executive-admin', 'Executive management, performance scores, quarterly OKR tracking, and budget approvals.', 'Admin Only', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  channel_id = EXCLUDED.channel_id,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  access = EXCLUDED.access,
  is_pinned = EXCLUDED.is_pinned;
