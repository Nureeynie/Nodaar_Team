/* Phase 5 — OKRs, URL-only Library w/ grants, dashboards, PDF/Excel exports */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sb = () => window.sbClient;
  const uid = () => window.currentUser?.id;
  const isAdmin = () => window.isUserAdmin ? window.isUserAdmin() : false;

  // ── OKRs ──
  function injectExportBar() {
    const bar = document.getElementById('export-scores-bar');
    if (bar && isAdmin()) bar.innerHTML = `
      <button onclick="window.exportScoresCSV()" class="px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">⬇ Excel/CSV</button>
      <button onclick="window.exportScoresPDF()" class="px-3 py-1.5 text-[11px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg">🖨 PDF</button>`;
  }

  window.loadOKRsView = async function () {
    const c = document.getElementById('okrs-container');
    if (!c) return;
    c.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Loading OKRs…</div>`;
    const [{ data: okrs }, { data: krs }, { data: units }] = await Promise.all([
      sb().from('okrs').select('*, units:unit_id(name), profiles:owner_id(full_name), periods:period_id(label)').order('created_at', { ascending: false }),
      sb().from('key_results').select('*'),
      sb().from('units').select('id,name').order('name'),
    ]);
    const admin = isAdmin();
    const statusColor = { 'On Track':'bg-emerald-100 text-emerald-700', 'At Risk':'bg-amber-100 text-amber-700', 'Off Track':'bg-red-100 text-red-700', 'Done':'bg-brand-100 text-brand-700' };
    c.innerHTML = (okrs && okrs.length) ? okrs.map(o => `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h4 class="font-bold text-sm text-navy-900">🎯 ${esc(o.title)}</h4>
          <span class="pill ${statusColor[o.status] || 'bg-slate-100'} text-[10px] font-bold">${o.status}</span>
        </div>
        <p class="text-[11px] text-slate-400 mb-2">${esc(o.description || '')} ${o.units ? `· 🏢 ${esc(o.units.name)}` : '· 👥 Company-wide'} ${o.periods ? `· ${esc(o.periods.label)}` : ''}</p>
        <div class="w-full bg-slate-100 rounded-full h-2 mb-3"><div class="bg-brand-500 h-2 rounded-full" style="width:${o.progress}%"></div></div>
        <div class="space-y-1.5">
          ${(krs || []).filter(k => k.okr_id === o.id).map(k => `
            <div class="text-xs flex items-center gap-2">
              <span class="flex-1 min-w-0 truncate">🔑 ${esc(k.title)} ${k.target ? `<span class="text-slate-400">→ ${esc(k.target)}</span>` : ''}</span>
              <div class="w-24 bg-slate-100 rounded-full h-1.5 flex-shrink-0"><div class="bg-emerald-500 h-1.5 rounded-full" style="width:${k.progress}%"></div></div>
              <span class="text-[10px] font-bold text-slate-500 w-8 text-right">${k.progress}%</span>
            </div>`).join('')}
        </div>
        ${admin ? `<div class="mt-3 flex gap-1.5">
          <button onclick="window.openOKRModal('${o.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-brand-700 bg-brand-50 rounded-lg">Edit</button>
          <button onclick="window.deleteOKR('${o.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 rounded-lg">Delete</button>
        </div>` : ''}
      </div>`).join('')
      : `<div class="py-10 text-center bg-white rounded-2xl border border-slate-200"><div class="text-3xl mb-2">🎯</div><p class="text-sm font-bold text-navy-900">No OKRs yet</p>${admin ? '<p class="text-xs text-slate-400 mt-1">Admins can create OKRs with key results.</p>' : ''}</div>`;
    if (admin) {
      c.innerHTML = `<div class="mb-4"><button onclick="window.openOKRModal()" class="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-md">+ New OKR</button></div>` + c.innerHTML;
    }
  };

  window.openOKRModal = async function (okrId) {
    const { data: units } = await sb().from('units').select('id,name').order('name');
    const { data: periods } = await sb().from('periods').select('id,label').eq('type','monthly').order('start_date', { ascending: false }).limit(12);
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = okrId ? 'Edit OKR' : 'New OKR';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Objective title *</label><input id="okr-title" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="okr-desc" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 resize-none"></textarea></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Audience</label>
          <select id="okr-unit" class="w-full text-xs p-3 rounded-xl border border-slate-200"><option value="">👥 Company-wide</option>${(units||[]).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Period</label>
          <select id="okr-period" class="w-full text-xs p-3 rounded-xl border border-slate-200"><option value="">—</option>${(periods||[]).map(p=>`<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Status</label>
          <select id="okr-status" class="w-full text-xs p-3 rounded-xl border border-slate-200">${['On Track','At Risk','Off Track','Done'].map(s2=>`<option>${s2}</option>`).join('')}</select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Progress %</label><input id="okr-prog" type="number" min="0" max="100" value="0" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Key results (one per line: "title | target")</label>
        <textarea id="okr-krs" rows="3" placeholder="Launch self-serve onboarding | 80% adoption" class="w-full text-xs p-3 rounded-xl border border-slate-200 resize-none"></textarea></div>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('okr-title').value.trim(),
        description: document.getElementById('okr-desc').value.trim() || null,
        unit_id: document.getElementById('okr-unit').value || null,
        period_id: document.getElementById('okr-period').value || null,
        status: document.getElementById('okr-status').value,
        progress: +document.getElementById('okr-prog').value || 0,
        owner_id: uid(),
      };
      let id = okrId;
      if (okrId) {
        const { error } = await sb().from('okrs').update(payload).eq('id', okrId);
        if (error) return alert(error.message);
      } else {
        const { data, error } = await sb().from('okrs').insert(payload).select().single();
        if (error) return alert(error.message);
        id = data.id;
      }
      // replace key results
      await sb().from('key_results').delete().eq('okr_id', id);
      const krs = document.getElementById('okr-krs').value.split('\n').map(l => l.trim()).filter(Boolean);
      if (krs.length) {
        await sb().from('key_results').insert(krs.map(l => {
          const [title, target] = l.split('|').map(x => (x || '').trim());
          return { okr_id: id, title, target: target || null };
        }));
      }
      await sb().from('audit_log').insert({ actor_id: uid(), action: okrId ? 'okr_updated' : 'okr_created', target: 'okrs:' + id });
      window.closeActionModal(); window.loadOKRsView();
    };
    modal.classList.remove('hidden');
  };

  window.deleteOKR = async function (id) {
    if (!confirm('Delete this OKR and its key results?')) return;
    await sb().from('okrs').delete().eq('id', id);
    window.loadOKRsView();
  };

  // ── LIBRARY (URL-only) ──
  window.loadLibraryView = async function () {
    const c = document.getElementById('library-container');
    if (!c) return;
    c.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Loading library…</div>`;
    const [{ data: items }, { data: grants }, { data: units }, { data: members }] = await Promise.all([
      sb().from('library_items').select('*, profiles:added_by(full_name)').order('created_at', { ascending: false }),
      sb().from('library_grants').select('*'),
      sb().from('units').select('id,name').order('name'),
      isAdmin() ? sb().from('profiles').select('id,full_name,email').eq('active', true).order('full_name') : { data: [] },
    ]);
    const g = (itemId) => (grants || []).filter(x => x.item_id === itemId).map(x => x.scope);
    const admin = isAdmin();
    c.innerHTML = `<div class="mb-4 flex items-center justify-between">
        ${admin ? `<button onclick="window.openLibraryModal()" class="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-md">+ Add link</button>` : '<span></span>'}
        <span class="text-[11px] text-slate-400">🔗 URL-only library — no file uploads (PRD)</span>
      </div>` + ((items && items.length) ? items.map(it => {
        const scopes = g(it.id);
        return `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3 mb-2">
          <div class="min-w-0">
            <a href="${esc(it.url)}" target="_blank" class="font-bold text-sm text-brand-600 hover:underline">🔗 ${esc(it.title)}</a>
            ${it.category ? `<span class="ml-2 pill bg-slate-100 text-slate-500 text-[10px]">${esc(it.category)}</span>` : ''}
            <p class="text-[11px] text-slate-400 mt-0.5">${esc(it.description || '')} · by ${esc(it.profiles?.full_name || 'admin')}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">Access: ${scopes.length ? scopes.map(s2 => s2 === 'everyone' ? '👥 Everyone' : s2.startsWith('unit:') ? `🏢 ${esc((units||[]).find(u=>'unit:'+u.id===s2)?.name || s2)}` : '👤 Specific member').join(', ') : '—'}</p>
          </div>
          ${admin ? `<button onclick="window.openLibraryModal('${it.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-brand-700 bg-brand-50 rounded-lg flex-shrink-0">Edit</button>` : ''}
        </div>`;
      }).join('') : `<div class="py-10 text-center bg-white rounded-2xl border border-slate-200"><div class="text-3xl mb-2">📚</div><p class="text-sm font-bold text-navy-900">Library is empty</p></div>`);
  };

  window.openLibraryModal = async function (itemId) {
    const { data: units } = await sb().from('units').select('id,name').order('name');
    const { data: members } = await sb().from('profiles').select('id,full_name,email').eq('active', true).order('full_name');
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = itemId ? 'Edit library link' : 'Add library link';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Title *</label><input id="li-title" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">URL * (Drive/Notion/any link)</label><input id="li-url" type="url" required placeholder="https://…" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Category</label><input id="li-cat" type="text" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><input id="li-desc" type="text" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Who can access?</label>
        <select id="li-scope" class="w-full text-xs p-3 rounded-xl border border-slate-200">
          <option value="everyone">👥 Everyone</option>
          ${(units||[]).map(u=>`<option value="unit:${u.id}">🏢 ${esc(u.name)}</option>`).join('')}
          ${(members||[]).map(m=>`<option value="member:${m.id}">👤 ${esc(m.full_name || m.email)}</option>`).join('')}
        </select></div>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('li-title').value.trim(),
        url: document.getElementById('li-url').value.trim(),
        category: document.getElementById('li-cat').value.trim() || null,
        description: document.getElementById('li-desc').value.trim() || null,
        added_by: uid(),
      };
      let id = itemId;
      if (itemId) {
        const { error } = await sb().from('library_items').update(payload).eq('id', itemId);
        if (error) return alert(error.message);
      } else {
        const { data, error } = await sb().from('library_items').insert(payload).select().single();
        if (error) return alert(error.message);
        id = data.id;
      }
      await sb().from('library_grants').delete().eq('item_id', id);
      await sb().from('library_grants').insert({ item_id: id, scope: document.getElementById('li-scope').value });
      await sb().from('audit_log').insert({ actor_id: uid(), action: itemId ? 'library_updated' : 'library_added', target: 'library_items:' + id });
      window.closeActionModal(); window.loadLibraryView();
    };
    modal.classList.remove('hidden');
  };

  // ── EXPORTS: PDF (print) + Excel/CSV ──
  window.exportScoresCSV = async function () {
    const { data } = await sb().from('weekly_scores').select('period_id,user_id,criterion_scores,weighted_total,manual_override,note,scored_at, periods:period_id(label), profiles:user_id(full_name,email)').order('scored_at', { ascending: false });
    const rows = [['Period','Member','Quality(30%)','Output(20%)','Timeliness(25%)','Initiative(15%)','Communication(10%)','Weighted /100','Override','Note','Scored at']];
    (data || []).forEach(r => rows.push([r.periods?.label || '', r.profiles?.full_name || r.profiles?.email || '', ...['quality','output','timeliness','initiative','communication'].map(k => r.criterion_scores?.[k] ?? ''), r.weighted_total ?? '', r.manual_override ?? '', (r.note || '').replace(/\n/g,' '), r.scored_at]));
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nodaar_scores_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  window.exportScoresPDF = function () {
    // printable report → user prints to PDF
    const w = window.open('', '_blank');
    if (!w) return alert('Popup blocked — allow popups to export PDF.');
    sb().from('weekly_scores').select('period_id,user_id,criterion_scores,weighted_total,manual_override,note, periods:period_id(label), profiles:user_id(full_name,email)').then(({ data }) => {
      w.document.write(`<html><head><title>Nodaar — Score Report</title>
      <style>body{font-family:Inter,Arial;padding:32px;color:#0f172a}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}th{background:#f8fafc}</style></head>
      <body><h1>🏆 Team Score Report — ${new Date().toLocaleDateString()}</h1>
      <table><tr><th>Period</th><th>Member</th><th>Weighted /100</th><th>Note</th></tr>
      ${(data||[]).map(r=>`<tr><td>${esc(r.periods?.label||'')}</td><td>${esc(r.profiles?.full_name||'')}</td><td><b>${r.manual_override ?? r.weighted_total}</b></td><td>${esc(r.note||'')}</td></tr>`).join('')}
      </table><script>window.print()</script></body></html>`);
      w.document.close();
    });
  };

  const prevLDT2 = window.loadTabData;
  const origLoadScores = window.loadScoresPage;
  if (origLoadScores) window.loadScoresPage = async function(){ await origLoadScores(); injectExportBar(); };

  // route tabs
  const prevLDT = window.loadTabData;
  window.loadTabData = async function (tab) {
    if (tab === 'okrs') await window.loadOKRsView();
    else if (tab === 'docs') await window.loadLibraryView();
    else if (prevLDT) await prevLDT(tab);
  };
})();
