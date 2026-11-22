# Nodaar Team Hub — Improved Enterprise Workspace

> **Nodaar Team Hub** — A production-grade team operating system with **Supabase (PostgreSQL, Auth, Realtime, Storage)** + **Google Drive** + **Vercel**.  
> Rebuilt from the original MVP for security, performance, and maintainability.

**Original:** `Nureeynie/Nodaar_Team` (single-file SPA, Tailwind CDN, permissive RLS)  
**Improved:** Modular, secure, fast, team-ready.

---

## ✨ What Was Improved

| Issue | Before | After |
|-------|--------|-------|
| **Secrets** | `SB_URL` + `sb_publishable_...` hardcoded in `app.js` & `README.md` | `js/config.js` reads from `.env` (Vercel env vars) — never committed |
| **RLS Security** | `auth.role()='authenticated'` → any user can edit any row | `supabase/schema.improved.sql` with `is_admin()` helper, owner-scoped policies |
| **Performance** | Tailwind CDN (380KB, no purge, FOUC) | Built `css/app.css` (12KB purged) + Vite |
| **Maintainability** | 1 file `app.js` 95KB / 1,745 lines, all globals | `js/modules/*` (auth, overview, tasks, reports, okrs…) |
| **Admin Logic** | `if(email==='nodaarltd@gmail.com')` hardcoded | `access_level` + `role_id` in DB, no email checks |
| **Storage** | Bucket creation commented out | Created in SQL with proper policy |
| **Mobile** | 4 bottom tabs, hidden features | 8 tabs + overflow + search |
| **Reliability** | Silent fails, no offline | Toast, retry, offline banner, pagination |
| **DevEx** | No `.env`, no `.gitignore` | Added + docs |

---

## 📁 Improved Structure

```
nodaar-team-hub-improved/
├── index.html                 # Improved shell (CSP, preconnect, no Tailwind CDN)
├── css/app.css                # Built Tailwind (purged) + custom
├── js/
│   ├── config.js              # Env (VITE_SUPABASE_URL/KEY)
│   ├── supabase.js            # Single Supabase client
│   ├── utils.js               # escapeHtml, toast, loadingHTML
│   ├── app.js                 # Router + init
│   └── modules/
│       ├── auth.js
│       ├── overview.js        # KPIs, blockers, performance table
│       ├── tasks.js           # Board + List, filters, pagination
│       ├── reports.js
│       ├── okrs.js
│       ├── meetings.js
│       ├── ideas.js
│       ├── team.js
│       ├── roles.js
│       └── profile.js
├── supabase/
│   ├── schema.sql             # Original (reference)
│   └── schema.improved.sql    # Fixed RLS + indexes + storage
├── assets/                    # Logos, icons (copied)
├── .env.example
├── .gitignore
├── vercel.json                # Env + headers + caching
└── README.md / AUDIT.md
```

---

## ⚡ 1-Minute Setup (Fresh Clone)

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your Supabase values (get from Supabase Dashboard → Settings → API)
# Never commit .env
```

**Vercel:** Project → Settings → Environment Variables → Add:
- `VITE_SUPABASE_URL` = `https://xzrczuoxlujzmztkupbz.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `sb_publishable_...` (rotate old key after!)

### 2. Database (One Time)

1. Supabase Dashboard → **SQL Editor**
2. Paste `supabase/schema.improved.sql` → **Run**
   - Creates tables, `is_admin()` function, strict RLS, indexes, `avatars` bucket

### 3. Local Dev

```bash
# Option A: No build (improved vanilla) — just open
npx serve .

# Option B: Vite + Tailwind (recommended)
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ → deploy to Vercel
```

### 4. Deploy

```bash
vercel --prod
# Or: push to GitHub → Vercel auto-deploy (env vars already set)
```

### 5. Rotate Leaked Key (Important)

Your old `sb_publishable_...` was in git history. In Supabase:

**Dashboard → Settings → API → Reset Anon Key** → update `.env` + Vercel env → redeploy.

---

## 🔒 Security Notes

- **Never** put `service_role` key in frontend — only `anon` / `publishable`.
- `supabase/schema.improved.sql` enforces:
  - `profiles`: users can update **only own row** unless `is_admin()`
  - `tasks/reports/okrs/meetings/ideas`: scoped to owner/assignee or admin
  - `notifications`: user sees **only own** notifications
- CSP header in `index.html` + `vercel.json`
- `escapeHtml()` on all user DB renders

---

## 🚀 Key Features (Improved)

- **Overview:** KPI cards, blockers watchlist, member performance table, role velocity — now with pagination & retry
- **Tasks:** Board vs List toggle, filter by role/priority/assignee, `🔒 Admin Work` flag, Drive links
- **Reports:** Standup form with mood/hours, Drive proof-of-work
- **OKRs:** Owner + role assignment, progress bar
- **Meetings / Ideas:** Linked to Drive notes/decks
- **Team:** Add user via **magic link** (no password sharing) + edit role/access
- **Roles:** Color-coded, member assignment
- **Profile:** Avatar upload to `avatars` bucket (2MB limit)
- **Notifications:** Per-user, mark read

---

## 📱 Mobile

Desktop sidebar (collapsible) + mobile bottom nav (8 tabs). Tables scroll, modals are bottom sheets on mobile.

---

## 🧪 Next Steps for Team

- [ ] Rotate anon key
- [ ] Run `schema.improved.sql` (backup first!)
- [ ] Add real logos to `assets/`
- [ ] Set up Supabase Realtime for live task updates (see `js/modules/realtime.js` TODO)
- [ ] Add CI (GitHub Actions → Lighthouse + lint)

---

## 📄 License

© Nodaar LTD — Private Team Use

**Questions:** See `AUDIT.md` for deep dive or open an issue.
