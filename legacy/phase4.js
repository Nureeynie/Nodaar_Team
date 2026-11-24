/* Phase 4 — Meetings, weekly ideas/problems, leave requests */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sb = () => window.sbClient;
  const uid = () => window.currentUser?.id;
  const isAdmin = () => window.isUserAdmin ? window.isUserAdmin() : false;

  function currentWeekLabel() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = (d.getUTCDay() + 6) % 7; // Mon=0
    d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
  }
  async function currentWeeklyPeriodId() {
    const label = currentWeekLabel();
    const { data } = await sb().from('periods').select('id').eq('type','weekly').eq('label', label).maybeSingle();
    return data?.id || null;
  }

  // ── MEETINGS ──
  window.loadMeetingsList = async function () {
    const c = document.getElementById('meetings-container');
    if (!c) return;
    c.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Loading meetings…</div>`;
    const { data } = await sb().from('meetings').select('*, units:unit_id(name), profiles:organizer_id(full_name)')
      .gte('start_time', new Date(Date.now() - 7*86400000).toISOString()).order('start_time');
    const admin = isAdmin();
    c.innerHTML = (data && data.length) ? data.map(m => `
      <div class="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h4 class="font-bold text-sm text-navy-900">${esc(m.title)}</h4>
          <p class="text-[11px] text-slate-400">
            📅 ${new Date(m.start_time).toLocaleString([], { dateStyle:'medium', timeStyle:'short' })}
            ${m.location ? ` · 📍 <a class="text-brand-600 underline" href="${esc(m.location)}" target="_blank">${esc(m.location)}</a>` : ''}
            ${m.units ? ` · 🏢 ${esc(m.units.name)}` : ' · 👥 Everyone'}
            ${m.profiles ? ` · by ${esc(m.profiles.full_name)}` : ''}
          </p>
          ${m.minutes ? `<p class="text-xs text-slate-500 mt-1">📝 ${esc(m.minutes)}</p>` : ''}
        </div>
        ${admin ? `<div class="flex gap-1.5">
          <button onclick="window.openMeetingModal('${m.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-brand-700 bg-brand-50 rounded-lg">Edit</button>
          <button onclick="window.deleteMeeting('${m.id}')" class="px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 rounded-lg">Delete</button>
        </div>` : ''}
      </div>`).join('')
      : `<div class="py-10 text-center"><div class="text-3xl mb-2">📅</div><p class="text-sm font-bold text-navy-900">No meetings scheduled</p></div>`;
  };

  window.openMeetingModal = async function (meetingId) {
    const { data: units } = await sb().from('units').select('id,name').order('name');
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = meetingId ? 'Edit Meeting' : 'New Meeting';
    document.getElementById('modal-fields').innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Title *</label><input id="mt-title" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="mt-desc" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 resize-none"></textarea></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Start *</label><input id="mt-start" type="datetime-local" required class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">End</label><input id="mt-end" type="datetime-local" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Location / link</label><input id="mt-loc" type="text" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Audience</label>
        <select id="mt-unit" class="w-full text-xs p-3 rounded-xl border border-slate-200">
          <option value="">👥 Everyone</option>
          ${(units||[]).map(u=>`<option value="${u.id}">🏢 ${esc(u.name)}</option>`).join('')}
        </select></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Minutes / notes</label><textarea id="mt-minutes" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 resize-none"></textarea></div>`;
    document.getElementById('modal-form').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('mt-title').value.trim(),
        description: document.getElementById('mt-desc').value.trim() || null,
        start_time: document.getElementById('mt-start').value,
        end_time: document.getElementById('mt-end').value || null,
        location: document.getElementById('mt-loc').value.trim() || null,
        unit_id: document.getElementById('mt-unit').value || null,
        minutes: document.getElementById('mt-minutes').value.trim() || null,
        organizer_id: uid(),
      };
      const q = meetingId ? sb().from('meetings').update(payload).eq('id', meetingId)
                         : sb().from('meetings').insert(payload);
      const { error } = await q;
      if (error) return alert(error.message);
      await sb().from('audit_log').insert({ actor_id: uid(), action: meetingId ? 'meeting_updated' : 'meeting_created', target: 'meetings:' + (meetingId || 'new') });
      window.closeActionModal(); window.loadMeetingsList();
    };
    modal.classList.remove('hidden');
  };

  window.deleteMeeting = async function (id) {
    if (!confirm('Delete this meeting?')) return;
    await sb().from('meetings').delete().eq('id', id);
    window.loadMeetingsList();
  };

  // ── WEEKLY IDEA + PROBLEM ──
  window.loadFeedback = async function () {
    const c = document.getElementById('feedback-container') || document.getElementById('feedback-container-ideas');
    if (!c) return;
    const periodId = await currentWeeklyPeriodId();
    const label = currentWeekLabel();
    const { data } = await sb().from('weekly_feedback').select('*, periods:period_id(label)').eq('user_id', uid()).order('created_at');
    const idea = (data || []).find(f => f.type === 'idea');
    const problem = (data || []).find(f => f.type === 'problem');
    const admin = isAdmin();
    let adminHtml = '';
    if (admin) {
      const { data: all } = await sb().from('weekly_feedback').select('*, profiles:user_id(full_name,email), periods:period_id(label)').order('created_at', { ascending: false }).limit(40);
      adminHtml = `<div class="mt-4 border-t border-slate-100 pt-3">
        <h4 class="font-bold text-xs text-navy-900 mb-2">All submissions (admin)</h4>
        <div class="space-y-1.5">${(all||[]).map(f => `
          <div class="flex items-start justify-between gap-2 text-xs bg-slate-50 rounded-xl px-3 py-2">
            <span class="min-w-0"><b>${f.type === 'idea' ? '💡' : '⚠️'} ${esc(f.profiles?.full_name || f.profiles?.email)}</b>
              <span class="text-slate-400"> ${esc(f.periods?.label || '')}</span><br>
              <span class="text-slate-600">${esc(f.content)}</span>
              ${f.admin_note ? `<br><span class="text-brand-600 font-semibold">Admin: ${esc(f.admin_note)}</span>` : ''}</span>
            <select onchange="window.setFeedbackStatus('${f.id}', this.value)" class="text-[10px] font-bold rounded-lg border border-slate-200 p-1 flex-shrink-0">
              ${['Open','Reviewed','Resolved','Dismissed'].map(s2 => `<option ${f.status===s2?'selected':''}>${s2}</option>`).join('')}
            </select>
          </div>`).join('') || '<p class="text-xs text-slate-400 italic">No submissions yet.</p>'}</div>
      </div>`;
    }
    c.innerHTML = `
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <h3 class="font-bold text-sm text-navy-900 mb-1">💡 Weekly Idea & ⚠️ Problem — ${esc(label)}</h3>
        <p class="text-[11px] text-slate-400 mb-3">One idea + one problem per week (PRD). You can edit while Open.</p>
        <div class="grid sm:grid-cols-2 gap-3">
          ${['idea','problem'].map(t => {
            const f = t === 'idea' ? idea : problem;
            const editable = !f || f.status === 'Open';
            return `<div class="border rounded-2xl p-3 ${t==='idea' ? 'border-emerald-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/40'}">
              <label class="block text-[11px] font-bold ${t==='idea'?'text-emerald-700':'text-amber-700'} mb-1">${t==='idea'?'💡 My idea':'⚠️ My problem'}</label>
              <textarea id="fb-${t}" rows="3" ${editable?'':'disabled'} class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-white resize-none">${esc(f?.content || '')}</textarea>
              ${f ? `<p class="text-[10px] mt-1 font-bold ${f.status==='Open'?'text-slate-400':'text-brand-600'}">Status: ${f.status}</p>` : ''}
              ${editable ? `<button onclick="window.submitFeedback('${t}', ${!!periodId}, '${periodId || ''}')" class="mt-2 px-3 py-1.5 text-[11px] font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg">${f ? 'Update' : 'Submit'}</button>` : ''}
            </div>`;
          }).join('')}
        </div>
        ${adminHtml}
      </div>`;
  };

  window.submitFeedback = async function (type, hasPeriod, periodId) {
    const content = document.getElementById('fb-' + type).value.trim();
    if (!content) return alert('Please write something first.');
    if (!hasPeriod) return alert(`No weekly period "${currentWeekLabel()}" exists yet — ask an admin to create it in Scores → Periods.`);
    const { error } = await sb().from('weekly_feedback').upsert({
      user_id: uid(), period_id: periodId, type, content, status: 'Open',
    }, { onConflict: 'user_id,period_id,type' });
    if (error) return alert(error.message);
    window.loadFeedback();
  };

  window.setFeedbackStatus = async function (id, status) {
    const { error } = await sb().from('weekly_feedback').update({ status }).eq('id', id);
    if (error) return alert(error.message);
    await sb().from('audit_log').insert({ actor_id: uid(), action: 'feedback_' + status.toLowerCase(), target: 'weekly_feedback:' + id });
    window.loadFeedback();
  };

  // ── LEAVE ──
  window.loadLeave = async function () {
    const c = document.getElementById('leave-container');
    if (!c) return;
    const admin = isAdmin();
    const [{ data: mine }, { data: all }] = await Promise.all([
      sb().from('leave_requests').select('*').eq('user_id', uid()).order('created_at', { ascending: false }),
      admin ? sb().from('leave_requests').select('*, profiles:user_id(full_name,email)').order('created_at', { ascending: false }).limit(40) : { data: [] },
    ]);
    const pill = (s2) => s2 === 'Approved' ? 'bg-emerald-100 text-emerald-700' : s2 === 'Declined' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
    c.innerHTML = `
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4">
        <h3 class="font-bold text-sm text-navy-900 mb-3">🏖️ Request leave</h3>
        <form onsubmit="window.submitLeave(event)" class="grid sm:grid-cols-4 gap-2 items-end">
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Start</label><input id="lv-start" type="date" required class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">End</label><input id="lv-end" type="date" required class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
          <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Reason</label><input id="lv-reason" type="text" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
          <button class="px-3 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-xl">Submit</button>
        </form>
      </div>
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <h3 class="font-bold text-sm text-navy-900 mb-3">${admin ? 'Leave requests' : 'My leave requests'}</h3>
        <div class="space-y-2">
          ${(admin ? all : mine || []).length ? (admin ? all : mine).map(l => `
            <div class="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2 text-xs">
              <span><b class="text-navy-900">${esc(admin ? (l.profiles?.full_name || l.profiles?.email) : 'You')}</b>
                · ${l.start_date} → ${l.end_date} ${l.reason ? `· ${esc(l.reason)}` : ''}</span>
              <span class="pill ${pill(l.status)} text-[10px] font-bold">${l.status}</span>
              ${admin && l.status === 'Pending' ? `<span class="flex gap-1">
                <button onclick="window.decideLeave('${l.id}','Approved')" class="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-lg">Approve</button>
                <button onclick="window.decideLeave('${l.id}','Declined')" class="px-2 py-1 text-[10px] font-bold text-red-600 bg-red-50 rounded-lg">Decline</button></span>` : ''}
            </div>`).join('') : '<p class="text-xs text-slate-400 italic">No leave requests.</p>'}
        </div>
      </div>`;
  };

  window.submitLeave = async function (e) {
    e.preventDefault();
    const { error } = await sb().from('leave_requests').insert({
      user_id: uid(),
      start_date: document.getElementById('lv-start').value,
      end_date: document.getElementById('lv-end').value,
      reason: document.getElementById('lv-reason').value.trim() || null,
    });
    if (error) return alert(error.message);
    window.loadLeave();
  };

  window.decideLeave = async function (id, status) {
    const { error } = await sb().from('leave_requests').update({ status, reviewed_by: uid() }).eq('id', id);
    if (error) return alert(error.message);
    await sb().from('audit_log').insert({ actor_id: uid(), action: 'leave_' + status.toLowerCase(), target: 'leave_requests:' + id });
    window.loadLeave();
  };

  // route tabs
  const prevLDT = window.loadTabData;
  window.loadTabData = async function (tab) {
    if (tab === 'meetings') await window.loadMeetingsList();
    else if (tab === 'ideas') await window.loadFeedback();
    else if (tab === 'leave') await window.loadLeave();
    else if (prevLDT) await prevLDT(tab);
  };
})();
