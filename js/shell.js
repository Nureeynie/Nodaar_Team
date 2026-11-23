/* ============================================================
   NODAAR HUB — App Shell controller
   Header · 5-tab bottom nav · "More" sheet · footer · mobile search
   Depends on: navigate(), currentProfile, logout(), openActionModal()
   ============================================================ */
(function () {
  'use strict';

  // Tabs that live in the bottom bar. Everything else lights up "More".
  const BAR_TABS = ['overview', 'tasks', 'channels', 'calendar'];
  const ADMIN_ONLY = ['roles'];

  const $ = (id) => document.getElementById(id);

  /* ---------- More sheet ---------- */
  function openMoreSheet() {
    const sheet = $('nh-more-sheet'), bd = $('nh-more-backdrop');
    if (!sheet) return;
    syncActive(window.activeTab);
    syncUser();
    sheet.classList.add('open'); bd.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeMoreSheet() {
    const sheet = $('nh-more-sheet'), bd = $('nh-more-backdrop');
    if (!sheet) return;
    sheet.classList.remove('open'); bd.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function toggleMoreSheet() {
    const sheet = $('nh-more-sheet');
    if (sheet && sheet.classList.contains('open')) closeMoreSheet(); else openMoreSheet();
  }
  function sheetGo(tab) {
    closeMoreSheet();
    if (typeof window.navigate === 'function') window.navigate(tab);
  }
  function sheetFullMenu() {
    closeMoreSheet();
    if (typeof window.openMobileSidebar === 'function') window.openMobileSidebar();
  }
  function sheetLogout() {
    closeMoreSheet();
    if (typeof window.logout === 'function') window.logout();
  }

  /* ---------- Mobile search ---------- */
  function toggleMobileSearch(force) {
    const box = $('nh-msearch');
    if (!box) return;
    const open = typeof force === 'boolean' ? force : !box.classList.contains('open');
    box.classList.toggle('open', open);
    if (open) setTimeout(() => $('nh-msearch-input')?.focus(), 30);
  }
  function onSearchInput(v) {
    // keep both inputs in sync and reuse existing global handler
    const a = $('global-search'), b = $('nh-msearch-input');
    if (a && a.value !== v) a.value = v;
    if (b && b.value !== v) b.value = v;
    if (typeof window.handleGlobalSearch === 'function') window.handleGlobalSearch(v);
  }

  /* ---------- Active state sync ---------- */
  function syncActive(tab) {
    document.querySelectorAll('.nh-tab').forEach((b) => b.classList.remove('active'));
    const bar = BAR_TABS.includes(tab) ? $('nh-tab-' + tab) : $('nh-tab-more');
    if (bar) bar.classList.add('active');
    document.querySelectorAll('.nh-gitem').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  }

  /* ---------- User info in header + sheet ---------- */
  function syncUser() {
    const p = window.currentProfile;
    if (!p) return;
    const name = p.full_name || p.email || 'User';
    const initial = name.charAt(0).toUpperCase();
    const html = p.avatar_url ? `<img src="${p.avatar_url}" alt="${name}">` : initial;
    ['nh-h-avatar', 'nh-sheet-avatar'].forEach((id) => { const el = $(id); if (el) el.innerHTML = html; });
    const n = $('nh-sheet-name'); if (n) n.textContent = name;
    const isAdmin = typeof window.isUserAdmin === 'function' ? window.isUserAdmin() : (p.access_level === 'Admin');
    const r = $('nh-sheet-role'); if (r) r.textContent = `${p.role || 'Member'} · ${isAdmin ? 'Admin' : 'Member'}`;
    ADMIN_ONLY.forEach((t) => { const el = document.querySelector(`.nh-gitem[data-tab="${t}"]`); if (el) el.hidden = !isAdmin; });
    const roleBox = $('admin-role-switcher-box'); if (roleBox) roleBox.style.display = isAdmin ? 'flex' : 'none';
    const fr = $('nh-footer-roles'); if (fr) fr.style.display = isAdmin ? '' : 'none';
    const yr = $('nh-year'); if (yr) yr.textContent = new Date().getFullYear();
  }
  window.syncAppShell = syncUser;

  /* ---------- Notification dot mirror ---------- */
  function syncNotifDot() {
    const legacy = $('notif-badge');
    const dot = $('nh-notif-dot');
    if (!dot) return;
    const on = legacy && !legacy.classList.contains('hidden');
    dot.classList.toggle('on', !!on);
  }

  /* ---------- Hook into navigate() without editing legacy code ---------- */
  function hookNavigate() {
    if (typeof window.navigate !== 'function' || window.navigate.__nhHooked) return;
    const orig = window.navigate;
    const wrapped = function (tab) {
      const r = orig.apply(this, arguments);
      try { syncActive(tab); closeMoreSheet(); toggleMobileSearch(false); } catch (e) {}
      return r;
    };
    wrapped.__nhHooked = true;
    window.navigate = wrapped;
  }

  /* ---------- Footer clock (Lagos, Mon–Sat 10:00–16:00) ---------- */
  function tickStatus() {
    const el = $('nh-footer-clock'), el2 = $('nh-sheet-clock');
    const now = new Date();
    let lagos;
    try {
      lagos = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    } catch (e) { lagos = null; }
    const parts = lagos ? Object.fromEntries(lagos.filter(p => p.type !== 'literal').map(p => [p.type, p.value])) : {};
    const wd = parts.weekday || now.toLocaleDateString('en-GB', { weekday: 'short' });
    const hh = parseInt(parts.hour ?? now.getHours(), 10);
    const mm = parts.minute ?? String(now.getMinutes()).padStart(2, '0');
    const working = wd !== 'Sun' && hh >= 10 && hh < 16;
    const label = `${wd} ${String(hh).padStart(2, '0')}:${mm} WAT`;
    const state = working ? 'Workspace open' : (wd === 'Sun' ? 'Sunday · Off' : 'Outside hours');
    if (el) el.innerHTML = `<b>${state}</b> · ${label}`;
    if (el2) el2.innerHTML = `<b>${state}</b> · ${label}`;
    document.querySelectorAll('.nh-footer-status .pulse, .nh-sheet-hours .pulse').forEach(d => { d.style.background = working ? '#10B981' : '#94A3B8'; d.style.animation = working ? '' : 'none'; });
  }

  /* ---------- Boot ---------- */
  function boot() {
    hookNavigate();
    syncActive(window.activeTab || 'tasks');
    syncUser();
    syncNotifDot();
    tickStatus();
    setInterval(tickStatus, 30000);

    // Mirror profile + notif changes (legacy updates DOM, we observe it)
    const nameEl = $('user-display-name');
    if (nameEl && 'MutationObserver' in window) new MutationObserver(syncUser).observe(nameEl, { childList: true, characterData: true, subtree: true });
    const nb = $('notif-badge');
    if (nb && 'MutationObserver' in window) new MutationObserver(syncNotifDot).observe(nb, { attributes: true, attributeFilter: ['class'] });

    // ESC closes sheet / search
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMoreSheet(); toggleMobileSearch(false); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const s = $('global-search'); if (s && s.offsetParent) s.focus(); else toggleMobileSearch(true); }
    });
    // Swipe-down to close sheet
    const sheet = $('nh-more-sheet'); let y0 = null;
    if (sheet) {
      sheet.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
      sheet.addEventListener('touchend', (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 70 && sheet.scrollTop <= 0) closeMoreSheet(); y0 = null; }, { passive: true });
    }
  }

  // navigate() is defined in app.legacy.js which loads before us; hook again late just in case.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('load', hookNavigate);

  Object.assign(window, { openMoreSheet, closeMoreSheet, toggleMoreSheet, sheetGo, sheetFullMenu, sheetLogout, toggleMobileSearch, nhSearchInput: onSearchInput, nhSyncUser: syncUser });
})();
