# Nodaar — Screens, Flows and States

Every screen below is live and renders against the real Supabase project
`xzrczuoxlujzmztkupbz`. Roles, permissions and the data rules are enforced by
row-level security in the database, not just hidden in the UI.

---

## 1. The five clickable steps

This is the flow the brief asks for, end to end. It is automated in
`tests/e2e-flow.py` and passes green.

### Step 1 — Admin creates a user
`Admin → Users → Create a user`

- Name, email, temporary password, access level, optional unit and unit role.
- The admin supplies the temporary password; the system never generates a
  one-time link.
- The account is created through the `create-user` edge function, which
  pre-confirms the email and writes `must_change_password = true`.
- The temporary password is shown once in a toast so the admin can pass it on.

### Step 2 — First login forces a password change
The member signs in with the temporary password. Before anything else renders,
a modal blocks the app: **"Set a new password"**. The modal cannot be
dismissed; the app behind it is inert until the password is changed.
`profiles.must_change_password` is cleared on success.

### Step 3 — Member submits the daily report
`Member → Dashboard → Write today's report`

- What I did yesterday, what I will do today, blockers (optional), evidence
  link (URL only).
- The deadline is shown in the page header (18:00 WAT by default, editable by
  the admin under Calendar & leave).
- The submission time is recorded automatically.
- If the submission arrives after the deadline, it is flagged `is_late` and
  the exact late minutes are stored. **Nothing is penalised automatically** —
  the admin sees the flag and decides.

### Step 4 — Admin reviews and scores
`Admin → Review queue → Open & score`

- The queue merges daily reports, meeting reports, ideas and problems, with
  filters for type and member.
- The review modal shows the full submission, the exact submission time, and a
  `Late by Xh Ym` flag when late.
- The **score field starts empty** (0–100). The system never suggests or
  pre-fills a value — submitting an empty score is blocked with a visible
  error.
- Two actions: **Approve and save score** (writes the score, the note, the
  reviewer and the timestamp, and notifies the member) and **Reject and ask to
  resubmit** (requires a reason; the member sees it and can edit and resubmit).
- An admin cannot score their own submission — the modal says so and offers no
  score field.

### Step 5 — Member sees the score
`Member → My score sheet`

- The headline figure is the weekly score when one exists, otherwise the most
  recent scored submission.
- Weekly trend chart, breakdown by criterion with weighted contributions, an
  activity breakdown across daily reports / meetings / tasks / ideas and
  problems, and a table of every scored daily report with the admin's note.
- **Private by construction**: the `weekly_scores` and `monthly_scores` RLS
  policies return only the caller's own rows. There is no ranking and no other
  member's data anywhere on the screen.

---

## 2. Screen inventory

### Shared

| Screen | Route | Notes |
|---|---|---|
| Login | `#ds-auth` | Email + password, inline error |
| Forced password change | `#pw-modal` | Modal, non-dismissible |
| Role switcher | sidebar top | `Member \| Admin`, whole view changes instantly |
| Profile | `profile` | Details, change password |
| Notifications | `notifications` | Score, report, leave, meeting, announcement events |

### Member

| Screen | Route | Key content |
|---|---|---|
| Dashboard | `dashboard` | Today's report status, my tasks, this week's idea/problem, latest score, units & OKRs, announcements |
| Daily report | `report` | Short single-column form, deadline shown, submission time recorded |
| My tasks | `tasks` | Status, priority, due date, overdue flag, evidence, extension request |
| My units & OKRs | `units` | Units, role in each, shared OKRs with key-result progress |
| Meetings | `meetings` | Upcoming meetings, join link, file a meeting report (attended / contribution / feedback) |
| Idea & problem | `ideas` | Section dropdown, title, description, date, severity; status after submission |
| Score sheet | `scores` | Monthly %, weekly chart, category breakdown, activity breakdown — private |
| Library | `library` | Only granted items, search, category filter, report broken link, Open |
| Leave | `leave` | Request leave, track status |
| Channels | `channels` | General, unit channels, announcements |

### Admin

