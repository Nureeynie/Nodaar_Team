/* Phase 1 — Units & Structure: CRUD units, positions, multi-membership */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  async function sb() { return window.sbClient; }

  window.loadUnits = async function () {
    const c = document.getElementById('units-container');
    if (!c) return;
    c.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Loading units…</div>`;
    const client = await sb();
    const [{ data: units }, { data: memberships }, { data: profiles }, { data: positions }] = await Promise.all([
      client.from('units').select('*').order('name'),
      client.from('unit_members').select('*, positions(title)'),
      client.from('profiles').select('id, full_name, email, active').eq('active', true).order('full_name'),
      client.from('positions').select('*').order('title'),
    ]);
    const isAdmin = window.isUserAdmin ? window.isUserAdmin() : false;
    if (!units || !units.length) {
      c.innerHTML = `<div class="py-10 text-center">
        <div class="text-3xl mb-2">🏢</div>
        <p class="text-sm font-bold text-navy-900">No units yet</p>
        <p class="text-xs text-slate-400 mt-1">Create your first unit (e.g. Operations, Engineering, Marketing).</p>
      </div>`;
      return;
    }
    c.innerHTML = units.map(u => {
      const mem = (memberships || []).filter(m => m.unit_id === u.id);
      const lead = (profiles || []).find(p => p.id === u.lead_id);
      return `
      <div class="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/40">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="min-w-0">
            <h4 class="font-extrabold text-navy-900 text-sm">${esc(u.name)}</h4>
            <p class="text-[11px] text-slate-400 truncate max-w-md">${esc(u.description || '')}${lead ? ` · Lead: ${esc(lead.full_name || lead.email)}` : ''}</p>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${isAdmin ? `
              <button onclick="window.openAssignMemberModal('${u.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition">+ Assign</button>
              <button onclick="window.deleteUnit('${u.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">Delete</button>
            ` : ''}
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${mem.length ? mem.map(m => {
            const p = (profiles || []).find(x => x.id === m.user_id);
            return `<span class="pill bg-white border border-slate-200 text-[10px] font-bold text-slate-700 flex items-center gap-1">
              ${esc(p ? (p.full_name || p.email) : m.user_id)}
              ${m.positions?.title ? `<span class="text-brand-600">· ${esc(m.positions.title)}</span>` : ''}
              ${isAdmin ? `<button onclick="window.removeMembership('${m.id}')" class="text-slate-300 hover:text-red-500 ml-0.5" title="Remove">✕</button>` : ''}
            </span>`;
          }).join('') : '<span class="text-[11px] text-slate-400 italic">No members assigned yet</span>'}
        </div>
      </div>`;
    }).join('');
  };

  window.openCreateUnitModal = function () {
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = 'New Unit';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Unit Name *</label>
        <input id="unit-name" type="text" required class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label>
        <textarea id="unit-desc" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"></textarea></div>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const client = await sb();
      const { error } = await client.from('units').insert({
        name: document.getElementById('unit-name').value.trim(),
        description: document.getElementById('unit-desc').value.trim(),
      });
      if (error) return window.showToast ? window.showToast(error.message, true) : alert(error.message);
      window.closeActionModal();
      window.loadUnits();
    };
    modal.classList.remove('hidden');
  };

  window.deleteUnit = async function (id) {
    if (!confirm('Delete this unit? Memberships are removed; members keep their accounts.')) return;
    const client = await sb();
    const { error } = await client.from('units').delete().eq('id', id);
    if (error) return alert(error.message);
    window.loadUnits();
  };

  window.openAssignMemberModal = async function (unitId) {
    const client = await sb();
    const [{ data: profiles }, { data: positions }, { data: existing }] = await Promise.all([
      client.from('profiles').select('id, full_name, email').eq('active', true).order('full_name'),
      client.from('positions').select('*').order('title'),
      client.from('unit_members').select('user_id').eq('unit_id', unitId),
    ]);
    const existingIds = new Set((existing || []).map(m => m.user_id));
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = 'Assign Member to Unit';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Member *</label>
        <select id="am-user" required class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          <option value="">Select member…</option>
          ${(profiles || []).filter(p => !existingIds.has(p.id)).map(p => `<option value="${p.id}">${esc(p.full_name || p.email)}</option>`).join('')}
        </select></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Position (optional)</label>
        <select id="am-position" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          <option value="">No position</option>
          ${(positions || []).map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}
        </select></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">New position title (optional)</label>
        <input id="am-newpos" type="text" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      let positionId = document.getElementById('am-position').value || null;
      const newPos = document.getElementById('am-newpos').value.trim();
      if (newPos) {
        const { data: pos, error: perr } = await client.from('positions').upsert({ title: newPos }, { onConflict: 'title' }).select().single();
        if (perr) return alert(perr.message);
        positionId = pos.id;
      }
      const { error } = await client.from('unit_members').insert({
        unit_id: unitId,
        user_id: document.getElementById('am-user').value,
        position_id: positionId,
      });
      if (error) return alert(error.message);
      window.closeActionModal();
      window.loadUnits();
    };
    modal.classList.remove('hidden');
  };

  window.removeMembership = async function (membershipId) {
    if (!confirm('Remove this member from the unit?')) return;
    const client = await sb();
    await client.from('unit_members').delete().eq('id', membershipId);
    window.loadUnits();
  };
})();
