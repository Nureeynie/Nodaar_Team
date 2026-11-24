/* Nodaar DS — core: client, auth, router, shared UI helpers */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const SUPABASE_URL = 'https://xzrczuoxlujzmztkupbz.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const S = {
    sb, user: null, profile: null, role: 'Member',
    route: 'dashboard', loading: false,
  };
  window.DS = { $, $$, esc, S, sb };

  const todayLagos = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const fmtDT = (iso) => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const fmtD = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString([], { dateStyle: 'medium' }) : '—';
  window.DS.fmt = { todayLagos, fmtDT, fmtD };

  const isAdminProfile = () => S.profile?.access_level === 'Admin';
  const isAdmin = () => S.role === 'Admin' && isAdminProfile();
  window.DS.auth = { isAdmin, isAdminProfile };

  // meetings table carries both a legacy shape (meeting_date + time columns)
  // and a PRD shape (starts_at / ends_at). This normalises to one object.
  function normaliseMeeting(m) {
    if (!m) return null;
    const startsAt = m.starts_at || (m.meeting_date && m.start_time ? `${m.meeting_date}T${String(m.start_time).slice(0, 5)}` : null);
    const endsAt = m.ends_at || (m.meeting_date && m.end_time ? `${m.meeting_date}T${String(m.end_time).slice(0, 5)}` : null);
    return {
      ...m,
      starts_at: startsAt,
      ends_at: endsAt,
      link: m.location || m.meet_link || null,
      notes_link: m.drive_notes_link || null,
      agenda: m.agenda || m.description || null,
    };
  }
  window.DS.meeting = normaliseMeeting;

  // ── toast ──
  let toastEl;
  function toast(msg, isErr) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#14130F;color:#F6F4EF;padding:12px 20px;border-radius:10px;font-size:13.5px;font-weight:600;z-index:200;max-width:90vw';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.background = isErr ? '#B83A17' : '#14130F';
    toastEl.style.display = 'block';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.style.display = 'none', 3200);
  }
  window.DS.toast = toast;

  // ── modal ──
  function openModal(html) {
    $('#modal-box').innerHTML = html;
    $('#modal-root').classList.add('open');
  }
  function closeModal() { $('#modal-root').classList.remove('open'); }
  $('#modal-root')?.addEventListener('click', (e) => { if (e.target.id === 'modal-root') closeModal(); });
  window.DS.modal = { open: openModal, close: closeModal };

  // ── icons (inline SVG, no emoji) ──
  const I = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  window.DS.icons = {
    home: I('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
    report: I('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
    tasks: I('<path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
    units: I('<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>'),
    meeting: I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    bulb: I('<path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0012 2z"/>'),
    score: I('<path d="M12 2l3 6.5 7 .8-5.2 4.7 1.4 7L12 17.5 5.8 21l1.4-7L2 9.3l7-.8z"/>'),
    library: I('<path d="M4 19.5A2.5 2.5 0 016.5 17H20V2H6.5A2.5 2.5 0 004 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/>'),
    leave: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'),
    chat: I('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
    inbox: I('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.7 4H7.3a2 2 0 00-1.8 1.1z"/>'),
    users: I('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>'),
    target: I('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
    chart: I('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
    folder: I('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
    calendar: I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  };

  // ── nav definitions ──
  const NAV = {
    member: [
      { group: 'Work' },
      { id: 'dashboard', label: 'Dashboard', icon: 'home' },
      { id: 'report', label: 'Daily report', icon: 'report' },
      { id: 'tasks', label: 'My tasks', icon: 'tasks' },
      { id: 'units', label: 'My units & OKRs', icon: 'units' },
      { id: 'meetings', label: 'Meetings', icon: 'meeting' },
      { id: 'ideas', label: 'Idea & problem', icon: 'bulb' },
      { group: 'You' },
      { id: 'scores', label: 'My score sheet', icon: 'score' },
      { id: 'library', label: 'Library', icon: 'library' },
      { id: 'leave', label: 'Leave', icon: 'leave' },
      { id: 'channels', label: 'Channels', icon: 'chat' },
    ],
    admin: [
      { group: 'Overview' },
      { id: 'dashboard', label: 'Dashboard', icon: 'home' },
      { id: 'review', label: 'Review queue', icon: 'inbox', badge: 'reviewCount' },
      { group: 'Manage' },
      { id: 'users', label: 'Users', icon: 'users' },
      { id: 'units', label: 'Units & roles', icon: 'units' },
      { id: 'tasks', label: 'Tasks & OKRs', icon: 'target' },
      { id: 'meetings', label: 'Meetings', icon: 'meeting' },
      { id: 'ideas', label: 'Ideas & problems', icon: 'bulb' },
      { group: 'Performance' },
      { id: 'scores', label: 'Scores & periods', icon: 'chart' },
      { id: 'calendar', label: 'Calendar & leave', icon: 'calendar' },
      { group: 'Shared' },
      { id: 'library', label: 'Library admin', icon: 'folder' },
      { id: 'channels', label: 'Channels', icon: 'chat' },
    ],
  };
  window.DS.NAV = NAV;

  function renderNav() {
    const nav = $('#ds-nav');
    const items = isAdmin() ? NAV.admin : NAV.member;
    nav.innerHTML = items.map(it => it.group
      ? `<div class="nav-group-label">${it.group}</div>`
      : `<button class="nav-btn ${S.route === it.id ? 'active' : ''}" data-route="${it.id}" type="button" aria-current="${S.route === it.id ? 'page' : 'false'}">${window.DS.icons[it.icon]}<span>${it.label}</span>${it.badge ? `<span class="nav-badge hidden" id="nav-${it.badge}"></span>` : ''}</button>`
    ).join('');
    $$('.nav-btn', nav).forEach(b => b.addEventListener('click', () => navigate(b.dataset.route)));
    // mobile tabbar (member core actions)
    const tb = $('#ds-tabbar');
    const tabs = isAdmin()
      ? [['dashboard','home','Home'],['review','inbox','Review'],['scores','chart','Scores'],['users','users','Users'],['channels','chat','Chat']]
      : [['dashboard','home','Home'],['report','report','Report'],['tasks','tasks','Tasks'],['scores','score','Scores'],['channels','chat','Chat']];
    tb.innerHTML = tabs.map(([id, ic, lb]) =>
      `<button class="tb ${S.route === id ? 'active' : ''}" data-route="${id}" type="button" aria-label="${lb}">${window.DS.icons[ic]}<span>${lb}</span></button>`).join('');
    $$('.tb', tb).forEach(b => b.addEventListener('click', () => navigate(b.dataset.route)));
    // role switch
    $$('#role-switch button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.role === S.role));
    });
  }

  // ── router ──
  const ROUTES = {}; // id -> {title, sub, render}
  window.DS.registerRoute = (id, def) => { ROUTES[id] = def; };

  async function navigate(id) {
    S.route = id;
    const def = ROUTES[id] || ROUTES.dashboard;
    $('#page-title').textContent = def.title || '';
    $('#page-sub').textContent = def.sub || '';
    const action = def.action;
    $('#page-action').innerHTML = action ? (typeof action === 'function' ? action() : action) : '';
    renderNav();
    const view = $('#ds-view');
    view.innerHTML = `<div class="loading">Loading…</div>`;
    try { await def.render(view); } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="empty"><div class="big">Something went wrong</div><div class="hint">${esc(e.message || e)}</div><button class="btn sm" style="margin-top:12px" onclick="DS.navigate('${id}')">Retry</button></div>`;
    }
    loadReviewBadge();
    window.scrollTo({ top: 0 });
  }
  window.DS.navigate = navigate;

  // ── auth ──
  function renderLogin() {
    $('#auth-view').innerHTML = `
      <h2 style="margin-bottom:4px">Sign in</h2>
      <p class="muted small" style="margin-bottom:22px">Email and the password your admin gave you.</p>
      <div class="error-box hidden" id="login-error" style="margin-bottom:14px"></div>
      <form id="login-form" novalidate>
        <div class="field"><label class="label" for="li-email">Email</label><input class="input" id="li-email" type="email" required autocomplete="email" placeholder="you@company.com"></div>
        <div class="field"><label class="label" for="li-pass">Password</label><input class="input" id="li-pass" type="password" required autocomplete="current-password"></div>
        <button class="btn primary" style="width:100%" type="submit">Sign in</button>
      </form>`;
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#login-error');
      err.classList.remove('show');
      const { error } = await sb.auth.signInWithPassword({
        email: $('#li-email').value.trim(), password: $('#li-pass').value,
      });
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      await boot();
    });
  }

  async function fetchProfile() {
    const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
    S.profile = data || { id: S.user.id, email: S.user.email, access_level: 'Member', full_name: S.user.email };
  }

  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { renderLogin(); return; }
    S.user = session.user;
    S.session = session;
    await fetchProfile();
    if (S.profile.active === false) {
      await sb.auth.signOut();
      $('#auth-view').innerHTML = `<div class="error-box">This account has been deactivated. Contact an admin.</div>`;
      return;
    }
    $('#ds-auth').classList.add('hidden');
    $('#ds-app').classList.remove('hidden');
    if (S.profile.must_change_password) { $('#pw-modal').classList.add('open'); }
    // role: default Member unless admin toggles
    if (!isAdminProfile()) { $('#role-admin-btn').style.display = 'none'; S.role = 'Member'; }
    $('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pw-error');
      err.classList.remove('show');
      if ($('#pw1').value.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.classList.add('show'); return; }
      if ($('#pw1').value !== $('#pw2').value) { err.textContent = 'Passwords do not match.'; err.classList.add('show'); return; }
      const { error } = await sb.auth.updateUser({ password: $('#pw1').value });
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      await sb.from('profiles').update({ must_change_password: false }).eq('id', S.user.id);
      S.profile.must_change_password = false;
      $('#pw-modal').classList.remove('open');
      toast('Password updated.');
    });
    $$('#role-switch button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.role === 'Admin' && !isAdminProfile()) return;
      S.role = b.dataset.role;
      navigate('dashboard');
    }));
    $('#role-switch').addEventListener('click', () => setTimeout(loadReviewBadge, 0));
    $('#nav-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    $('#nav-profile').addEventListener('click', () => navigate('profile'));
    $('#nav-notif').addEventListener('click', () => navigate('notifications'));
    navigate('dashboard');
    loadNotifBadge();
  }

  async function loadNotifBadge() {
    if (!S.user) return;
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', S.user.id).eq('read', false);
    const b = $('#notif-badge');
    b.textContent = count || 0;
    b.classList.toggle('hidden', !count);
  }
  window.DS.loadNotifBadge = loadNotifBadge;

  // pending-review count for the admin sidebar badge
  async function loadReviewBadge() {
    const b = $('#nav-reviewCount');
    if (!b) return;
    if (!isAdmin()) { b.classList.add('hidden'); b.textContent = ''; return; }
    try {
      const [{ count: dr }, { count: fb }] = await Promise.all([
        sb.from('daily_reports').select('id', { count: 'exact', head: true }).eq('status', 'Submitted'),
        sb.from('weekly_feedback').select('id', { count: 'exact', head: true }).in('status', ['Submitted', 'Open']),
      ]);
      const n = (dr || 0) + (fb || 0);
      b.textContent = n || '';
      b.classList.toggle('hidden', !n);
    } catch (e) { b.classList.add('hidden'); }
  }
  window.DS.loadReviewBadge = loadReviewBadge;

  // register shared routes
  window.DS.registerRoute('notifications', { title: 'Notifications', sub: 'Score, report, leave, meeting and announcement updates', render: window.renderNotifications || (async (v) => { v.innerHTML = '<div class="loading">Loading…</div>'; if (window.renderNotifications) await window.renderNotifications(v); }) });
  window.DS.registerRoute('profile', { title: 'Profile', sub: 'Your account details', render: window.renderProfilePage || (async (v) => { v.innerHTML = '<div class="loading">Loading…</div>'; if (window.renderProfilePage) await window.renderProfilePage(v); }) });

  sb.auth.onAuthStateChange((_e, session) => { if (!session) return; });
  document.addEventListener('DOMContentLoaded', boot);
})();
