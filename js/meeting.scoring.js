// Nodaar — Meeting Attendance Scoring (Per attendee)
// 4 dimensions: Present, Contribution, Understanding, Stayed Till Close → overall %
// Formula: present*0.25 + contribution*0.30 + understanding*0.30 + stayed*0.15 (if present=false → 0)

async function openMeetingScoring(meetingId, meetingTitle) {
  const sb = window.sbClient;
  // Load all team members + existing scores for this meeting
  let members = [];
  let scores = [];
  try {
    const [{ data: profs }, { data: existing }] = await Promise.all([
      sb.from('profiles').select('id, full_name, email, avatar_url').order('full_name'),
      sb.from('meeting_participants').select('*').eq('meeting_id', meetingId)
    ]);
    members = profs || [];
    scores = existing || [];
  } catch(e) {
    // Fallback: localStorage
    members = JSON.parse(localStorage.getItem('nodaar_profiles_cache')||'[]') || [{id:'me', full_name:'You'}];
    scores = JSON.parse(localStorage.getItem(`meeting_scores:${meetingId}`)||'[]');
  }
  const scoreMap = Object.fromEntries(scores.map(s=> [s.user_id, s]));

  document.getElementById('modal-title').textContent = `Attendance: ${meetingTitle}`;
  document.getElementById('modal-fields').innerHTML = `
    <div class="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 -mx-6 px-6">
      ${members.map(m=> {
        const s = scoreMap[m.id] || { present:true, present_pct:100, contribution:70, understanding:70, stayed_till_close:true, stayed_pct:100, notes:'' };
        return `
        <div class="py-3" data-user="${m.id}">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-xs flex items-center justify-center overflow-hidden">${m.avatar_url ? `<img src="${m.avatar_url}" class="w-full h-full object-cover">` : m.full_name.charAt(0).toUpperCase()}</div>
            <div class="flex-1"><div class="text-xs font-bold text-navy-900">${escapeHtml(m.full_name || m.email)}</div><div class="text-xs text-slate-400">${escapeHtml(m.email||'')}</div></div>
            <label class="flex items-center gap-1 text-xs font-bold cursor-pointer"><input type="checkbox" class="mp-present" ${s.present?'checked':''}> Present</label>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs font-semibold text-slate-600">Present %</label><input type="range" min="0" max="100" value="${s.present_pct}" class="w-full mp-present-pct"><div class="text-xs text-slate-500 text-center"><span class="mp-present-val">${s.present_pct}</span>%</div></div>
            <div><label class="text-xs font-semibold text-slate-600">Contribution %</label><input type="range" min="0" max="100" value="${s.contribution}" class="w-full mp-contrib"><div class="text-xs text-slate-500 text-center"><span class="mp-contrib-val">${s.contribution}</span>%</div></div>
            <div><label class="text-xs font-semibold text-slate-600">Understanding %</label><input type="range" min="0" max="100" value="${s.understanding}" class="w-full mp-understand"><div class="text-xs text-slate-500 text-center"><span class="mp-understand-val">${s.understanding}</span>%</div></div>
            <div><label class="text-xs font-semibold text-slate-600">Till Close %</label><div class="flex items-center gap-2"><input type="checkbox" class="mp-stayed" ${s.stayed_till_close?'checked':''}><input type="range" min="0" max="100" value="${s.stayed_pct}" class="w-full mp-stayed-pct"><span class="mp-stayed-val text-xs">${s.stayed_pct}%</span></div></div>
          </div>
          <div class="mt-2 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <span class="text-xs font-bold text-slate-600">Overall</span><span class="mp-overall text-sm font-black text-brand-600">--%</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <input type="hidden\" id=\"mp-meeting-id\" value=\"${meetingId}\">
    <p class="text-xs text-slate-400">Formula: Present 25% + Contribution 30% + Understanding 30% + Till Close 15%. Not present = 0%.</p>
  `;
  document.getElementById('action-modal').classList.remove('hidden');

  // Bind live preview
  document.querySelectorAll('[data-user]').forEach(row=>{
    const present = row.querySelector('.mp-present');
    const presentPct = row.querySelector('.mp-present-pct');
    const contrib = row.querySelector('.mp-contrib');
    const understand = row.querySelector('.mp-understand');
    const stayed = row.querySelector('.mp-stayed');
    const stayedPct = row.querySelector('.mp-stayed-pct');
    const overallEl = row.querySelector('.mp-overall');
    function update(){
      const isPresent = present.checked;
      const pp = Number(presentPct.value);
      const cp = Number(contrib.value);
      const up = Number(understand.value);
      const sp = stayed.checked ? Number(stayedPct.value) : 0;
      row.querySelector('.mp-present-val').textContent = pp;
      row.querySelector('.mp-contrib-val').textContent = cp;
      row.querySelector('.mp-understand-val').textContent = up;
      row.querySelector('.mp-stayed-val').textContent = sp;
      let overall = 0;
      if(!isPresent) overall = 0; else overall = Math.round(pp*0.25 + cp*0.30 + up*0.30 + sp*0.15);
      overallEl.textContent = overall + '%';
      overallEl.className = `mp-overall text-sm font-black ${overall>=80?'text-emerald-600': overall>=60?'text-brand-600':'text-amber-600'}`;
    }
    [present, presentPct, contrib, understand, stayed, stayedPct].forEach(el=> el.addEventListener('input', update));
    update();
  });

  document.getElementById('modal-form').onsubmit = async (e)=>{
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Saving…';
    const mid = document.getElementById('mp-meeting-id').value;
    const rows = document.querySelectorAll('[data-user]');
    const payloads = [];
    rows.forEach(row=>{
      payloads.push({
        meeting_id: mid,
        user_id: row.dataset.user,
        present: row.querySelector('.mp-present').checked,
        present_pct: Number(row.querySelector('.mp-present-pct').value),
        contribution: Number(row.querySelector('.mp-contrib').value),
        understanding: Number(row.querySelector('.mp-understand').value),
        stayed_till_close: row.querySelector('.mp-stayed').checked,
        stayed_pct: Number(row.querySelector('.mp-stayed-pct').value),
        scored_by: window.currentUser.id,
      });
    });
    try {
      const sb = window.sbClient;
      // Upsert per attendee
      let ok = false;
      try {
        for(const p of payloads){
          await sb.from('meeting_participants').upsert(p, { onConflict: 'meeting_id,user_id' });
        }
        ok = true;
      } catch(err) {
        // Fallback local
        localStorage.setItem(`meeting_scores:${mid}`, JSON.stringify(payloads));
        ok = true;
        showToast('Saved locally — run schema.v4.meetings-tasks.sql to enable cloud');
      }
      if(ok){ showToast('Attendance saved!'); closeActionModal(); if(typeof loadMeetings==='function') loadMeetings(); }
    } catch(err){ showToast(err.message, true); }
    btn.disabled=false; btn.textContent='Save';
  };
}

async function viewMeetingScores(meetingId) {
  const sb = window.sbClient;
  let scores = [];
  try {
    const { data } = await sb.from('meeting_participants').select('*, profiles:user_id(full_name, email)').eq('meeting_id', meetingId);
    scores = data || [];
  } catch(e){
    scores = JSON.parse(localStorage.getItem(`meeting_scores:${meetingId}`)||'[]');
  }
  document.getElementById('modal-title').textContent = 'Meeting Scores';
  document.getElementById('modal-fields').innerHTML = scores.length ? `
    <div class="overflow-x-auto">
      <table class="w-full text-xs text-left">
        <thead class="bg-slate-50 text-slate-500 font-bold"><tr><th class="p-2">Member</th><th class="p-2">Present</th><th class="p-2">Contrib</th><th class="p-2">Understand</th><th class="p-2">Till Close</th><th class="p-2">Overall</th></tr></thead>
        <tbody class="divide-y">
          ${scores.map(s=> `<tr>
            <td class="p-2 font-bold">${escapeHtml(s.profiles?.full_name || s.user_id.slice(0,6))}</td>
            <td class="p-2">${s.present? s.present_pct+'%':'Absent'}</td>
            <td class="p-2">${s.contribution}%</td>
            <td class="p-2">${s.understanding}%</td>
            <td class="p-2">${s.stayed_till_close? s.stayed_pct+'%':'Left early'}</td>
            <td class="p-2 font-black ${s.overall_pct>=80?'text-emerald-600': s.overall_pct>=50?'text-brand-600':'text-red-600'}">${s.overall_pct||0}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="text-xs text-slate-400 mt-3">Avg: ${scores.length ? Math.round(scores.reduce((a,b)=>a+(b.overall_pct||0),0)/scores.length) : 0}% • ${scores.filter(s=>s.present).length}/${scores.length} present</p>
    </div>
  ` : '<p class="text-xs text-slate-400 text-center py-6">No scores yet. Click "Score Attendance" on meeting.</p>';
  document.getElementById('action-modal').classList.remove('hidden');
  document.getElementById('modal-form').onsubmit = (e)=>{ e.preventDefault(); closeActionModal(); };
}

window.openMeetingScoring = openMeetingScoring;
window.viewMeetingScores = viewMeetingScores;
