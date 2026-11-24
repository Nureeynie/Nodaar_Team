// Nodaar — Shared Tasks (Many members per task, 10-member team)
// Allows 2-10 assignees per task, with member avatars and joint daily logs

async function openShareTaskModal(taskId, taskTitle){
  const sb = window.sbClient;
  // Load team (max 10)
  let members = [];
  try { const { data } = await sb.from('profiles').select('id, full_name, email, avatar_url').order('full_name'); members=data||[]; }
  catch(e){ members = JSON.parse(localStorage.getItem('team_local')||'[]'); }
  // Current assignees
  let current = [];
  try { const { data } = await sb.from('task_assignees').select('user_id').eq('task_id', taskId); current = (data||[]).map(r=>r.user_id); }
  catch(e){ current = JSON.parse(localStorage.getItem(`task_assignees:${taskId}`)||'[]'); }

  document.getElementById('modal-title').textContent = `Share Task: ${taskTitle}`;
  document.getElementById('modal-fields').innerHTML = `
    <p class="text-xs text-slate-500 mb-3">Select 1-10 members to co-own this task. Shared tasks show multi-avatars + joint daily logs.</p>
    <div class="space-y-2 max-h-[40vh] overflow-y-auto">
      ${members.map(m=> `
        <label class="flex items-center gap-3 p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" value="${m.id}" ${current.includes(m.id)?'checked':''} class="share-check w-4 h-4">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-xs flex items-center justify-center overflow-hidden">${m.avatar_url? `<img src="${m.avatar_url}" class="w-full h-full object-cover">`: m.full_name.charAt(0).toUpperCase()}</div>
          <div class="flex-1"><div class="text-xs font-bold text-navy-900">${escapeHtml(m.full_name)}</div><div class="text-xs text-slate-400">${escapeHtml(m.email)}</div></div>
        </label>
      `).join('')}
    </div>
    <input type="hidden" id="share-task-id" value="${taskId}">
    <p class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-2 mt-3">💡 Limit: 10 team members total. Shared task daily logs will aggregate for performance.</p>
  `;
  document.getElementById('action-modal').classList.remove('hidden');
  document.getElementById('modal-form').onsubmit = async (e)=>{
    e.preventDefault();
    const btn=e.target.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Saving…';
    const tid=document.getElementById('share-task-id').value;
    const selected = Array.from(document.querySelectorAll('.share-check:checked')).map(c=>c.value);
    if(!selected.length){ showToast('Select at least one member', true); btn.disabled=false; btn.textContent='Save'; return; }
    if(selected.length>10){ showToast('Max 10 members', true); btn.disabled=false; btn.textContent='Save'; return; }
    try {
      let ok=false;
      try {
        // Clear then insert
        await sb.from('task_assignees').delete().eq('task_id', tid);
        for(const uid of selected){ await sb.from('task_assignees').insert({task_id: tid, user_id: uid, assigned_by: window.currentUser.id}); }
        ok=true;
      } catch(err){
        localStorage.setItem(`task_assignees:${tid}`, JSON.stringify(selected));
        ok=true;
        showToast('Saved locally — run schema.v5.calendar-shared-tasks.sql for cloud');
      }
      if(ok){ showToast(`Shared with ${selected.length} member(s)!`); closeActionModal(); if(typeof loadTasks==='function') loadTasks(); }
    } catch(err){ showToast(err.message, true); }
    btn.disabled=false; btn.textContent='Save';
  };
}
window.openShareTaskModal = openShareTaskModal;