| Screen | Route | Key content |
|---|---|---|
| Dashboard | `dashboard` | Waiting for review, reports today vs expected, missed today (0), open blockers, overdue tasks, upcoming meetings, ideas awaiting a decision, per-member performance |
| Review queue | `review` | All pending submissions, filters, sidebar badge |
| Review & score | modal | Full submission, exact time, Late flag, **empty score**, note, approve / reject |
| Users | `users` | Create, temporary password, reset password, deactivate, promote to admin |
| Units & roles | `units` | Create units, define role titles, assign members to several units |
| Tasks & OKRs | `tasks` | Create, assign to member or unit, link to key results, change status inline |
| Meetings | `meetings` | Create, invite a unit or members, mark attendance, notes link |
| Ideas & problems | `ideas` | Decide: Approved / In progress / Implemented / Rejected with a reason |
| Scores & periods | `scores` | Category weights (must total 100), per-member weekly and monthly, lock and reopen, audit log |
| Calendar & leave | `calendar` | Months and weeks, holidays and days off, leave approval, daily deadline |
| Library admin | `library` | Add entry, grant to individual / unit / everyone, open counts, broken-link flags |
| Channels | `channels` | Admin-only announcements channel, create channels |

---

## 3. Business rules as they appear on screen

**A missed daily report is recorded automatically as 0.**
The nightly job (00:30 Lagos, `pg_cron`) inserts the report with
`missed_report = true` and score 0. In the admin dashboard it shows as
`Missed today (0)`; in the review queue it carries a `Missed` tag and the
modal reads *"Missed report — recorded 0"*. The admin can still edit and
score it.

**Late submissions are not penalised automatically.**
The late flag and the exact submission time are shown to the admin. The score
box is empty. The member's own screen shows *Late by Xh Ym* beside their
submission so there is no surprise.

**Documents are shared only as URLs.**
Every evidence, notes and library field is a URL input with `type="url"`.
There is no file input anywhere in the platform.

**Members see only their own scores.**
Enforced by RLS on `weekly_scores` and `monthly_scores`, not by the UI alone.

**Members see only library items granted to them.**
Enforced by the `can_see_library_item()` helper function. Grants are
`everyone`, `unit:<uuid>` or `member:<uuid>`.

**Locked periods cannot be edited until an admin reopens them.**
A database trigger rejects any write to a score in a locked period. In the UI
the criterion fields are disabled, an error box explains why, and the period
list offers **Reopen**. Reopening is audit-logged.

**An admin cannot score their own submissions.**
The review modal detects `user_id === current admin` and offers no score field.

**The last admin cannot be demoted or deactivated.**
A database trigger raises an error; the UI also disables the buttons on your
own row.

---

## 4. State reference

| State | Where it appears |
|---|---|
| Loading | Every route paints `.loading` while its query is in flight |
| Empty | Every list — see the design system, §11 |
| Error | `.error-box`; inline field errors use `.form-error.show` with `role="alert"` |
| Late | `Late by 1h 18m` tag in the review queue and modal; `Submitted · Late by …` on the member's report |
| Missed | `Missed report — recorded 0` tag |
| Rejected | `Rejected` tag plus the admin's reason in an `.error-box` on the member's screen |
| Locked period | `Locked` tag, disabled score fields, `Reopen` action |
| Score pending | Empty score input, `Not scored yet` tag |
| Deactivated account | Sign-in is refused with "This account has been deactivated. Contact an admin." |
| Overdue task | `Overdue 20 Nov 2026` tag in the alert colour |

---

## 5. Accessibility

- Semantic `<button>`, `<a>`, `<label for>` and `<table>` elements throughout.
- Every icon-only control has an `aria-label`; decorative SVG is
  `aria-hidden="true"`.
- Visible focus rings: `2.5px` ink outline at `2px` offset, never removed.
- The role switcher is a labelled `role="group"` with `aria-pressed` on each
  segment; the active nav item carries `aria-current="page"`.
- The forced-password modal is `role="dialog" aria-modal="true"`.
- Form errors are `role="alert" aria-live="polite"`.
- All interactive targets are at least 44px tall.
- Contrast is ≥ 4.5:1 for all text.
