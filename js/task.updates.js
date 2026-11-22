// Nodaar — Daily Task Updates (Standard team management)
// Users log progress daily for tasks they are working on

async function openTaskDailyUpdate(taskId, taskTitle) {
  const sb = window.sbClient || getSupabase?.();
  const userId = window.currentUser?.id;
  
  // Check today's existing update
  let existing = null;
  try {
    const today = new Date().toISOString().slice(0,10);
    const { data } = await sb.from('task_updates').select('*').eq('task_id', taskId).eq('user_id', userId).eq('update_date', today).maybeSingle();
    existing = data;
  } catch(e) { /* table may not exist yet, fallback to local */ }

  document.getElementById('modal-title').textContent = `Daily Update: ${taskTitle}`;
  document.getElementById('modal-fields').innerHTML = `
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
      <span class="text-xs font-bold text-slate-600">Today: ${new Date().toLocaleDateString()}</span>
      <span class="text-xs text-brand-600 font-semibold">${existing ? 'Updating today' : 'New log'}</span>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Today's Progress % *</label><input id="tu-progress" type="number" min="0" max="100" required value="${existing?.progress_pct || ''}" placeholder="e.g. 25" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Hours Today *</label><input id="tu-hours" type="number" step="0.5" min="0" max="24" required value="${existing?.hours || '4'}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
    </div>
    <div><label class="block text-xs font-bold text-slate-600 mb-1">What did you do today? *</label><textarea id="tu-desc" rows="3" required placeholder="Fixed checkout bug, updated API docs..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none">${existing?.description || ''}</textarea></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Blockers</label><input id="tu-blockers" type="text" value="${existing?.blockers || 'None'}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Mood</label><select id="tu-mood" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"><option ${existing?.mood==='🔥 Great'?'selected':''}>🔥 Great</option><option ${existing?.mood==='👍 Good'?'selected':''}>👍 Good</option><option ${existing?.mood==='😐 Neutral'?'selected':''}>😐 Neutral</option><option ${existing?.mood==='😴 Tired'?'selected':''}>😴 Tired</option><option ${existing?.mood==='🛑 Blocked'?'selected':''}>🛑 Blocked</option></select></div>
    </div>
    <div><label class="block text-xs font-bold text-slate-600 mb-1">Drive Proof (optional)</label><input id="tu-link" type="url" value="${existing?.drive_link || ''}" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
    <div class="text-xs text-slate-400 bg-amber-50 border border-amber-200 rounded-xl p-2">💡 Tip: Log daily to keep your streak. Managers see this in Overview → Performance.</div>
    <input type="hidden" id="tu-task-id" value="${taskId}">
  `;
  document.getElementById('action-modal').classList.remove('hidden');
  
  document.getElementById('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Saving…';
    const payload = {
      task_id: document.getElementById('tu-task-id').value,
      user_id: window.currentUser.id,
      update_date: new Date().toISOString().slice(0,10),
      progress_pct: Number(document.getElementById('tu-progress').value) || 0,
      hours: Number(document.getElementById('tu-hours').value) || 0,
      description: document.getElementById('tu-desc').value.trim(),
      blockers: document.getElementById('tu-blockers').value.trim() || 'None',
      mood: document.getElementById('tu-mood').value,
      drive_link: document.getElementById('tu-link').value.trim() || null,
    };
    try {
      // Try Supabase, fallback to localStorage
      const sb = window.sbClient || window.getSupabase?.();
      let ok = false;
      try {
        const { error } = await sb.from('task_updates').upsert(payload, { onConflict: 'task_id,user_id,update_date' });
        if (!error) ok = true; else throw error;
      } catch(err) {
        // Table not yet created → store locally
        const key = `task_updates_local:${payload.task_id}:${payload.user_id}:${payload.update_date}`;
        localStorage.setItem(key, JSON.stringify(payload));
        const list = JSON.parse(localStorage.getItem('task_updates_local_list')||'[]');
        list.push(payload); localStorage.setItem('task_updates_local_list', JSON.stringify(list));
        ok = true;
        console.warn('task_updates table not found, saved locally. Run schema.v4.meetings-tasks.sql in Supabase.');
      }
      if (ok) {
        showToast('Daily update saved! Keep the streak 🔥');
        closeActionModal(); 
        // Refresh tasks if on tasks tab
        if (typeof loadTasks === 'function') loadTasks();
        if (typeof loadOverviewData === 'function') loadOverviewData();
      }
    } catch(err) { showToast(err.message || 'Error saving', true); }
    btn.disabled=false; btn.textContent='Save';
  };
}

async function showTaskHistory(taskId) {
  const sb = window.sbClient;
  let logs = [];
  try {
    const { data } = await sb.from('task_updates').select('*, profiles:user_id(full_name)').eq('task_id', taskId).order('update_date', {ascending: false}).limit(14);
    logs = data || [];
  } catch(e) {
    // fallback local
    const all = JSON.parse(localStorage.getItem('task_updates_local_list')||'[]');
    logs = all.filter(l=> l.task_id===taskId);
  }
  document.getElementById('modal-title').textContent = 'Update History (Last 14 days)';
  document.getElementById('modal-fields').innerHTML = logs.length ? logs.map(l=> `
    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs font-bold text-navy-900">${l.update_date} — ${l.progress_pct}% • ${l.hours}h ${l.mood||''}</span>
        <span class="text-xs text-slate-400">${l.profiles?.full_name || 'You'}</span>
      </div>
      <p class="text-xs text-slate-600">${escapeHtml(l.description)}</p>
      ${l.blockers && l.blockers!=='None' ? `<p class="text-xs text-red-600 mt-1">⚠️ ${escapeHtml(l.blockers)}</p>` : ''}
      ${l.drive_link ? `<a href="${l.drive_link}" target="_blank" class="text-xs text-brand-600 font-bold hover:underline">📁 Drive ↗</a>` : ''}
    </div>
  `).join('') : '<p class="text-xs text-slate-400 text-center py-6">No daily updates yet. Be first to log today!</p>';
  document.getElementById('action-modal').classList.remove('hidden');
  document.getElementById('modal-form').onsubmit = (e)=>{ e.preventDefault(); closeActionModal(); };
}

window.openTaskDailyUpdate = openTaskDailyUpdate;
window.showTaskHistory = showTaskHistory;
