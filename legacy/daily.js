/* Phase 2 — Daily core: member daily report form, admin review queue, blockers board */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sb = () => window.sbClient;
  const uid = () => window.currentUser?.id;
  const isAdmin = () => window.isUserAdmin ? window.isUserAdmin() : false;

  function todayLagos() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  }

  async function getDeadline() {
    try {
      const { data } = await sb().from('org_settings').select('daily_report_deadline').limit(1).single();
      return data?.daily_report_deadline || '18:00:00';
    } catch { return '18:00:00'; }
  }

  // ── Member: submit today's daily report (rendered into #daily-report-slot) ──
  window.renderDailyReportForm = async function () {
    const slot = document.getElementById('daily-report-slot');
    if (!slot) return;
    const date = todayLagos();
    const { data: existing } = await sb().from('daily_reports').select('*').eq('user_id', uid()).eq('report_date', date).maybeSingle();
    const deadline = await getDeadline();
    const editable = existing && (existing.status === 'Submitted' || existing.status === 'Rejected');
    slot.innerHTML = `
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-sm text-navy-900">📝 Daily Scrum Report — ${date}</h3>
          <span class="text-[10px] font-bold text-slate-400">Deadline ${deadline.slice(0,5)} WAT</span>
        </div>
        ${existing ? `<div class="mb-3 text-[11px] font-bold ${existing.status==='Rejected'?'text-red-600':'text-slate-500'}">
          Status: ${existing.status}${existing.is_late ? ` · <span class="text-amber-600">Late by ${existing.late_minutes} min</span>` : ''}${existing.review_note ? ` · Note: ${esc(existing.review_note)}` : ''}${existing.score != null ? ` · Score: ${existing.score}` : ''}
        </div>` : ''}
        <form onsubmit="window.submitDailyReport(event)" class="space-y-3">
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">What I did yesterday</label>
            <textarea id="dr-done" rows="2" required ${editable?'':'disabled'} class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none disabled:bg-slate-50">${esc(existing?.did_yesterday || '')}</textarea></div>
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">What I will do today</label>
            <textarea id="dr-plan" rows="2" required ${editable?'':'disabled'} class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none disabled:bg-slate-50">${esc(existing?.doing_today || '')}</textarea></div>
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Blockers (optional)</label>
            <input id="dr-blockers" type="text" ${editable?'':'disabled'} value="${esc(existing?.blockers || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-50"></div>
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Evidence URL (Drive link, image link…)</label>
            <input id="dr-evidence" type="url" ${editable?'':'disabled'} value="${esc(existing?.evidence_url || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-50"></div>
          ${editable ? `<button type="submit" class="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-xl shadow-md transition">${existing ? 'Resubmit' : 'Submit report'}</button>`
            : `<p class="text-[11px] text-slate-400 italic">${existing ? 'Under review — not editable.' : 'Already submitted.'}</p>`}
        </form>
      </div>`;
  };

  window.submitDailyReport = async function (e) {
    e.preventDefault();
    const date = todayLagos();
    const deadline = await getDeadline();
    const now = new Date();
    const nowLagos = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const [h, m] = deadline.split(':').map(Number);
    const dl = new Date(nowLagos); dl.setHours(h, m, 0, 0);
    const isLate = nowLagos > dl;
    const lateMinutes = isLate ? Math.round((nowLagos - dl) / 60000) : 0;
    const payload = {
      user_id: uid(), report_date: date,
      did_yesterday: document.getElementById('dr-done').value.trim(),
      doing_today: document.getElementById('dr-plan').value.trim(),
      blockers: document.getElementById('dr-blockers').value.trim() || null,
      evidence_url: document.getElementById('dr-evidence').value.trim() || null,
      submitted_at: now.toISOString(), is_late: isLate, late_minutes: lateMinutes,
      status: 'Submitted',
    };
    const { error } = await sb().from('daily_reports').upsert(payload, { onConflict: 'user_id,report_date' });
    if (error) return window.showToast ? window.showToast(error.message, true) : alert(error.message);
    window.showToast && window.showToast(isLate ? `Submitted (Late by ${lateMinutes} min)` : 'Daily report submitted ✅');
    window.renderDailyReportForm();
  };

  // ── Admin: review queue ──
  window.loadReviewQueue = async function () {
    const c = document.getElementById('review-queue-container');
    const b = document.getElementById('blockers-container');
    if (!c) return;
    c.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Loading review queue…</div>`;
    const [{ data: reports }, { data: blockers }] = await Promise.all([
      sb().from('daily_reports').select('*, profiles:user_id(full_name,email)').order('submitted_at', { ascending: false }).limit(50),
      sb().from('open_blockers').select('*').order('submitted_at', { ascending: false }).limit(30),
    ]);
    const pending = (reports || []).filter(r => r.status === 'Submitted');
    c.innerHTML = pending.length ? pending.map(r => `
      <div class="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm" data-rid="${r.id}">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span class="font-bold text-sm text-navy-900">${esc(r.profiles?.full_name || r.profiles?.email || 'Member')}</span>
          <span class="pill bg-slate-100 text-slate-500 text-[10px]">${r.report_date}</span>
          <span class="pill text-[10px] ${r.is_late ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}">${r.is_late ? `⏰ Late ${r.late_minutes} min` : 'On time'}</span>
          <span class="text-[10px] text-slate-400">submitted ${new Date(r.submitted_at).toLocaleString([], { dateStyle:'short', timeStyle:'short' })}</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-2 text-xs text-slate-600 mb-3">
          <div><b class="text-slate-400 text-[10px] uppercase">Yesterday</b><p>${esc(r.did_yesterday || '—')}</p></div>
          <div><b class="text-slate-400 text-[10px] uppercase">Today</b><p>${esc(r.doing_today || '—')}</p></div>
          ${r.blockers ? `<div class="sm:col-span-2"><b class="text-slate-400 text-[10px] uppercase">Blockers</b><p class="text-amber-700 font-semibold">${esc(r.blockers)}</p></div>` : ''}
          ${r.evidence_url ? `<div class="sm:col-span-2"><a href="${esc(r.evidence_url)}" target="_blank" class="text-brand-600 font-bold underline break-all">🔗 Evidence</a></div>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input type="number" min="0" max="100" placeholder="Score 0-100" class="w-24 text-xs p-2 rounded-lg border border-slate-200" id="score-${r.id}">
          <input type="text" placeholder="Review note (optional)" class="flex-1 min-w-32 text-xs p-2 rounded-lg border border-slate-200" id="note-${r.id}">
          <button onclick="window.reviewDaily('${r.id}','Approved')" class="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">Approve</button>
          <button onclick="window.reviewDaily('${r.id}','Scored')" class="px-3 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg">Save score</button>
          <button onclick="window.reviewDaily('${r.id}','Rejected')" class="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg">Reject</button>
        </div>
      </div>`).join('') : `<div class="py-10 text-center"><div class="text-3xl mb-2">✅</div><p class="text-sm font-bold text-navy-900">Queue clear</p><p class="text-xs text-slate-400 mt-1">No daily reports waiting for review.</p></div>`;

    if (b) {
      b.innerHTML = (blockers && blockers.length) ? `
        <h4 class="font-bold text-sm text-navy-900 mb-2">🚧 Open blockers (${blockers.length})</h4>
        <div class="space-y-2">${blockers.map(x => `
          <div class="flex items-center justify-between gap-3 bg-amber-50/60 border border-amber-200 rounded-xl px-3 py-2 text-xs">
            <span class="min-w-0"><b class="text-navy-900">${esc(x.member)}</b> <span class="text-slate-400">${x.report_date}</span><br><span class="text-amber-800 font-semibold">${esc(x.blockers)}</span></span>
            <button onclick="window.resolveBlocker('${x.id}')" class="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg flex-shrink-0">Mark resolved</button>
          </div>`).join('')}</div>` : `<p class="text-xs text-slate-400 italic">No open blockers. 🎉</p>`;
    }
  };

  window.reviewDaily = async function (id, action) {
    const scoreVal = document.getElementById('score-' + id)?.value;
    const note = document.getElementById('note-' + id)?.value.trim();
    const status = action === 'Scored' ? 'Scored' : action;
    if (status === 'Scored' && (scoreVal === '' || isNaN(+scoreVal))) return alert('Enter a score 0-100 first.');
    const { error } = await sb().from('daily_reports').update({
      status,
      score: status === 'Scored' ? Math.max(0, Math.min(100, +scoreVal)) : null,
      review_note: note || null,
      reviewed_by: uid(),
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return alert(error.message);
    await sb().from('audit_log').insert({ actor_id: uid(), action: 'daily_' + status.toLowerCase(), target: 'daily_reports:' + id, new_value: scoreVal || note || '' });
    window.loadReviewQueue();
  };

  window.resolveBlocker = async function (id) {
    const { error } = await sb().from('daily_reports').update({ blockers: null }).eq('id', id);
    if (error) return alert(error.message);
    window.loadReviewQueue();
  };
})();
