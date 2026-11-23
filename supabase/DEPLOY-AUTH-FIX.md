# Fix "invalid login" for newly created users

## Option A (recommended, 2 min): disable email confirmation
Supabase Dashboard → Authentication → Settings → **uncheck "Confirm email"**.
Then run once in SQL Editor: `supabase/confirm-existing-users.sql`
→ every new user can sign in immediately with the temp password.

## Option B (most robust): deploy the create-user Edge Function
```bash
# get service_role key: Dashboard → Settings → API (keep secret!)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
supabase functions deploy create-user
```
The app automatically calls this function first (creates the user with
`email_confirm: true`), and falls back to anon signUp if not deployed.

## If a user still can't log in
- Login screen now shows a **"Resend confirmation link"** button when the
  email isn't confirmed.
- Or reset password: Dashboard → Authentication → Users → ⋯ → Send password reset.
