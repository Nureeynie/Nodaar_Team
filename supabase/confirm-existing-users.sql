-- ============================================================
-- ONE-TIME FIX: confirm all existing auth users so they can sign in
-- Run in Supabase SQL Editor (you have access to auth schema there).
-- Also disable "Confirm email": Supabase Dashboard → Auth → Settings → uncheck "Confirm email".
-- ============================================================
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
