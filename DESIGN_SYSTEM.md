# Nodaar — Design System

The visual language for the Nodaar Team Management Platform. One stylesheet,
`css/ds.css`, backs every screen. No framework, no gradients, no emoji.

---

## 1. Colour

| Token | Value | Use |
|---|---|---|
| `--navy-900` | `#07192F` | Primary brand navy — sidebar, mobile bar, primary buttons, auth banner |
| `--navy-800` | `#0E2747` | Hover navy for primary actions |
| `--brand` / `--accent` | `#FE8A03` | Signature brand orange — active indicators, accent CTAs, progress fills, focus rings |
| `--brand-ink` | `#B55300` | High-contrast dark-orange text on light surfaces (≥ 4.5:1) |
| `--brand-50` | `#FFF8EE` | Warm orange-tinted highlight surface for draft cards, list icons, mentions |
| `--bg` | `#F6F5F1` | Page background — warm off-white canvas |
| `--ink` | `#07192F` | Primary typography |
| `--ink-60` | `rgba(7,25,47,.66)` | Secondary text, labels, table headers |
| `--ink-40` | `rgba(7,25,47,.46)` | Group labels, placeholders |
| `--card` | `#FFFFFF` | Card and input surfaces |
| `--line` | `rgba(7,25,47,.16)` | Hairline card borders |
| `--line-soft` | `rgba(7,25,47,.09)` | Row dividers inside a card |
| `--alert` | `#C4321C` | Late, Rejected, Declined, Overdue |
| `--ok` | `#166534` | Approved / Done / Implemented badges and score states |

**Rules**

- Deep brand navy (`#07192F`) anchors navigation chrome (`#ds-sidebar`, `#ds-mobile-bar`, `.auth-brand-banner`) and primary actions, paired with crisp warm surfaces (`#F6F5F1`, `#FFFFFF`).
- Signature brand orange (`#FE8A03`) serves as the high-clarity focal accent: active navigation rail indicator, active role segment, primary accent CTAs (`.btn.accent`), progress fills, latest score chart bar, and `:focus-visible` outlines.
- Text contrast is ≥ 4.5:1 everywhere (`#07192F` on `#FE8A03` = 7.45:1; `#FFFFFF` on `#07192F` = 17.68:1; `#B55300` on `#FFFFFF` = 4.9:1).

---

## 2. Type

Inter, loaded from Google Fonts with `display=swap`, falling back to
`system-ui`.

| Element | Size / weight | Tracking |
|---|---|---|
| `h1` (page title) | `clamp(24px, 3.4vw, 34px)` / 800 | `-0.02em` |
| `h2` (modal title) | 20px / 800 | `-0.02em` |
| `h3` (card title) | 16px / 700 | `-0.02em` |
| `h4` | 13.5px / 700 | `-0.02em` |
| `.label` | 11px / 700, uppercase | `0.09em` |
| Body | 15px / 400 | — |
| `.small` | 12.5px | — |
| `.tiny` | 11px | — |
| Table header | 10.5px / 800, uppercase | `0.09em` |

Headings are tight and heavy. Labels are small, uppercase, and quiet — they
announce a field without shouting. `font-variant-numeric: tabular-nums` is used
where scores are compared.

---

## 3. Spacing

A 6px-based scale:

```
--sp1 6px   --sp2 10px   --sp3 16px   --sp4 24px   --sp5 36px   --sp6 56px
```

- Card padding: `--sp4` desktop, `--sp3` on mobile.
- Card-to-card gap: `--sp3`.
- Page gutter: `--sp5` desktop, `--sp3` mobile.
- Field margin: `--sp3`.
- `--tap: 44px` is the minimum height for anything tappable.

---

## 4. Buttons

| Class | Use |
|---|---|
| `.btn` | Default — white, 1px ink border, 44px min height |
| `.btn.primary` | The single most important action on a screen — ink fill |
| `.btn.alert` | Destructive only ("Reject and ask to resubmit") |
| `.btn.ghost` | Tertiary — "View all", "Mark all read" |
| `.btn.sm` | 36px height, for table rows and chips |

