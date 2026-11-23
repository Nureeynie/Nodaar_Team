/* Phase 6 — Notifications bell + unit/announcement channel helpers */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sb = () => window.sbClient;
  const uid = () => window.currentUser?.id;

  // ── Notifications ──
  async function loadNotifs() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    if (!list) return;
    const { data } = await sb().from('notifications').select('*').eq('user_id', uid()).order('created_at', { ascending: false }).limit(30);
    const unread = (data || []).filter(n => !n.read).length;
    if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
    list.innerHTML = (data && data.length) ? data.map(n => `
      <button onclick="window.openNotif('${n.id}','${esc(n.link_tab || '')}')" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition ${n.read ? 'opacity-60' : 'bg-brand-50/50'}">
        <p class="text-xs font-bold text-navy-900">${esc(n.title)}</p>
        ${n.body ? `<p class="text-[11px] text-slate-500 mt-0.5">${esc(n.body)}</p>` : ''}
        <p class="text-[10px] text-slate-400 mt-0.5">${new Date(n.created_at).toLocaleString([], { dateStyle:'short', timeStyle:'short' })}</p>
      </button>`).join('')
      : '<p class="px-3 py-6 text-center text-xs text-slate-400">No notifications yet.</p>';
  }

  window.openNotif = async function (id, tab) {
    await sb().from('notifications').update({ read: true }).eq('id', id);
    document.getElementById('notif-panel')?.classList.add('hidden');
    if (tab && window.navigate) window.navigate(tab);
    loadNotifs();
  };

  window.markAllNotifsRead = async function () {
    await sb().from('notifications').update({ read: true }).eq('user_id', uid()).eq('read', false);
    loadNotifs();
  };

  // helper for other modules to create a notification
  window.notify = async function (userId, type, title, body, linkTab) {
    try {
      await sb().from('notifications').insert({ user_id: userId, type, title, body: body || null, link_tab: linkTab || null });
    } catch (e) { /* non-fatal */ }
  };

  // ── Channel helpers: create unit/announcement channels from admin ──
  window.openCreateChannelModal = window.openCreateChannelModal || async function () {
    const { data: units } = await sb().from('units').select('id,name').order('name');
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = 'New Channel';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Channel name *</label>
        <input id="ch-name" required placeholder="e.g. design-crit" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Display name</label>
        <input id="ch-display" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Kind</label>
        <select id="ch-kind" class="w-full text-xs p-3 rounded-xl border border-slate-200">
          <option value="general">💬 General (everyone)</option>
          <option value="unit">🏢 Unit-private…</option>
          <option value="announcements">📢 Announcements (admin-only posting)</option>
        </select></div>
      <div id="ch-unit-wrap" class="hidden"><label class="block text-xs font-bold text-slate-600 mb-1">Unit</label>
        <select id="ch-unit" class="w-full text-xs p-3 rounded-xl border border-slate-200">
          ${(units||[]).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}
        </select></div>
      <label class="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" id="ch-private"> Private (members only)</label>`;
    document.getElementById('ch-kind').onchange = (e) => {
      document.getElementById('ch-unit-wrap').classList.toggle('hidden', e.target.value !== 'unit');
    };
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const kind = document.getElementById('ch-kind').value;
      const name = document.getElementById('ch-name').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const { data, error } = await sb().from('channels').insert({
        name,
        display_name: document.getElementById('ch-display').value.trim() || name,
        description: '',
        icon: kind === 'announcements' ? '📢' : kind === 'unit' ? '🏢' : '💬',
        is_private: document.getElementById('ch-private').checked || kind !== 'general',
        kind,
        unit_id: kind === 'unit' ? document.getElementById('ch-unit').value : null,
      }).select().single();
      if (error) return alert(error.message);
      if (kind === 'unit' && data.unit_id) {
        await sb().from('channel_members').insert(
          (await sb().from('unit_members').select('user_id').eq('unit_id', data.unit_id)).data.map(m => ({ channel_id: data.id, user_id: m.user_id }))
        );
      }
      await sb().from('audit_log').insert({ actor_id: uid(), action: 'channel_created', target: 'channels:' + data.id });
      window.closeActionModal();
      window.loadChannels && window.loadChannels();
    };
    modal.classList.remove('hidden');
  };

  // hook: refresh notifications when bell opens + on load
  document.addEventListener('DOMContentLoaded', () => setTimeout(loadNotifs, 1500));
  const origToggle = window.toggleNotifPanel;
  if (typeof origToggle === 'function') {
    window.toggleNotifPanel = function (...a) { const r = origToggle.apply(this, a); loadNotifs(); return r; };
  }
})();
