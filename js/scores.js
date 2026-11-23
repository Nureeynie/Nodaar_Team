/* Phase 3 — Performance engine: weekly criteria scoring (manual, weighted),
   monthly rollup, period lock/unlock. Members see only their own scores. */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sb = () => window.sbClient;
  const uid = () => window.currentUser?.id;
  const isAdmin = () => window.isUserAdmin ? window.isUserAdmin() : false;

  async function getCriteria() {
    const { data } = await sb().from('score_criteria').select('*').eq('active', true).order('weight', { ascending: false });
    return data || [];
  }
  async function getPeriods(type) {
    const { data } = await sb().from('periods').select('*').eq('type', type).order('start_date', { ascending: false });
    return data || [];
  }

  // ── Admin: score a member for a weekly period ──
  window.openScoreModal = async function (periodId, userId, memberName) {
    const criteria = await getCriteria();
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = `Score ${memberName || 'member'} (weekly)`;
    document.getElementById('modal-fields').innerHTML = criteria.map(c => `
      <div class="flex items-center gap-3">
        <label class="flex-1 text-xs font-bold text-slate-700">${esc(c.label)} <span class="text-slate-400 font-semibold">· ${c.weight}%</span></label>
        <input type="number" min="0" max="${c.max_points}" step="1" data-crit="${c.key}" value="${c.max_points}" class="w-20 text-xs p-2 rounded-lg border border-slate-200 text-right">
        <span class="text-[10px] text-slate-400">/ ${c.max_points}</span>
      </div>`).join('') + `
      <div class="pt-1 border-t border-slate-100">
        <label class="block text-xs font-bold text-slate-700 mb-1">Note (optional)</label>
        <input id="ws-note" type="text" class="w-full text-xs p-2.5 rounded-lg border border-slate-200">
      </div>
      <p class="text-[10px] text-slate-400">⚖️ Weighted total is calculated automatically from weights (${criteria.map(c=>c.weight).join('/')})% — the system never suggests scores.</p>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const cs = {};
      criteria.forEach(c => { cs[c.key] = Math.max(0, Math.min(c.max_points, +document.querySelector(`[data-crit="${c.key}"]`).value || 0)); });
      const { error } = await sb().from('weekly_scores').upsert({
        period_id: periodId, user_id: userId, criterion_scores: cs,
        note: document.getElementById('ws-note').value.trim() || null,
        scored_by: uid(), scored_at: new Date().toISOString(),
      }, { onConflict: 'period_id,user_id' });
      if (error) return alert(error.message);
      await sb().from('audit_log').insert({ actor_id: uid(), action: 'weekly_score', target: `weekly_scores:${periodId}:${userId}`, new_value: JSON.stringify(cs) });
      window.closeActionModal();
      window.loadScoresPage && window.loadScoresPage();
    };
    modal.classList.remove('hidden');
  };

  // ── Scores page ──
  window.loadScoresPage = async function () {
    const c = document.getElementById('scores-container');
    if (!c) return;
    c.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Loading scores…</div>`;
    const admin = isAdmin();
    const [criteria, weeks, months, weekly, monthly] = await Promise.all([
      getCriteria(), getPeriods('weekly'), getPeriods('monthly'),
      sb().from('weekly_scores').select('*, periods:period_id(label,locked,type), profiles:user_id(full_name,email)').order('scored_at', { ascending: false }),
      sb().from('monthly_scores').select('*, periods:period_id(label,locked,type), profiles:user_id(full_name,email)').order('scored_at', { ascending: false }),
    ]);
    const myWeekly = (weekly.data || []).filter(w => w.user_id === uid());
    const myMonthly = (monthly.data || []).filter(m => m.user_id === uid());

    let html = '';

    if (admin) {
      html += `
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 class="font-bold text-sm text-navy-900">📅 Periods (weeks & months)</h3>
          <button onclick="window.openCreatePeriodModal()" class="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-xl shadow-md transition">+ New period</button>
        </div>
        <div class="flex flex-wrap gap-2">
          ${[...weeks, ...months].map(p => `
            <span class="pill border text-[11px] font-bold flex items-center gap-1.5 ${p.locked ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-700'}">
              ${p.type === 'weekly' ? 'W' : 'M'} ${esc(p.label)}
              ${p.locked ? '🔒' : ''}
              <button onclick="window.togglePeriodLock('${p.id}', ${p.locked})" class="underline ${p.locked ? 'text-amber-300' : 'text-brand-600'}">${p.locked ? 'reopen' : 'lock'}</button>
            </span>`).join('') || '<span class="text-xs text-slate-400 italic">No periods yet — create weeks/months to start scoring.</span>'}
        </div>
        <p class="text-[10px] text-slate-400 mt-2">Locking a period makes its scores immutable (reopen = admin-only, audit-logged).</p>
      </div>

      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4">
        <h3 class="font-bold text-sm text-navy-900 mb-3">📊 Weekly scoring (${esc((weeks[0]?.label) || 'no active week')})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead><tr class="text-left text-slate-400 border-b border-slate-100">
              <th class="py-2 px-2">Member</th>${criteria.map(c2 => `<th class="py-2 px-2 text-center" title="weight ${c2.weight}%">${esc(c2.label)}<br><span class="text-[9px]">${c2.weight}%</span></th>`).join('')}
              <th class="py-2 px-2 text-center">Weighted /100</th><th class="py-2 px-2"></th>
            </tr></thead>
            <tbody>
              ${(weekly.data || []).filter(w => w.periods?.type === 'weekly').slice(0, 40).map(w => `
                <tr class="border-b border-slate-50">
                  <td class="py-2 px-2 font-bold text-navy-900">${esc(w.profiles?.full_name || w.profiles?.email)}</td>
                  ${criteria.map(c2 => `<td class="py-2 px-2 text-center">${w.criterion_scores?.[c2.key] ?? '—'}</td>`).join('')}
                  <td class="py-2 px-2 text-center font-extrabold ${w.periods?.locked ? 'text-slate-500' : 'text-brand-600'}">${w.manual_override ?? w.weighted_total}</td>
                  <td class="py-2 px-2 text-right">
                    <button onclick="window.openScoreModal('${w.period_id}','${w.user_id}','${esc((w.profiles?.full_name||'').replace(/'/g,"\\'"))}')" class="px-2 py-1 text-[11px] font-bold text-brand-700 bg-brand-50 rounded-lg">${w.periods?.locked ? '🔒 View' : 'Edit'}</button>
                  </td>
                </tr>`).join('') || '<tr><td colspan="20" class="py-6 text-center text-slate-400 italic">No weekly scores yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
    }

    // Member (or admin) own scores — PRD: no leaderboard, own only
    html += `
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <h3 class="font-bold text-sm text-navy-900 mb-1">🏆 My scores</h3>
        <p class="text-[11px] text-slate-400 mb-3">Only you (and admins) can see your scores.</p>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="border border-slate-100 rounded-2xl p-3">
            <h4 class="text-xs font-bold text-slate-500 mb-2">Weekly</h4>
            ${myWeekly.length ? myWeekly.map(w => `<div class="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span>${esc(w.periods?.label)} ${w.periods?.locked ? '🔒' : ''}</span>
              <b class="text-brand-600">${w.manual_override ?? w.weighted_total}/100</b></div>`).join('')
              : '<p class="text-xs text-slate-400 italic">No weekly scores yet.</p>'}
          </div>
          <div class="border border-slate-100 rounded-2xl p-3">
            <h4 class="text-xs font-bold text-slate-500 mb-2">Monthly</h4>
            ${myMonthly.length ? myMonthly.map(m => `<div class="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span>${esc(m.periods?.label)} ${m.periods?.locked ? '🔒' : ''}</span>
              <b class="text-brand-600">${m.final_score ?? m.weekly_avg}/100</b></div>`).join('')
              : '<p class="text-xs text-slate-400 italic">No monthly rollup yet.</p>'}
          </div>
        </div>
      </div>`;
    c.innerHTML = html;
  };

  window.openCreatePeriodModal = function () {
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = 'New period';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Type</label>
        <select id="p-type" class="w-full text-xs p-3 rounded-xl border border-slate-200"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Label (e.g. 2026-W48 / 2026-11)</label>
        <input id="p-label" type="text" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Start</label><input id="p-start" type="date" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">End</label><input id="p-end" type="date" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      </div>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb().from('periods').insert({
        type: document.getElementById('p-type').value,
        label: document.getElementById('p-label').value.trim(),
        start_date: document.getElementById('p-start').value,
        end_date: document.getElementById('p-end').value,
      });
      if (error) return alert(error.message);
      window.closeActionModal(); window.loadScoresPage();
    };
    modal.classList.remove('hidden');
  };

  window.togglePeriodLock = async function (id, locked) {
    const note = locked ? prompt('Reopen this locked period? This is audit-logged. Reason:') : null;
    if (locked && note === null) return;
    const { error } = await sb().from('periods').update({
      locked: !locked, locked_by: uid(), locked_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return alert(error.message);
    await sb().from('audit_log').insert({ actor_id: uid(), action: locked ? 'period_reopened' : 'period_locked', target: 'periods:' + id, new_value: note || '' });
    window.loadScoresPage();
  };

  // Hook into loadTabData (team.scoring.js intercepts 'scores'; we re-route to Phase 3 engine)
  const prevLDT = window.loadTabData;
  window.loadTabData = async function (tab) {
    if (tab === 'scores') { await window.loadScoresPage(); }
    else if (prevLDT) { await prevLDT(tab); }
  };
})();
