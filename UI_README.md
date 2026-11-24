# Nodaar — Team Management Platform (Redesigned UI)

A responsive web app for a small team: daily reports, tasks, OKRs, meetings,
weekly ideas and problems, private performance scores, leave, channels and a
URL-only library.

Open **`app.html`**. It is a static app — serve the folder over HTTP:

```bash
python3 -m http.server 8099
# then visit http://localhost:8099/app.html
```

## Files

```
app.html              the app shell: auth screen, forced-password modal,
                      sidebar + role switcher, main region, mobile tab bar
css/ds.css            the whole design system (no framework, no gradients)
js/ds.core.js         supabase client, router, role switch, auth, toast,
                      modal, icons, notifications + profile routes
js/ds.member.js       member screens + the shared screens; shared routes
                      dispatch on the active role
js/ds.admin.js        admin screens (dashboard, review queue, review+score,
                      users, units, tasks & OKRs, meetings, ideas, scores &
                      periods, calendar & leave, library, channels)
js/ds.boot.js         boot
```

Shared routes are registered **once** in `ds.member.js` and branch on the
current role, so the `Member | Admin` switcher in the sidebar changes the
whole view on every screen, instantly.

## Documentation

- `DESIGN_SYSTEM.md` — colours, type, spacing, components, states
- `FLOW.md` — every screen, the five-step clickable flow, and the state
  reference

## Data

Backed by the live Supabase project `xzrczuoxlujzmztkupbz`.
Schemas are in `supabase/` (`schema.v6.phase1.sql` … `schema.v13.phase8-ui.sql`).

Two things to know if you deploy the edge functions yourself:

1. The import **must** be `npm:@supabase/supabase-js@2`. `esm.sh` and
   jsDelivr are unreachable from the edge runtime and the function fails to
   boot with `BOOT_ERROR`.
2. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be set as function
   secrets.