- The most common action on each screen is the **only** `.btn.primary` and is
  placed top-right of the page header (desktop) or full-width above the
  content (mobile).
- `:focus-visible` gets a `2.5px` ink outline at `2px` offset — never removed.
- `:disabled` drops to `opacity: .45`.

---

## 5. Inputs

- `.input` — 44px min height, 1px ink border, 10px radius, white on off-white.
- Labels are `.label`, always visible, always associated via `for`/`id`.
- Errors use `.form-error` (12.5px, `--alert`, bold) and are revealed with
  `.show`; the element carries `role="alert"` and `aria-live="polite"`.
- Placeholders are `--ink-40` and never replace a label.
- `textarea.input` is 96px tall and resizable.
- `select.input` inside a table row is compressed to 34px.

---

## 6. Tags

Small bordered pills, never filled blocks of colour.

```html
<span class="tag">Submitted</span>            <!-- neutral -->
<span class="tag ok">Approved</span>           <!-- green text, ink border -->
<span class="tag alert">Late by 1h 18m</span>  <!-- alert text + alert border -->
<span class="tag muted-tag">Not submitted</span><!-- quiet grey -->
```

The border stays ink for every non-alert tag. Only the **text and border** turn
green or red — the background is always white.

---

## 7. Cards

```html
<div class="card">
  <div class="card-head">
    <h3>Title</h3>
    <button class="btn sm ghost">Action</button>
  </div>
  …
</div>
```

- White, 1px ink border, 14px radius, 24px padding.
- `.card-head` is a flex row: title on the left, action on the right, wrapping
  to a new line on narrow screens.
- Cards stack with a 16px gap via `.stack > * + *`.

---

## 8. Tables

`.table-wrap` is a bordered, scrollable container; `table.ds` is 13.5px with
uppercase 10.5px headers and 1px `--line-soft` row dividers. Below 640px the
table scrolls horizontally rather than reflowing — admin tables are dense by
nature.

---

## 9. Sidebar

- Fixed 264px column, off-white, 1px ink right border, sticky at `100dvh`.
- Brand mark (30px bordered square with the letter "N") + wordmark at the top.
- **Role switcher directly beneath it** — a two-segment control,
  `Member | Admin`, 44px tall. The active segment is ink-filled. The Admin
  segment is hidden entirely for users who are not admins.
- Nav is grouped by uppercase labels: Overview, Manage, Performance, Shared.
- The active item is a white card with an ink border; the rest are ghost.
- Notifications, Profile and Sign out are pinned to the bottom.
- Below 900px the sidebar is replaced by the bottom tab bar.

---

## 10. Mobile

- Bottom tab bar (`#ds-tabbar`), 5 items, each 44px tall, with a 20px icon
  and a 10px uppercase label. Safe-area padding for notched phones.
- Member tabs: Home · Report · Tasks · Scores · Chat
- Admin tabs: Home · Review · Scores · Users · Chat
- Forms are single-column, 44px controls, and the primary action spans the
  full width.
- `.kv` definition lists collapse to stacked rows under 520px.

---

## 11. Empty states

Every list has one. The pattern is: a bold statement, a sentence explaining
what will appear, and — where useful — a button that creates the thing.

```html
<div class="empty">
  <div class="big">No tasks assigned</div>
  <div class="hint">Tasks assigned to you will appear here.</div>
</div>
```

Examples in use: *Nothing shared with you yet*, *The library is empty*, *No
scores yet*, *No weekly period*.

---

## 12. States

| State | Treatment |
|---|---|
| **Loading** | `.loading` — centred 13.5px muted text, no spinner |
| **Empty** | `.empty` — see above |
| **Error** | `.error-box` — 1px `--alert` border, alert-coloured bold text |
| **Late** | `.tag.alert` — "Late by 1h 18m" plus the exact submission time |
| **Missed** | `.tag.alert` — "Missed report — recorded 0" |
| **Rejected** | `.tag.alert` + the admin's reason in an `.error-box` on the member's screen |
| **Locked period** | `.tag.muted-tag` "Locked", fields disabled, an `.error-box` explaining the period must be reopened first |
| **Score pending** | Score input renders **empty** — the system never suggests a value |
