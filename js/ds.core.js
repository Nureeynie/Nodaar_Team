/* Nodaar DS — core: client, auth, router, shared UI helpers */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const SUPABASE_URL = (typeof window !== 'undefined' && (window.__ENV?.VITE_SUPABASE_URL || window.CONFIG?.SUPABASE_URL))
    || (typeof localStorage !== 'undefined' && localStorage.getItem('VITE_SUPABASE_URL'))
    || 'https://xzrczuoxlujzmztkupbz.supabase.co';
  const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && (window.__ENV?.VITE_SUPABASE_ANON_KEY || window.CONFIG?.SUPABASE_ANON_KEY))
    || (typeof localStorage !== 'undefined' && localStorage.getItem('VITE_SUPABASE_ANON_KEY'))
    || 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN';

  function createSb() {
    if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return null;
  }
  let rawSb = createSb();
  const sb = new Proxy({}, {
    get(_t, prop) {
      if (!rawSb) rawSb = createSb();
      if (!rawSb) throw new Error('Supabase client not initialized yet');
      const val = rawSb[prop];
      return typeof val === 'function' ? val.bind(rawSb) : val;
    }
  });

  const S = {
    get sb() { if (!rawSb) rawSb = createSb(); return rawSb || sb; },
    user: null, profile: null, role: 'Member',
    route: 'dashboard', loading: false,
  };
  window.DS = { $, $$, esc, S, get sb() { return S.sb; } };

  const todayLagos = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const fmtDT = (iso) => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const fmtD = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString([], { dateStyle: 'medium' }) : '—';
  window.DS.fmt = { todayLagos, fmtDT, fmtD };

  const isAdminProfile = () => S.profile?.access_level === 'Admin';
  const isAdmin = () => S.role === 'Admin' && isAdminProfile();
  window.DS.auth = {
    isAdmin,
    isAdminProfile,
    get signOut() { return signOut; },
    get executeSignIn() { return executeSignIn; },
    get boot() { return boot; }
  };
  window.DS.signOut = (...args) => signOut(...args);

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
      notes_link: m.drive_notes_link || m.minutes || null,
      minutes: m.minutes || m.drive_notes_link || null,
      agenda: m.agenda || m.description || null,
    };
  }
  window.DS.meeting = normaliseMeeting;

  window.DS.nameOf = (p) => (p && (p.full_name || p.email)) || 'Unknown';
  window.DS.lateBy = function (minutes) {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const parts = [];
    if (h) parts.push(h + 'h');
    if (m || !h) parts.push(m + 'm');
    return parts.join(' ');
  };

  // ── toast ──
  let toastEl;
  function toast(msg, typeOrIsErr) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    const isErr = typeOrIsErr === true || typeOrIsErr === 'error';
    const isSuccess = typeOrIsErr === 'success' || (!isErr && (
      /success|saved|submitted|updated|created|done/i.test(String(msg || ''))
    ));

    let bg = '#07192F';
    let borderLeft = '4px solid #FE8A03';
    let icon = '';
    if (isErr) {
      bg = '#C4321C';
      borderLeft = '4px solid #FCA5A5';
      icon = '✕ ';
    } else if (isSuccess) {
      bg = '#166534';
      borderLeft = '4px solid #86EFAC';
      icon = '✓ ';
    }

    toastEl.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bg};
      color: #FFFFFF;
      padding: 12px 22px;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 700;
      z-index: 9999;
      max-width: 90vw;
      box-shadow: 0 14px 34px rgba(7,25,47,0.32);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid rgba(255,255,255,0.16);
      border-left: ${borderLeft};
      pointer-events: none;
    `;
    const cleanMsg = String(msg || '');
    toastEl.textContent = cleanMsg.startsWith('✓') || cleanMsg.startsWith('✕') ? cleanMsg : icon + cleanMsg;
    toastEl.style.display = 'flex';
    toastEl.style.opacity = '1';
    toastEl.style.visibility = 'visible';

    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.visibility = 'hidden';
      toastEl.style.display = 'none';
    }, 3200);
  }
  toast.success = (m) => toast(m, 'success');
  toast.error = (m) => toast(m, 'error');
  window.DS.toast = toast;

  // ── modal ──
  function openModal(html) {
    $('#modal-box').innerHTML = html;
    $('#modal-root').classList.add('open');
  }
  function closeModal() {
    $('#modal-root')?.classList.remove('open');
  }
  $('#modal-root')?.addEventListener('click', (e) => { if (e.target.id === 'modal-root') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#modal-root')?.classList.contains('open')) closeModal();
      else closeDrawer();
    }
  });
  window.DS.modal = { open: openModal, close: closeModal };

  window.DS.promptModal = function ({
    title = 'Input required',
    subtitle = '',
    label = 'Details',
    placeholder = '',
    type = 'text',
    multiline = false,
    defaultValue = '',
    required = true,
    minLength = 0,
    confirmLabel = 'Save',
    cancelLabel = 'Cancel',
  } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(val);
      };
      const fieldHtml = multiline
        ? `<textarea class="input" id="ds-prompt-input" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>${esc(defaultValue)}</textarea>`
        : `<input class="input" id="ds-prompt-input" type="${esc(type)}" value="${esc(defaultValue)}" placeholder="${esc(placeholder)}" ${minLength ? `minlength="${minLength}"` : ''} ${required ? 'required' : ''}>`;

      openModal(`
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">
          <div>
            <h2 style="margin:0;font-size:18px">${esc(title)}</h2>
            ${subtitle ? `<p class="muted small" style="margin:4px 0 0">${esc(subtitle)}</p>` : ''}
          </div>
          <button type="button" class="btn sm ghost" id="ds-prompt-x" aria-label="Close" style="padding:4px 8px">✕</button>
        </div>
        <form id="ds-prompt-form" novalidate>
          <div class="field">
            <label class="label" for="ds-prompt-input">${esc(label)}</label>
            ${fieldHtml}
            <div class="form-error" id="ds-prompt-err" role="alert" aria-live="polite"></div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" class="btn" id="ds-prompt-cancel">${esc(cancelLabel)}</button>
            <button type="submit" class="btn primary">${esc(confirmLabel)}</button>
          </div>
        </form>
      `);

      const input = $('#ds-prompt-input');
      const err = $('#ds-prompt-err');
      setTimeout(() => { input?.focus(); input?.select?.(); }, 10);

      $('#ds-prompt-x')?.addEventListener('click', () => finish(null));
      $('#ds-prompt-cancel')?.addEventListener('click', () => finish(null));
      $('#ds-prompt-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        err?.classList.remove('show');
        const val = (input?.value || '').trim();
        if (required && !val) {
          if (err) { err.textContent = `${label} is required.`; err.classList.add('show'); }
          input?.focus();
          return;
        }
        if (minLength && val.length < minLength) {
          if (err) { err.textContent = `Must be at least ${minLength} characters.`; err.classList.add('show'); }
          input?.focus();
          return;
        }
        finish(val);
      });
    });
  };

  window.DS.confirmModal = function ({
    title = 'Confirm action',
    message = 'Are you sure you want to continue?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    isAlert = false,
  } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(val);
      };
      openModal(`
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px">
          <h2 style="margin:0;font-size:18px">${esc(title)}</h2>
          <button type="button" class="btn sm ghost" id="ds-conf-x" aria-label="Close" style="padding:4px 8px">✕</button>
        </div>
        <p class="small muted" style="margin-bottom:20px;line-height:1.55">${esc(message)}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn" id="ds-conf-no">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${isAlert ? 'alert' : 'primary'}" id="ds-conf-yes">${esc(confirmLabel)}</button>
        </div>
      `);
      $('#ds-conf-x')?.addEventListener('click', () => finish(false));
      $('#ds-conf-no')?.addEventListener('click', () => finish(false));
      $('#ds-conf-yes')?.addEventListener('click', () => finish(true));
      setTimeout(() => $('#ds-conf-yes')?.focus(), 10);
    });
  };

  window.DS.getInitials = function (name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (!parts.length || !parts[0]) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  window.DS.showDetailsModal = function ({ title, subtitle, badgeHtml, rows, actions = [] }) {
    const cleanActions = (actions || []).filter(Boolean);
    const actionHtml = cleanActions.map((a, idx) => {
      if (typeof a === 'string') return a;
      if (a.href) {
        return `<a class="btn sm ${esc(a.className || '')}" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)}</a>`;
      }
      return `<button type="button" class="btn sm ${esc(a.className || '')}" data-modal-act="${idx}">${esc(a.label)}</button>`;
    }).join('');

    const html = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line-soft)">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <h2 style="margin:0;font-size:18px;line-height:1.3;word-break:normal;overflow-wrap:break-word">${esc(title)}</h2>
            ${badgeHtml || ''}
          </div>
          ${subtitle ? `<p class="muted small" style="margin:4px 0 0;word-break:normal;overflow-wrap:break-word">${esc(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="btn sm ghost" onclick="window.DS.modal.close()" aria-label="Close" style="padding:4px 8px;font-size:16px;line-height:1;flex-shrink:0">✕</button>
      </div>
      <dl class="kv" style="margin-bottom:20px">
        ${(rows || []).map(r => `
          <dt>${esc(r.label)}</dt>
          <dd style="word-break:normal;overflow-wrap:break-word">${r.isHtml ? r.value : esc(r.value || '—')}</dd>
        `).join('')}
      </dl>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:14px;border-top:1px solid var(--line-soft);flex-wrap:wrap">
        ${actionHtml}
        <button type="button" class="btn sm" onclick="window.DS.modal.close()">Close</button>
      </div>
    `;
    window.DS.modal.open(html);
    const box = $('#modal-box');
    cleanActions.forEach((a, idx) => {
      if (a && typeof a === 'object' && typeof a.onClick === 'function') {
        box?.querySelector(`[data-modal-act="${idx}"]`)?.addEventListener('click', async () => {
          closeModal();
          await a.onClick();
        });
      }
    });
  };

  window.DS.generateTempPassword = function () {
    const words = ['Nodaar', 'Team', 'Hub', 'Star', 'Peak', 'Core'];
    const w = words[Math.floor(Math.random() * words.length)];
    const num = String(Math.floor(1000 + Math.random() * 9000));
    return `${w}@${num}`;
  };

  window.DS.renderMemberPicker = function ({ id, people = [], selectedIds = [], emptyHint = 'No team members available.' } = {}) {
    const selSet = new Set(selectedIds || []);
    const activeCount = (people || []).filter(p => selSet.has(p.id)).length;
    if (!people.length) {
      return `<div class="empty" style="padding:18px"><div class="hint" style="margin:0">${esc(emptyHint)}</div></div>`;
    }
    return `
      <div class="picker-box" id="${esc(id)}-box">
        <div class="picker-head">
          <span class="tag brand" id="${esc(id)}-count">${activeCount} selected</span>
          <div class="picker-actions">
            <button type="button" class="btn sm ghost" data-pk-all="${esc(id)}" style="min-height:28px;padding:2px 8px;font-size:11.5px">Select all</button>
            <button type="button" class="btn sm ghost" data-pk-clear="${esc(id)}" style="min-height:28px;padding:2px 8px;font-size:11.5px">Clear</button>
          </div>
        </div>
        <div class="picker-search-wrap">
          <input type="search" class="picker-search" id="${esc(id)}-search" placeholder="Search members by name or email…" aria-label="Search members">
        </div>
        <div class="picker-list" id="${esc(id)}-list">
          ${people.map(p => {
            const nm = window.DS.nameOf(p);
            const checked = selSet.has(p.id) ? 'checked' : '';
            const searchTxt = `${nm} ${p.email || ''} ${p.access_level || ''}`.toLowerCase();
            return `
              <label class="picker-row" data-pk-search="${esc(searchTxt)}">
                <input type="checkbox" data-pk-item="${esc(id)}" value="${p.id}" ${checked}>
                <span class="picker-mini-avatar">${esc(window.DS.getInitials(nm))}</span>
                <span class="picker-row-info">
                  <span class="picker-row-name">${esc(nm)}</span>
                  <span class="picker-row-sub">${esc(p.email || '')}${p.access_level ? ' · ' + esc(p.access_level) : ''}</span>
                </span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  window.DS.bindMemberPicker = function (container, id) {
    const root = container || document;
    const box = root.querySelector(`#${id}-box`);
    if (!box) return { getSelected: () => [], setSelected: () => {} };

    const updateCount = () => {
      const n = box.querySelectorAll(`input[data-pk-item="${id}"]:checked`).length;
      const badge = box.querySelector(`#${id}-count`);
      if (badge) badge.textContent = `${n} selected`;
    };

    box.querySelector(`#${id}-search`)?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      box.querySelectorAll('.picker-row').forEach(r => {
        r.style.display = !q || (r.dataset.pkSearch || '').includes(q) ? 'flex' : 'none';
      });
    });

    box.querySelector(`[data-pk-all="${id}"]`)?.addEventListener('click', () => {
      box.querySelectorAll('.picker-row').forEach(r => {
        if (r.style.display !== 'none') {
          const cb = r.querySelector(`input[data-pk-item="${id}"]`);
          if (cb) cb.checked = true;
        }
      });
      updateCount();
    });

    box.querySelector(`[data-pk-clear="${id}"]`)?.addEventListener('click', () => {
      box.querySelectorAll(`input[data-pk-item="${id}"]`).forEach(cb => { cb.checked = false; });
      updateCount();
    });

    box.addEventListener('change', (e) => {
      if (e.target.matches(`input[data-pk-item="${id}"]`)) updateCount();
    });

    return {
      getSelected: () => [...box.querySelectorAll(`input[data-pk-item="${id}"]:checked`)].map(cb => cb.value),
      setSelected: (ids) => {
        const set = new Set(ids || []);
        box.querySelectorAll(`input[data-pk-item="${id}"]`).forEach(cb => { cb.checked = set.has(cb.value); });
        updateCount();
      },
    };
  };

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
    dots: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/></svg>`,
  };

  // ── Action Dropdown Menus (Three dots) ──
  window.DS.renderActionMenu = function (actions = []) {
    const list = (actions || []).filter(Boolean);
    if (!list.length) return '';
    return `
      <div class="action-menu-wrap">
        <button class="action-dots-btn" type="button" aria-label="Actions" title="More actions">
          ${window.DS.icons.dots}
        </button>
        <div class="action-dropdown hidden">
          ${list.map(a => {
            if (a.divider) return `<div class="action-divider"></div>`;
            return `
              <button type="button" class="action-item ${a.isAlert ? 'alert' : ''}" ${a.attrs || ''} ${a.disabled ? 'disabled' : ''} title="${esc(a.title || a.label || '')}">
                ${a.icon ? `<span class="action-item-icon">${a.icon}</span>` : ''}
                <span>${esc(a.label || '')}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  window.DS.initActionMenus = function (container = document) {
    const btns = container.querySelectorAll('.action-dots-btn');
    btns.forEach(btn => {
      if (btn._hasActionMenu) return;
      btn._hasActionMenu = true;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.action-menu-wrap');
        if (!wrap) return;
        const dropdown = wrap.querySelector('.action-dropdown');
        if (!dropdown) return;

        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.action-dropdown:not(.hidden)').forEach(d => {
          d.classList.add('hidden');
          d.closest('.action-menu-wrap')?.querySelector('.action-dots-btn')?.classList.remove('active');
        });

        if (isHidden) {
          dropdown.classList.remove('hidden');
          btn.classList.add('active');

          // Fixed positioning to prevent clipping inside .table-wrap or overflow containers
          const rect = btn.getBoundingClientRect();
          const dWidth = dropdown.offsetWidth || 190;
          const dHeight = dropdown.offsetHeight || 160;

          dropdown.style.position = 'fixed';
          dropdown.style.zIndex = '9999';

          // Align right edge to button's right edge
          const rightEdge = window.innerWidth - rect.right;
          if (rightEdge < 10) {
            dropdown.style.right = '10px';
            dropdown.style.left = 'auto';
          } else if (rect.right - dWidth < 10) {
            dropdown.style.left = '10px';
            dropdown.style.right = 'auto';
          } else {
            dropdown.style.right = rightEdge + 'px';
            dropdown.style.left = 'auto';
          }

          // Vertical placement
          if (rect.bottom + dHeight > window.innerHeight - 15) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
            dropdown.classList.add('drop-up');
          } else {
            dropdown.style.bottom = 'auto';
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.classList.remove('drop-up');
          }
        }
      });
    });
  };

  if (!window._dsActionScrollBound) {
    window._dsActionScrollBound = true;
    window.addEventListener('scroll', () => {
      document.querySelectorAll('.action-dropdown:not(.hidden)').forEach(d => {
        d.classList.add('hidden');
        d.closest('.action-menu-wrap')?.querySelector('.action-dots-btn')?.classList.remove('active');
      });
    }, { passive: true, capture: true });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-dropdown') && !e.target.closest('.action-dots-btn')) {
      document.querySelectorAll('.action-dropdown:not(.hidden)').forEach(d => {
        d.classList.add('hidden');
        d.closest('.action-menu-wrap')?.querySelector('.action-dots-btn')?.classList.remove('active');
      });
    }
  });

  // ── Table Pagination (25 items per page) ──
  window.DS.paginate = function (items, page = 1, pageSize = 25) {
    const list = items || [];
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const curPage = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
    const start = (curPage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const pagedItems = list.slice(start, end);

    function renderBar(pgKey = 'pg') {
      if (total <= pageSize) return '';
      return `
        <div class="table-pagination" data-pg-key="${pgKey}">
          <div class="table-pagination-info">Showing <b>${start + 1}–${end}</b> of <b>${total}</b> items</div>
          <div class="table-pagination-btns">
            <button class="btn sm ghost" data-pg-target="${curPage - 1}" ${curPage <= 1 ? 'disabled' : ''}>
              ← Previous
            </button>
            <span class="small" style="font-weight:700;padding:0 8px">Page ${curPage} of ${totalPages}</span>
            <button class="btn sm ghost" data-pg-target="${curPage + 1}" ${curPage >= totalPages ? 'disabled' : ''}>
              Next →
            </button>
          </div>
        </div>
      `;
    }

    return {
      items: pagedItems,
      totalPages,
      curPage,
      total,
      start,
      end,
      renderBar,
    };
  };

  window.DS.bindPagination = function (container, onPageChange) {
    if (!container) return;
    container.querySelectorAll('[data-pg-target]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const p = parseInt(b.dataset.pgTarget, 10);
        if (p > 0 && typeof onPageChange === 'function') {
          onPageChange(p);
        }
      });
    });
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

  function closeDrawer() {
    $('#ds-mobile-drawer')?.classList.add('hidden');
    $('#ds-drawer-backdrop')?.classList.add('hidden');
  }
  window.DS.closeDrawer = closeDrawer;

  function renderUserBadge() {
    const name = S.profile?.full_name || S.user?.email || 'Team member';
    const sub = S.profile?.access_level ? `${S.profile.access_level} · ${S.profile?.email || ''}` : (S.user?.email || '');
    const initials = window.DS.getInitials(name);
    const html = `
      <div class="sidebar-avatar">${esc(initials)}</div>
      <div class="sidebar-user-meta">
        <div class="sidebar-user-name">${esc(name)}</div>
        <div class="sidebar-user-sub">${esc(sub)}</div>
      </div>
    `;
    ['#sidebar-user', '#drawer-user'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.innerHTML = html;
      el.classList.toggle('hidden', !S.user);
    });
  }

  function renderNav() {
    renderUserBadge();
    const nav = $('#ds-nav');
    const drawerNav = $('#ds-drawer-nav');
    const items = isAdmin() ? NAV.admin : NAV.member;
    const navHtml = items.map(it => it.group
      ? `<div class="nav-group-label">${it.group}</div>`
      : `<button class="nav-btn ${S.route === it.id ? 'active' : ''}" data-route="${it.id}" type="button" aria-current="${S.route === it.id ? 'page' : 'false'}">${window.DS.icons[it.icon]}<span>${it.label}</span>${it.badge ? `<span class="nav-badge hidden" id="nav-${it.badge}"></span>` : ''}</button>`
    ).join('');

    if (nav) {
      nav.innerHTML = navHtml;
      $$('.nav-btn', nav).forEach(b => b.addEventListener('click', () => navigate(b.dataset.route)));
    }

    if (drawerNav) {
      drawerNav.innerHTML = navHtml;
      $$('.nav-btn', drawerNav).forEach(b => b.addEventListener('click', () => {
        closeDrawer();
        navigate(b.dataset.route);
      }));
    }

    $('#nav-notif')?.classList.toggle('active', S.route === 'notifications');
    $('#nav-profile')?.classList.toggle('active', S.route === 'profile');
    $('#drawer-profile')?.classList.toggle('active', S.route === 'profile');

    // Mobile drawer open/close
    const drawer = $('#ds-mobile-drawer');
    const backdrop = $('#ds-drawer-backdrop');
    const openBtn = $('#mobile-menu-btn');
    const closeBtn = $('#drawer-close-btn');

    function openDrawer() {
      drawer?.classList.remove('hidden');
      backdrop?.classList.remove('hidden');
    }

    if (openBtn && !openBtn._boundDrawer) {
      openBtn._boundDrawer = true;
      openBtn.addEventListener('click', openDrawer);
      closeBtn?.addEventListener('click', closeDrawer);
      backdrop?.addEventListener('click', closeDrawer);
    }

    // Mobile header role tag & notifications
    const mobileRoleTag = $('#mobile-role-tag');
    if (mobileRoleTag) mobileRoleTag.textContent = S.role;
    const mobileNotifBtn = $('#mobile-notif-btn');
    if (mobileNotifBtn && !mobileNotifBtn._boundNotif) {
      mobileNotifBtn._boundNotif = true;
      mobileNotifBtn.addEventListener('click', () => navigate('notifications'));
    }
    const drawerProfile = $('#drawer-profile');
    if (drawerProfile && !drawerProfile._boundProfile) {
      drawerProfile._boundProfile = true;
      drawerProfile.addEventListener('click', () => { closeDrawer(); navigate('profile'); });
    }
    const drawerLogout = $('#drawer-logout');
    if (drawerLogout && !drawerLogout._boundLogout) {
      drawerLogout._boundLogout = true;
      drawerLogout.addEventListener('click', () => { closeDrawer(); signOut(); });
    }

    // mobile tabbar (member core actions)
    const tb = $('#ds-tabbar');
    const tabs = isAdmin()
      ? [['dashboard','home','Home'],['review','inbox','Review'],['scores','chart','Scores'],['users','users','Users'],['channels','chat','Chat']]
      : [['dashboard','home','Home'],['report','report','Report'],['tasks','tasks','Tasks'],['scores','score','Scores'],['channels','chat','Chat']];
    tb.innerHTML = tabs.map(([id, ic, lb]) =>
      `<button class="tb ${S.route === id ? 'active' : ''}" data-route="${id}" type="button" aria-label="${lb}">${window.DS.icons[ic]}<span>${lb}</span></button>`).join('');
    $$('.tb', tb).forEach(b => b.addEventListener('click', () => navigate(b.dataset.route)));

    // role switches (sidebar & mobile drawer)
    const setRole = (role) => {
      if (role === 'Admin' && !isAdminProfile()) return;
      S.role = role;
      const adminOnly = ['review', 'users', 'calendar'];
      const target = (role === 'Member' && adminOnly.includes(S.route)) ? 'dashboard' : S.route;
      navigate(target);
    };
    $$('#role-switch button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.role === S.role));
      if (!b._boundRole) {
        b._boundRole = true;
        b.addEventListener('click', () => setRole(b.dataset.role));
      }
    });
    $$('#drawer-role-switch button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.role === S.role));
      if (!b._boundRole) {
        b._boundRole = true;
        b.addEventListener('click', () => {
          setRole(b.dataset.role);
          closeDrawer();
        });
      }
    });
  }
  window.DS.renderNav = renderNav;

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
    try {
      await def.render(view);
      window.DS.initActionMenus(view);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="empty"><div class="big">Something went wrong</div><div class="hint">${esc(e.message || e)}</div><button class="btn sm" style="margin-top:12px" onclick="DS.navigate('${id}')">Retry</button></div>`;
    }
    loadReviewBadge();
    window.scrollTo({ top: 0 });
  }
  window.DS.navigate = navigate;

  // ── auth ──
  let authBound = false;
  function initAuth() {
    if (authBound) return;
    authBound = true;

    const emailInput = $('#li-email');
    const pwInput = $('#li-pass');
    const savedEmail = (typeof localStorage !== 'undefined' && localStorage.getItem('nodaar_auth_email')) || '';
    if (emailInput && !emailInput.value && savedEmail) {
      emailInput.value = savedEmail;
    }

    const toggleBtn = $('#toggle-pw-btn');
    toggleBtn?.addEventListener('click', () => {
      if (!pwInput) return;
      const isPw = pwInput.type === 'password';
      pwInput.type = isPw ? 'text' : 'password';
      toggleBtn.textContent = isPw ? 'Hide' : 'Show';
    });

    $('#login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput ? emailInput.value.trim() : '';
      const password = pwInput ? pwInput.value : '';
      if (!email || !password) {
        const err = $('#login-error');
        if (err) {
          err.textContent = 'Please enter both your work email and password.';
          err.classList.remove('hidden');
          err.classList.add('show');
        }
        return;
      }
      await executeSignIn(email, password);
    });
  }

  // Unified Sign Out
  async function signOut() {
    try {
      toast('Signing out…');
      closeDrawer();
      if (S.sb?.auth?.signOut) {
        await S.sb.auth.signOut();
      }
    } catch (err) {
      console.warn('[Nodaar] Sign out error:', err);
    } finally {
      S.user = null;
      S.session = null;
      S.profile = null;
      S.role = 'Member';

      // Clear token keys from localStorage so stale tokens do not persist
      try {
        if (typeof localStorage !== 'undefined') {
          const toRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('sb-') || k.includes('supabase.auth.token'))) {
              toRemove.push(k);
            }
          }
          toRemove.forEach(k => localStorage.removeItem(k));
        }
      } catch (_) {}

      $('#ds-app')?.classList.add('hidden');
      $('#ds-auth')?.classList.remove('hidden');

      const submitBtn = $('#login-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
        submitBtn.style.background = '';
        submitBtn.style.borderColor = '';
        submitBtn.style.color = '';
      }
      const pwInput = $('#li-pass');
      if (pwInput) pwInput.value = '';
      const err = $('#login-error');
      if (err) {
        err.textContent = '';
        err.classList.add('hidden');
        err.classList.remove('show');
      }
      toast('Signed out successfully');
      setTimeout(() => {
        window.location.reload();
      }, 150);
    }
  }

  // Execute Sign In
  async function executeSignIn(email, password) {
    const err = $('#login-error');
    const submitBtn = $('#login-submit-btn');
    if (err) {
      err.classList.remove('show');
      err.classList.add('hidden');
      err.textContent = '';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
      submitBtn.style.background = '';
      submitBtn.style.borderColor = '';
      submitBtn.style.color = '';
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nodaar_auth_email', email);
      }
      const client = S.sb;
      if (!client) throw new Error('Supabase client is not ready. Please refresh.');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (err) {
          err.textContent = error.message;
          err.classList.remove('hidden');
          err.classList.add('show');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
          submitBtn.style.background = '';
          submitBtn.style.borderColor = '';
          submitBtn.style.color = '';
        }
        toast(error.message, true);
        return;
      }
      toast('Successfully logged in');
      if (submitBtn) {
        submitBtn.textContent = '✓ Successfully logged in';
        submitBtn.style.background = '#166534';
        submitBtn.style.borderColor = '#166534';
        submitBtn.style.color = '#FFFFFF';
      }
      await boot(data?.session);
    } catch (e) {
      if (err) {
        err.textContent = e.message || 'Error signing in. Please check your network connection.';
        err.classList.remove('hidden');
        err.classList.add('show');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
        submitBtn.style.background = '';
        submitBtn.style.borderColor = '';
        submitBtn.style.color = '';
      }
      toast(e.message || 'Error signing in', true);
    }
  }

  async function fetchProfile() {
    try {
      const { data, error } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
      if (error) {
        console.warn('[Nodaar] Profile fetch warning:', error.message);
      }
      S.profile = data || { id: S.user.id, email: S.user.email, access_level: 'Member', full_name: S.user.email };
    } catch (err) {
      console.warn('[Nodaar] Profile fetch exception:', err);
      S.profile = { id: S.user.id, email: S.user.email, access_level: 'Member', full_name: S.user.email };
    }
  }

  let appEventsBound = false;
  function bindAppEvents() {
    if (appEventsBound) return;
    appEventsBound = true;

    $('#pw-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pw-error');
      if (err) err.classList.remove('show');
      const p1 = $('#pw1')?.value;
      const p2 = $('#pw2')?.value;
      if (!p1 || p1.length < 6) {
        if (err) { err.textContent = 'Password must be at least 6 characters.'; err.classList.add('show'); }
        return;
      }
      if (p1 !== p2) {
        if (err) { err.textContent = 'Passwords do not match.'; err.classList.add('show'); }
        return;
      }
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) {
        if (err) { err.textContent = error.message; err.classList.add('show'); }
        return;
      }
      await sb.from('profiles').update({ must_change_password: false }).eq('id', S.user.id);
      S.profile.must_change_password = false;
      $('#pw-modal')?.classList.remove('open');
      toast('Password updated.');
    });

    $('#pw-signout-btn')?.addEventListener('click', () => {
      $('#pw-modal')?.classList.remove('open');
      signOut();
    });

    $('#nav-logout')?.addEventListener('click', () => signOut());
    $('#nav-profile')?.addEventListener('click', () => navigate('profile'));
    $('#nav-notif')?.addEventListener('click', () => navigate('notifications'));
  }

  let isBooting = false;
  async function boot(forcedSession) {
    if (isBooting && !forcedSession) return;
    isBooting = true;
    initAuth();
    const client = S.sb;
    if (!client) {
      console.warn('[Nodaar] Supabase client not ready yet');
      isBooting = false;
      return;
    }
    try {
      let session = forcedSession;
      if (!session) {
        const { data: sessData, error: sessErr } = await client.auth.getSession();
        if (sessErr || !sessData?.session) {
          $('#ds-auth')?.classList.remove('hidden');
          $('#ds-app')?.classList.add('hidden');
          const submitBtn = $('#login-submit-btn');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in';
            submitBtn.style.background = '';
            submitBtn.style.borderColor = '';
          }
          isBooting = false;
          return;
        }
        session = sessData.session;
      }
      S.user = session.user;
      S.session = session;
      await fetchProfile();
      if (S.profile?.active === false) {
        await signOut();
        const err = $('#login-error');
        if (err) {
          err.textContent = 'This account has been deactivated. Contact an admin.';
          err.classList.remove('hidden');
          err.classList.add('show');
        }
        isBooting = false;
        return;
      }
      $('#ds-auth')?.classList.add('hidden');
      $('#ds-app')?.classList.remove('hidden');
      if (S.profile?.must_change_password) {
        $('#pw-modal')?.classList.add('open');
      }
      if (isAdminProfile()) {
        S.role = 'Admin';
        const btn = $('#role-admin-btn');
        if (btn) btn.style.display = '';
        const drawerBtn = $('#drawer-role-admin-btn');
        if (drawerBtn) drawerBtn.style.display = '';
      } else {
        S.role = 'Member';
        const btn = $('#role-admin-btn');
        if (btn) btn.style.display = 'none';
        const drawerBtn = $('#drawer-role-admin-btn');
        if (drawerBtn) drawerBtn.style.display = 'none';
      }
      bindAppEvents();
      navigate(S.route || 'dashboard');
      loadNotifBadge();
    } catch (e) {
      console.error('[Nodaar] Boot error:', e);
      const submitBtn = $('#login-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
        submitBtn.style.background = '';
        submitBtn.style.borderColor = '';
        submitBtn.style.color = '';
      }
      const err = $('#login-error');
      if (err) {
        err.textContent = e.message || 'Error initializing workspace. Please try again.';
        err.classList.remove('hidden');
        err.classList.add('show');
      }
      $('#ds-auth')?.classList.remove('hidden');
      $('#ds-app')?.classList.add('hidden');
    } finally {
      isBooting = false;
    }
  }

  async function loadNotifBadge() {
    if (!S.user) return;
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', S.user.id).eq('read', false);
    ['#notif-badge', '#mobile-notif-badge'].forEach((sel) => {
      const b = $(sel);
      if (!b) return;
      b.textContent = count || 0;
      b.classList.toggle('hidden', !count);
    });
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

  window.DS.boot = boot;
  window.DS.initAuth = initAuth;

  sb.auth?.onAuthStateChange?.((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      S.user = null;
      S.session = null;
      S.profile = null;
      S.role = 'Member';
      $('#ds-app')?.classList.add('hidden');
      $('#ds-auth')?.classList.remove('hidden');
      const submitBtn = $('#login-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
        submitBtn.style.background = '';
        submitBtn.style.borderColor = '';
        submitBtn.style.color = '';
      }
    } else if (event === 'SIGNED_IN' && session) {
      if (!$('#ds-app') || $('#ds-app').classList.contains('hidden')) {
        boot(session);
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAuth();
      boot();
    });
  } else {
    initAuth();
    boot();
  }
})();
