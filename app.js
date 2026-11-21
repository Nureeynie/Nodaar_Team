// ==============================================================================
// NODAAR TEAM HUB — Full Enterprise App Logic v2.0
// Features: Roles, Notifications, Avatar, Profile Settings, Mobile Nav, Task Filters
// ==============================================================================

let sbClient = null;
let currentUser = null;
let currentProfile = null;
let activeTab = 'tasks';
let allRoles = [];

const SB_URL = 'https://xzrczuoxlujzmztkupbz.supabase.co';
const SB_KEY = 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN';

// ─────────────────────────────────────────────
// 1. INIT
// ─────────────────────────────────────────────
function initSupabase() {
  try {
    sbClient = window.supabase.createClient(SB_URL, SB_KEY);
    return true;
  } catch (err) {
    console.error('Supabase init failed:', err);
    return false;
  }
}

async function checkAuth() {
  if (!initSupabase()) return;
  const { data: { session } } = await sbClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchProfile();
    showApp();
  } else {
    showAuth();
  }
  sbClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      currentUser = session.user;
      await fetchProfile();
      showApp();
    } else {
      currentUser = null; currentProfile = null;
      showAuth();
    }
  });
}

// ─────────────────────────────────────────────
// 2. PROFILE
// ─────────────────────────────────────────────
async function fetchProfile() {
  if (!currentUser) return;
  try {
    const { data } = await sbClient.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    const prof = data || {
      id: currentUser.id, email: currentUser.email,
      full_name: currentUser.email.split('@')[0],
      role: 'Member', access_level: 'Member'
    };
    if (currentUser.email === 'nodaarltd@gmail.com') {
      prof.access_level = 'Admin'; prof.role = prof.role || 'Founder / Admin';
    }
    currentProfile = prof;
    updateSidebarUser();
  } catch (err) { console.error('fetchProfile:', err); }
}

function updateSidebarUser() {
  const p = currentProfile;
  if (!p) return;
  const name = p.full_name || p.email || 'User';
  const role = p.role || 'Member';

  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;

  // Sidebar avatar
  const avatarEl = document.getElementById('sidebar-avatar');
  if (avatarEl) {
    if (p.avatar_url) {
      avatarEl.innerHTML = `<img src="${p.avatar_url}" class="w-full h-full object-cover" alt="Avatar">`;
    } else {
      avatarEl.textContent = name.charAt(0).toUpperCase();
    }
  }

  // Show/hide admin elements
  const rolesBtn = document.getElementById('roles-nav-btn');
  if (rolesBtn) rolesBtn.style.display = p.access_level === 'Admin' ? 'flex' : 'none';

  loadNotifBadge();
}

// ─────────────────────────────────────────────
// 3. NAVIGATION
// ─────────────────────────────────────────────
const TAB_META = {
  tasks:   { title:'Tasks & Deliverables', sub:'Track assignments and open Google Drive attachments', btn:'New Task' },
  reports: { title:'Daily Standup Reports', sub:'Submit what you worked on and attach Drive proof-of-work', btn:'New Standup' },
  okrs:    { title:'Quarterly OKRs & Goals', sub:'High-level business and product targets', btn:'New OKR' },
  meetings:{ title:'Team Meetings & Notes', sub:'Video links, agendas and Drive meeting notes', btn:'New Meeting' },
  ideas:   { title:'Ideas & Innovation Decks', sub:'Pitch initiatives with Google Docs / Slides attachments', btn:'New Idea' },
  team:    { title:'Team Directory', sub:'View colleagues, responsibilities, and contact info', btn:'' },
  roles:   { title:'Roles & Permissions', sub:'Create roles, assign members and task categories', btn:'New Role' },
  profile: { title:'Profile & Settings', sub:'Edit your profile, avatar and account settings', btn:'' },
};

function navigate(tab) {
  activeTab = tab;
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

  // Sidebar active state
  document.querySelectorAll('#sidebar-nav .nav-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.querySelector(`[data-tab="${tab}"]`);
  if (target) target.classList.add('active');

  // Bottom nav active state
  document.querySelectorAll('.bottom-nav button').forEach(btn => {
    btn.classList.remove('text-brand-500');
    btn.classList.add('text-slate-500');
  });
  const bnBtn = document.getElementById(`bn-${tab}`);
  if (bnBtn) { bnBtn.classList.add('text-brand-500'); bnBtn.classList.remove('text-slate-500'); }

  const section = document.getElementById(`view-${tab}`);
  if (section) section.classList.remove('hidden');

  const meta = TAB_META[tab] || { title:'Workspace', sub:'', btn:'' };
  document.getElementById('page-title').textContent = meta.title;
  document.getElementById('page-subtitle').textContent = meta.sub;

  const actionBtn = document.getElementById('primary-action-btn');
  const actionText = document.getElementById('action-btn-text');
  if (meta.btn) {
    actionBtn.classList.remove('hidden');
    actionText.textContent = meta.btn;
  } else {
    actionBtn.classList.add('hidden');
  }

  loadTabData(tab);
  closeMobileSidebar();
  // close notif panel
  document.getElementById('notif-panel').classList.add('hidden');
}

async function loadTabData(tab) {
  switch (tab) {
    case 'tasks':   await loadTasks(); break;
    case 'reports': await loadReports(); break;
    case 'okrs':    await loadOKRs(); break;
    case 'meetings':await loadMeetings(); break;
    case 'ideas':   await loadIdeas(); break;
    case 'team':    await loadTeam(); break;
    case 'roles':   await loadRoles(); break;
    case 'profile': loadProfilePage(); break;
  }
}

// ─────────────────────────────────────────────
// 4. TASKS
// ─────────────────────────────────────────────
async function loadTasks() {
  const container = document.getElementById('tasks-container');
  container.innerHTML = loadingHTML('col-span-3');

  const filter = document.getElementById('task-filter')?.value || 'all';
  const priFilter = document.getElementById('task-priority-filter')?.value || 'all';

  let query = sbClient.from('tasks').select('*, profiles:assignee_id(full_name, email, avatar_url), roles:role_id(name,color)').order('created_at', { ascending: false });

  if (filter === 'mine') query = query.eq('assignee_id', currentUser.id);
  else if (filter === 'role' && currentProfile?.role_id) query = query.eq('role_id', currentProfile.role_id);
  if (priFilter !== 'all') query = query.eq('priority', priFilter);

  const { data: tasks, error } = await query;

  if (error || !tasks || tasks.length === 0) {
    container.innerHTML = `<div class="col-span-3 text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
      <div class="text-4xl mb-3">📋</div>
      <div class="text-sm font-bold text-navy-900 mb-1">No tasks found</div>
      <p class="text-xs text-slate-400 mb-4">Create your first task and attach a Google Drive link.</p>
      <button onclick="openActionModal()" class="px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl shadow">+ Create Task</button>
    </div>`;
    return;
  }

  const columns = { 'To Do': [], 'In Progress': [], 'Done': [] };
  tasks.forEach(t => { (columns[t.status] || columns['To Do']).push(t); });

  const colColors = { 'To Do': 'border-slate-300', 'In Progress': 'border-blue-400', 'Done': 'border-emerald-400' };
  const colHeaders = { 'To Do': '⬜ To Do', 'In Progress': '🔵 In Progress', 'Done': '✅ Done' };

  container.innerHTML = ['To Do', 'In Progress', 'Done'].map(col => `
    <div class="bg-white rounded-3xl border-2 ${colColors[col]} p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-black text-navy-900">${colHeaders[col]}</span>
        <span class="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">${columns[col].length}</span>
      </div>
      <div class="space-y-3 kanban-col">
        ${columns[col].map(taskCard).join('') || `<div class="text-center text-xs text-slate-300 py-6">Empty</div>`}
      </div>
    </div>
  `).join('');
}

function taskCard(t) {
  const priColors = { Critical:'bg-red-50 text-red-700 border-red-200', High:'bg-orange-50 text-orange-700 border-orange-200', Medium:'bg-amber-50 text-amber-700 border-amber-200', Low:'bg-emerald-50 text-emerald-700 border-emerald-200' };
  const pColor = priColors[t.priority] || priColors.Medium;
  const name = t.profiles?.full_name || 'Unassigned';
  const initials = name.charAt(0).toUpperCase();
  const avatarSrc = t.profiles?.avatar_url;
  const avatarHtml = avatarSrc
    ? `<img src="${avatarSrc}" class="w-6 h-6 rounded-full object-cover" alt="">`
    : `<div class="w-6 h-6 rounded-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white text-[9px] font-black flex items-center justify-center">${initials}</div>`;
  const roleTag = t.roles ? `<span class="pill text-[9px]" style="background:${t.roles.color}22;color:${t.roles.color};border:1px solid ${t.roles.color}44;">${escapeHtml(t.roles.name)}</span>` : '';
  const dueTag = t.due_date ? `<span class="text-[9px] text-slate-400 font-medium">📅 ${t.due_date}</span>` : '';

  return `
  <div class="card-hover bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 group">
    <div class="flex items-start justify-between gap-2 mb-2">
      <h4 class="font-bold text-xs text-navy-900 leading-snug flex-1">${escapeHtml(t.title)}</h4>
      <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded border flex-shrink-0 ${pColor}">${t.priority}</span>
    </div>
    ${t.description ? `<p class="text-[11px] text-slate-500 line-clamp-2 mb-2">${escapeHtml(t.description)}</p>` : ''}
    <div class="flex flex-wrap items-center gap-1.5 mb-3">${roleTag}${dueTag}</div>
    <div class="flex items-center justify-between pt-2.5 border-t border-slate-200/60">
      <div class="flex items-center gap-1.5">
        ${avatarHtml}
        <span class="text-[10px] text-slate-500 font-medium truncate max-w-[80px]">${escapeHtml(name)}</span>
      </div>
      <div class="flex items-center gap-1">
        ${t.drive_link ? `<a href="${t.drive_link}" target="_blank" rel="noopener" class="p-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-600 transition" title="Open Drive"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg></a>` : ''}
        <button onclick="openEditTaskModal('${t.id}')" class="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition opacity-0 group-hover:opacity-100" title="Edit">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button onclick="deleteTask('${t.id}')" class="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Delete">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
    <select onchange="updateTaskStatus('${t.id}', this.value)" class="mt-2.5 w-full text-[10px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500">
      <option ${t.status==='To Do'?'selected':''}>To Do</option>
      <option ${t.status==='In Progress'?'selected':''}>In Progress</option>
      <option ${t.status==='Done'?'selected':''}>Done</option>
    </select>
  </div>`;
}

async function updateTaskStatus(id, status) {
  await sbClient.from('tasks').update({ status }).eq('id', id);
  showToast(`Moved to ${status}`);
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await sbClient.from('tasks').delete().eq('id', id);
  showToast('Task deleted');
  loadTasks();
}

// ─────────────────────────────────────────────
// 5. REPORTS
// ─────────────────────────────────────────────
async function loadReports() {
  const container = document.getElementById('reports-list');
  const { data: reports } = await sbClient.from('reports').select('*, profiles:user_id(full_name, role, avatar_url)').order('created_at', { ascending: false }).limit(30);

  if (!reports || reports.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">No reports yet. Submit your first standup above!</div>';
    return;
  }

  container.innerHTML = reports.map(r => {
    const name = r.profiles?.full_name || 'Member';
    const initials = name.charAt(0).toUpperCase();
    const avatarSrc = r.profiles?.avatar_url;
    const avatarHtml = avatarSrc
      ? `<img src="${avatarSrc}" class="w-8 h-8 rounded-xl object-cover" alt="">`
      : `<div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-500 to-amber-400 text-white text-xs font-black flex items-center justify-center">${initials}</div>`;
    return `
    <div class="p-4 md:p-5 hover:bg-slate-50/50 transition">
      <div class="flex items-start gap-3 mb-3">
        ${avatarHtml}
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-bold text-xs text-navy-900">${escapeHtml(name)}</span>
            <span class="pill bg-slate-100 text-slate-500">${escapeHtml(r.profiles?.role || 'Team')}</span>
            <span class="text-[10px] text-slate-400">📅 ${r.report_date || ''}</span>
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-sm">${r.mood}</span>
            <span class="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">${r.hours_worked}h</span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <div><span class="font-bold text-navy-900 block mb-1">✅ Done:</span><p class="text-slate-600 whitespace-pre-line">${escapeHtml(r.done_today)}</p></div>
        <div><span class="font-bold text-navy-900 block mb-1">🚀 Tomorrow:</span><p class="text-slate-600 whitespace-pre-line">${escapeHtml(r.plan_tomorrow)}</p></div>
      </div>
      ${r.blockers && r.blockers !== 'None' ? `<div class="mt-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg border border-red-100">⚠️ <b>Blocker:</b> ${escapeHtml(r.blockers)}</div>` : ''}
      ${r.drive_link ? `<a href="${r.drive_link}" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 font-bold hover:underline">📁 Open Drive Proof-of-Work ↗</a>` : ''}
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 6. OKRS
// ─────────────────────────────────────────────
async function loadOKRs() {
  const container = document.getElementById('okrs-container');
  const { data: okrs } = await sbClient.from('okrs').select('*, profiles:owner_id(full_name)').order('quarter');
  if (!okrs || okrs.length === 0) {
    container.innerHTML = '<div class="col-span-2 text-center p-10 bg-white rounded-3xl border text-xs text-slate-400">No OKRs added yet. Click "+ New OKR" to set goals.</div>';
    return;
  }
  container.innerHTML = okrs.map(o => {
    const progress = Math.min(100, Math.round(((o.current - (o.baseline||0)) / ((o.target - (o.baseline||0)) || 1)) * 100));
    const progColor = progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-brand-500' : 'bg-amber-500';
    return `
    <div class="card-hover bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <span class="pill bg-brand-50 text-brand-700 border border-brand-200">${escapeHtml(o.quarter)} Goal</span>
        <span class="text-xs font-semibold text-slate-400">👤 ${escapeHtml(o.profiles?.full_name || 'Team')}</span>
      </div>
      <div>
        <h3 class="font-bold text-sm text-navy-900">${escapeHtml(o.objective)}</h3>
        <p class="text-xs text-slate-500 mt-1">🎯 <b>Key Result:</b> ${escapeHtml(o.key_result)}</p>
      </div>
      <div>
        <div class="flex justify-between text-xs font-bold mb-1.5">
          <span class="text-slate-500">${o.current} / ${o.target} ${o.unit || ''}</span>
          <span class="${progress >= 80 ? 'text-emerald-600' : 'text-brand-600'}">${progress}%</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="${progColor} h-2 rounded-full transition-all duration-700" style="width:${progress}%"></div>
        </div>
      </div>
      ${o.drive_link ? `<a href="${o.drive_link}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline pt-1 border-t border-slate-100 w-full">📁 Strategy in Drive ↗</a>` : ''}
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 7. MEETINGS
// ─────────────────────────────────────────────
async function loadMeetings() {
  const container = document.getElementById('meetings-container');
  const { data: meetings } = await sbClient.from('meetings').select('*').order('meeting_date', { ascending: true });
  if (!meetings || meetings.length === 0) {
    container.innerHTML = '<div class="p-10 text-center bg-white rounded-3xl border text-xs text-slate-400">No meetings scheduled. Click "+ New Meeting" to add one.</div>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = meetings.map(m => {
    const isPast = m.meeting_date < today;
    return `
    <div class="card-hover bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isPast ? 'opacity-60' : ''}">
      <div class="flex gap-4 items-start">
        <div class="flex-shrink-0 w-12 h-12 bg-slate-100 rounded-2xl flex flex-col items-center justify-center border border-slate-200">
          <span class="text-[9px] font-black text-slate-500 uppercase">${new Date(m.meeting_date+'T00:00').toLocaleString('en',{month:'short'})}</span>
          <span class="text-lg font-black text-navy-900 leading-none">${new Date(m.meeting_date+'T00:00').getDate()}</span>
        </div>
        <div>
          <h4 class="font-bold text-sm text-navy-900">${escapeHtml(m.title)}</h4>
          <div class="text-[11px] text-slate-400 mt-0.5">${m.start_time} – ${m.end_time}</div>
          ${m.agenda ? `<p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(m.agenda)}</p>` : ''}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 flex-shrink-0">
        ${m.meet_link ? `<a href="${m.meet_link}" target="_blank" rel="noopener" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">Join Call ↗</a>` : ''}
        ${m.drive_notes_link ? `<a href="${m.drive_notes_link}" target="_blank" rel="noopener" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">📁 Notes</a>` : ''}
        <button onclick="deleteMeeting('${m.id}')" class="p-2 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition" title="Delete">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function deleteMeeting(id) {
  if (!confirm('Delete this meeting?')) return;
  await sbClient.from('meetings').delete().eq('id', id);
  showToast('Meeting deleted');
  loadMeetings();
}

// ─────────────────────────────────────────────
// 8. IDEAS
// ─────────────────────────────────────────────
async function loadIdeas() {
  const container = document.getElementById('ideas-container');
  const { data: ideas } = await sbClient.from('ideas').select('*, profiles:user_id(full_name, avatar_url)').order('created_at', { ascending: false });
  if (!ideas || ideas.length === 0) {
    container.innerHTML = '<div class="col-span-3 text-center p-10 bg-white rounded-3xl border text-xs text-slate-400">No ideas yet. Have an initiative? Click "+ New Idea"!</div>';
    return;
  }
  const statusColors = { 'Proposed':'bg-amber-50 text-amber-800 border-amber-200', 'Approved':'bg-emerald-50 text-emerald-800 border-emerald-200', 'In Review':'bg-blue-50 text-blue-800 border-blue-200', 'Rejected':'bg-red-50 text-red-700 border-red-200' };
  container.innerHTML = ideas.map(i => `
    <div class="card-hover bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <span class="pill border ${statusColors[i.status] || statusColors['Proposed']}">${i.status || 'Proposed'}</span>
        <span class="text-[11px] text-slate-400">by ${escapeHtml(i.profiles?.full_name || 'Member')}</span>
      </div>
      <h4 class="font-bold text-sm text-navy-900">${escapeHtml(i.title)}</h4>
      <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(i.description)}</p>
      ${i.expected_impact ? `<div class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100"><b>💡 Impact:</b> ${escapeHtml(i.expected_impact)}</div>` : ''}
      ${i.drive_link ? `<a href="${i.drive_link}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline pt-2 border-t border-slate-100 w-full">📁 Pitch Deck ↗</a>` : ''}
    </div>`).join('');
}

// ─────────────────────────────────────────────
// 9. TEAM
// ─────────────────────────────────────────────
async function loadTeam() {
  const container = document.getElementById('team-container');
  container.innerHTML = loadingHTML('col-span-4');
  const { data: team } = await sbClient.from('profiles').select('*, roles:role_id(name,color)').order('full_name');
  if (!team || team.length === 0) {
    container.innerHTML = '<div class="col-span-4 text-center p-10 text-xs text-slate-400">No team members found.</div>';
    return;
  }
  container.innerHTML = team.map(u => {
    const name = u.full_name || u.email || 'Member';
    const initials = name.charAt(0).toUpperCase();
    const isAdmin = u.access_level === 'Admin';
    const roleTag = u.roles ? `<span class="pill mt-1" style="background:${u.roles.color}22;color:${u.roles.color};border:1px solid ${u.roles.color}44;">${escapeHtml(u.roles.name)}</span>` : '';
    return `
    <div class="card-hover bg-white p-5 rounded-3xl border border-slate-200 shadow-sm text-center relative">
      ${isAdmin ? '<span class="absolute top-3 right-3 pill bg-purple-100 text-purple-700 border border-purple-200">Admin</span>' : ''}
      <div class="w-16 h-16 rounded-2xl mx-auto mb-3 overflow-hidden shadow-md">
        ${u.avatar_url
          ? `<img src="${u.avatar_url}" class="w-full h-full object-cover" alt="${escapeHtml(name)}">`
          : `<div class="w-full h-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-2xl flex items-center justify-center">${initials}</div>`}
      </div>
      <h4 class="font-bold text-sm text-navy-900">${escapeHtml(name)}</h4>
      <div class="text-xs text-brand-600 font-semibold mt-0.5">${escapeHtml(u.role || 'Member')}</div>
      <div class="text-[11px] text-slate-400 truncate mt-1">${escapeHtml(u.email)}</div>
      ${roleTag}
      ${u.phone ? `<div class="text-[11px] text-slate-400 mt-1">📞 ${escapeHtml(u.phone)}</div>` : ''}
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 10. ROLES
// ─────────────────────────────────────────────
async function loadRoles() {
  const container = document.getElementById('roles-container');
  if (!container) return;
  container.innerHTML = loadingHTML('col-span-3');
  const { data: roles } = await sbClient.from('roles').select('*').order('name');
  allRoles = roles || [];

  // Count members per role
  const { data: profiles } = await sbClient.from('profiles').select('role_id');
  const memberCount = {};
  (profiles || []).forEach(p => { if (p.role_id) memberCount[p.role_id] = (memberCount[p.role_id] || 0) + 1; });

  if (!roles || roles.length === 0) {
    container.innerHTML = `<div class="col-span-3 text-center p-10 bg-white rounded-3xl border border-dashed border-slate-200">
      <div class="text-4xl mb-3">🏷️</div>
      <div class="text-sm font-bold text-navy-900 mb-1">No roles created yet</div>
      <p class="text-xs text-slate-400 mb-4">Create roles to organize your team and assign tasks.</p>
      ${currentProfile?.access_level === 'Admin' ? '<button onclick="openActionModal()" class="px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl shadow">+ Create Role</button>' : ''}
    </div>`;
    return;
  }

  container.innerHTML = roles.map(r => `
    <div class="card-hover bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-11 h-11 rounded-2xl flex-shrink-0 shadow-sm" style="background:${r.color || '#FE8A03'}22;border:2px solid ${r.color || '#FE8A03'}44;">
          <div class="w-full h-full flex items-center justify-center font-black text-lg" style="color:${r.color || '#FE8A03'}">${(r.name||'R').charAt(0).toUpperCase()}</div>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-sm text-navy-900 truncate">${escapeHtml(r.name)}</h4>
          <div class="text-[11px] text-slate-400">${memberCount[r.id] || 0} member${memberCount[r.id] !== 1 ? 's' : ''}</div>
        </div>
        ${currentProfile?.access_level === 'Admin' ? `<button onclick="deleteRole('${r.id}')" class="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition" title="Delete Role"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
      </div>
      ${r.description ? `<p class="text-xs text-slate-500 mb-3 leading-relaxed">${escapeHtml(r.description)}</p>` : ''}
      <div class="pt-3 border-t border-slate-100">
        <div class="text-[10px] font-black text-slate-400 uppercase mb-2">Assign Member</div>
        <div id="role-members-${r.id}" class="space-y-1"></div>
        ${currentProfile?.access_level === 'Admin' ? `<button onclick="openAssignMemberModal('${r.id}','${escapeHtml(r.name)}')" class="mt-2 w-full py-1.5 text-[11px] font-bold text-brand-600 border border-brand-200 hover:bg-brand-50 rounded-xl transition">+ Assign Member</button>` : ''}
      </div>
    </div>`).join('');

  // Load members for each role
  roles.forEach(async r => {
    const { data: members } = await sbClient.from('profiles').select('full_name, email, avatar_url').eq('role_id', r.id);
    const el = document.getElementById(`role-members-${r.id}`);
    if (!el) return;
    if (!members || members.length === 0) { el.innerHTML = '<div class="text-[10px] text-slate-300">No members assigned</div>'; return; }
    el.innerHTML = members.map(m => {
      const n = m.full_name || m.email || 'Member';
      return `<div class="flex items-center gap-2 py-1">
        ${m.avatar_url ? `<img src="${m.avatar_url}" class="w-5 h-5 rounded-full object-cover">` : `<div class="w-5 h-5 rounded-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white text-[8px] font-black flex items-center justify-center">${n.charAt(0).toUpperCase()}</div>`}
        <span class="text-[11px] text-slate-600 font-semibold truncate">${escapeHtml(n)}</span>
      </div>`;
    }).join('');
  });
}

async function deleteRole(id) {
  if (!confirm('Delete this role? Members assigned to it will be unassigned.')) return;
  await sbClient.from('roles').delete().eq('id', id);
  showToast('Role deleted');
  loadRoles();
}

function openAssignMemberModal(roleId, roleName) {
  document.getElementById('modal-title').textContent = `Assign Member to "${roleName}"`;
  document.getElementById('modal-fields').innerHTML = `
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Select Team Member</label>
      <select id="f-member" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        <option value="">Loading…</option>
      </select>
    </div>
    <input type="hidden" id="f-role-id" value="${roleId}">
  `;
  document.getElementById('action-modal').classList.remove('hidden');
  // Populate members
  sbClient.from('profiles').select('id,full_name,email').order('full_name').then(({ data }) => {
    const sel = document.getElementById('f-member');
    if (!sel) return;
    sel.innerHTML = (data || []).map(m => `<option value="${m.id}">${escapeHtml(m.full_name || m.email)}</option>`).join('');
  });
  // override submit
  document.getElementById('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const userId = document.getElementById('f-member').value;
    const rid = document.getElementById('f-role-id').value;
    const { error } = await sbClient.from('profiles').update({ role_id: rid }).eq('id', userId);
    if (error) return showToast(error.message, true);
    showToast('Member assigned to role!');
    closeActionModal();
    resetModalSubmit();
    loadRoles();
  };
}

function resetModalSubmit() {
  document.getElementById('modal-form').onsubmit = handleModalSubmit;
}

// ─────────────────────────────────────────────
// 11. PROFILE PAGE
// ─────────────────────────────────────────────
function loadProfilePage() {
  if (!currentProfile) return;
  const p = currentProfile;
  const name = p.full_name || p.email || 'Member';

  document.getElementById('profile-name-display').textContent = name;
  document.getElementById('profile-role-display').textContent = p.role || 'Member';
  document.getElementById('profile-email-display').textContent = p.email || '';
  document.getElementById('profile-access-badge').textContent = p.access_level || 'Member';
  document.getElementById('profile-access-badge').className = `pill mt-2 ${p.access_level === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`;

  // Large avatar
  const largeAvatar = document.getElementById('profile-avatar-large');
  if (p.avatar_url) {
    largeAvatar.innerHTML = `<img src="${p.avatar_url}" class="w-full h-full object-cover" alt="Avatar">`;
  } else {
    largeAvatar.textContent = name.charAt(0).toUpperCase();
  }

  document.getElementById('pf-name').value = p.full_name || '';
  document.getElementById('pf-role').value = p.role || '';
  document.getElementById('pf-phone').value = p.phone || '';
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  if (file.size > 2 * 1024 * 1024) return showToast('File must be under 2MB', true);

  showToast('Uploading avatar…');
  const ext = file.name.split('.').pop();
  const path = `${currentUser.id}/avatar.${ext}`;

  const { error: upErr } = await sbClient.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return showToast(upErr.message, true);

  const { data: urlData } = sbClient.storage.from('avatars').getPublicUrl(path);
  const avatar_url = urlData.publicUrl + '?t=' + Date.now();

  const { error: dbErr } = await sbClient.from('profiles').update({ avatar_url }).eq('id', currentUser.id);
  if (dbErr) return showToast(dbErr.message, true);

  currentProfile.avatar_url = avatar_url;
  showToast('Avatar updated!');
  loadProfilePage();
  updateSidebarUser();
}

document.addEventListener('DOMContentLoaded', () => {
  const profileForm = document.getElementById('profile-form');
  if (profileForm) profileForm.onsubmit = async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('pf-name').value.trim();
    const role = document.getElementById('pf-role').value.trim();
    const phone = document.getElementById('pf-phone').value.trim();
    const { error } = await sbClient.from('profiles').update({ full_name, role, phone }).eq('id', currentUser.id);
    if (error) return showToast(error.message, true);
    currentProfile.full_name = full_name;
    currentProfile.role = role;
    currentProfile.phone = phone;
    showToast('Profile saved!');
    updateSidebarUser();
    loadProfilePage();
  };

  const pwForm = document.getElementById('pw-form');
  if (pwForm) pwForm.onsubmit = async (e) => {
    e.preventDefault();
    const np = document.getElementById('pf-newpw').value;
    const cp = document.getElementById('pf-confirmpw').value;
    if (np.length < 6) return showToast('Password must be at least 6 characters', true);
    if (np !== cp) return showToast('Passwords do not match', true);
    const { error } = await sbClient.auth.updateUser({ password: np });
    if (error) return showToast(error.message, true);
    showToast('Password updated successfully!');
    document.getElementById('pw-form').reset();
  };
});

// ─────────────────────────────────────────────
// 12. NOTIFICATIONS
// ─────────────────────────────────────────────
async function loadNotifBadge() {
  if (!currentUser) return;
  try {
    const { count } = await sbClient.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('read', false);
    const badge = document.getElementById('notif-badge');
    if (badge) badge.classList.toggle('hidden', !count || count === 0);
  } catch {}
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  if (!currentUser) return;
  const { data: notifs } = await sbClient.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
  if (!notifs || notifs.length === 0) {
    list.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">No notifications yet</div>';
    return;
  }
  const typeIcons = { info:'ℹ️', success:'✅', warning:'⚠️', task:'📋', meeting:'📅' };
  list.innerHTML = notifs.map(n => `
    <div class="flex items-start gap-3 p-4 ${n.read ? 'opacity-60' : 'bg-brand-50/40'} hover:bg-slate-50 transition cursor-pointer" onclick="markNotifRead('${n.id}')${n.link_tab ? `;navigate('${n.link_tab}')` : ''}">
      <span class="text-lg flex-shrink-0">${typeIcons[n.type] || 'ℹ️'}</span>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold text-navy-900">${escapeHtml(n.title)}</div>
        ${n.message ? `<div class="text-[11px] text-slate-500 mt-0.5 line-clamp-2">${escapeHtml(n.message)}</div>` : ''}
        <div class="text-[10px] text-slate-300 mt-1">${new Date(n.created_at).toLocaleString()}</div>
      </div>
      ${!n.read ? '<div class="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5"></div>' : ''}
    </div>`).join('');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadNotifications();
}

async function markNotifRead(id) {
  await sbClient.from('notifications').update({ read: true }).eq('id', id);
  loadNotifications(); loadNotifBadge();
}

async function markAllNotifsRead() {
  if (!currentUser) return;
  await sbClient.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
  loadNotifications(); loadNotifBadge();
  showToast('All notifications marked as read');
}

async function createNotification(userId, title, message, type = 'info', link_tab = null) {
  try {
    await sbClient.from('notifications').insert({ user_id: userId, title, message, type, link_tab });
  } catch {}
}

// ─────────────────────────────────────────────
// 13. ACTION MODAL
// ─────────────────────────────────────────────
async function openActionModal() {
  const modal = document.getElementById('action-modal');
  const fields = document.getElementById('modal-fields');
  const title = document.getElementById('modal-title');

  // Load roles for dropdowns
  if (allRoles.length === 0) {
    const { data } = await sbClient.from('roles').select('id, name');
    allRoles = data || [];
  }
  const roleOptions = `<option value="">No Role</option>` + allRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

  // Load team members for assignee
  const { data: members } = await sbClient.from('profiles').select('id,full_name,email').order('full_name');
  const memberOptions = `<option value="${currentUser.id}">(Me)</option>` +
    (members || []).filter(m => m.id !== currentUser.id).map(m => `<option value="${m.id}">${escapeHtml(m.full_name || m.email)}</option>`).join('');

  if (activeTab === 'tasks') {
    title.textContent = 'New Task';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Task Title *</label><input id="f-title" type="text" required placeholder="Launch marketing campaign" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="f-desc" rows="2" placeholder="Deliverables and expectations..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Priority</label><select id="f-pri" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"><option>Medium</option><option>High</option><option>Critical</option><option>Low</option></select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Due Date</label><input id="f-due" type="date" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Assign To</label><select id="f-assignee" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${memberOptions}</select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Role</label><select id="f-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${roleOptions}</select></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Drive Link</label><input id="f-link" type="url" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;

  } else if (activeTab === 'okrs') {
    title.textContent = 'New OKR';
    fields.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Quarter</label><select id="f-q" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"><option>Q1</option><option>Q2</option><option>Q3</option><option selected>Q4</option></select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Unit</label><input id="f-unit" type="text" value="%" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Objective *</label><input id="f-obj" type="text" required placeholder="Scale Client Base" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Key Result *</label><input id="f-kr" type="text" required placeholder="Acquire 100 new paying clients" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Target</label><input id="f-target" type="number" required value="100" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Current Progress</label><input id="f-current" type="number" value="0" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Drive Strategy Doc</label><input id="f-link" type="url" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;

  } else if (activeTab === 'meetings') {
    title.textContent = 'Schedule Meeting';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Meeting Title *</label><input id="f-title" type="text" required placeholder="Weekly Marketing Sync" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Date *</label><input id="f-date" type="date" required class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Start</label><input id="f-start" type="time" value="09:00" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">End</label><input id="f-end" type="time" value="10:00" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Meet Link</label><input id="f-meet" type="url" placeholder="https://meet.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Drive Notes Doc</label><input id="f-notes" type="url" placeholder="https://docs.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Agenda</label><textarea id="f-agenda" rows="2" placeholder="Review Q4 progress..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"></textarea></div>`;

  } else if (activeTab === 'ideas') {
    title.textContent = 'Pitch an Idea';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Title *</label><input id="f-title" type="text" required placeholder="Community Ambassador Program" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description *</label><textarea id="f-desc" rows="3" required placeholder="Outline your initiative..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"></textarea></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Expected Impact</label><input id="f-impact" type="text" placeholder="Estimated +20% engagement..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Pitch Deck / Slides Link</label><input id="f-link" type="url" placeholder="https://docs.google.com/presentation/d/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;

  } else if (activeTab === 'roles') {
    title.textContent = 'Create New Role';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Role Name *</label><input id="f-title" type="text" required placeholder="Marketing Team" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="f-desc" rows="2" placeholder="Responsible for all marketing activities..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"></textarea></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Role Color</label>
        <div class="flex items-center gap-3">
          <input id="f-color" type="color" value="#FE8A03" class="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer">
          <span class="text-xs text-slate-400">Pick a color to identify this role</span>
        </div>
      </div>`;
  }

  modal.classList.remove('hidden');
  document.getElementById('modal-form').onsubmit = handleModalSubmit;
}

async function handleModalSubmit(e) {
  e.preventDefault();
  const btn = this.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (activeTab === 'tasks') {
      const title = document.getElementById('f-title').value;
      const description = document.getElementById('f-desc').value;
      const priority = document.getElementById('f-pri').value;
      const due_date = document.getElementById('f-due').value || null;
      const assignee_id = document.getElementById('f-assignee').value || currentUser.id;
      const role_id = document.getElementById('f-role-id').value || null;
      const drive_link = document.getElementById('f-link').value || null;
      const { error } = await sbClient.from('tasks').insert({ title, description, priority, due_date, drive_link, assignee_id, role_id });
      if (error) throw error;
      // Notify assignee
      if (assignee_id !== currentUser.id) {
        await createNotification(assignee_id, 'New Task Assigned', `"${title}" has been assigned to you.`, 'task', 'tasks');
      }
      showToast('Task created!'); closeActionModal(); loadTasks();

    } else if (activeTab === 'okrs') {
      const quarter = document.getElementById('f-q').value;
      const unit = document.getElementById('f-unit').value;
      const objective = document.getElementById('f-obj').value;
      const key_result = document.getElementById('f-kr').value;
      const target = Number(document.getElementById('f-target').value);
      const current = Number(document.getElementById('f-current').value);
      const drive_link = document.getElementById('f-link').value || null;
      const { error } = await sbClient.from('okrs').insert({ quarter, unit, objective, key_result, target, current, drive_link, owner_id: currentUser.id });
      if (error) throw error;
      showToast('OKR saved!'); closeActionModal(); loadOKRs();

    } else if (activeTab === 'meetings') {
      const title = document.getElementById('f-title').value;
      const meeting_date = document.getElementById('f-date').value;
      const start_time = document.getElementById('f-start').value;
      const end_time = document.getElementById('f-end').value;
      const meet_link = document.getElementById('f-meet').value || null;
      const drive_notes_link = document.getElementById('f-notes').value || null;
      const agenda = document.getElementById('f-agenda').value || null;
      const { error } = await sbClient.from('meetings').insert({ title, meeting_date, start_time, end_time, meet_link, drive_notes_link, agenda });
      if (error) throw error;
      showToast('Meeting scheduled!'); closeActionModal(); loadMeetings();

    } else if (activeTab === 'ideas') {
      const title = document.getElementById('f-title').value;
      const description = document.getElementById('f-desc').value;
      const expected_impact = document.getElementById('f-impact').value || null;
      const drive_link = document.getElementById('f-link').value || null;
      const { error } = await sbClient.from('ideas').insert({ user_id: currentUser.id, title, description, expected_impact, drive_link });
      if (error) throw error;
      showToast('Idea submitted!'); closeActionModal(); loadIdeas();

    } else if (activeTab === 'roles') {
      const name = document.getElementById('f-title').value;
      const description = document.getElementById('f-desc').value || null;
      const color = document.getElementById('f-color').value || '#FE8A03';
      const { error } = await sbClient.from('roles').insert({ name, description, color });
      if (error) throw error;
      showToast('Role created!'); closeActionModal(); loadRoles();
    }
  } catch (err) {
    showToast(err.message || 'Error saving', true);
  }
  btn.disabled = false; btn.textContent = 'Save';
}

function closeActionModal() {
  document.getElementById('action-modal').classList.add('hidden');
}

// Edit task modal
async function openEditTaskModal(id) {
  const { data: t } = await sbClient.from('tasks').select('*').eq('id', id).single();
  if (!t) return;
  const { data: members } = await sbClient.from('profiles').select('id,full_name,email').order('full_name');
  const memberOptions = (members || []).map(m => `<option value="${m.id}" ${m.id === t.assignee_id ? 'selected' : ''}>${escapeHtml(m.full_name || m.email)}</option>`).join('');
  const roleOptions = `<option value="">No Role</option>` + allRoles.map(r => `<option value="${r.id}" ${r.id === t.role_id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

  document.getElementById('modal-title').textContent = 'Edit Task';
  document.getElementById('modal-fields').innerHTML = `
    <div><label class="block text-xs font-bold text-slate-600 mb-1">Task Title</label><input id="f-title" type="text" required value="${escapeHtml(t.title)}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
    <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="f-desc" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none">${escapeHtml(t.description || '')}</textarea></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Priority</label><select id="f-pri" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"><option ${t.priority==='Low'?'selected':''}>Low</option><option ${t.priority==='Medium'?'selected':''}>Medium</option><option ${t.priority==='High'?'selected':''}>High</option><option ${t.priority==='Critical'?'selected':''}>Critical</option></select></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Status</label><select id="f-status" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"><option ${t.status==='To Do'?'selected':''}>To Do</option><option ${t.status==='In Progress'?'selected':''}>In Progress</option><option ${t.status==='Done'?'selected':''}>Done</option></select></div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Assign To</label><select id="f-assignee" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${memberOptions}</select></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Role</label><select id="f-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${roleOptions}</select></div>
    </div>
    <div><label class="block text-xs font-bold text-slate-600 mb-1">Due Date</label><input id="f-due" type="date" value="${t.due_date || ''}" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
    <div><label class="block text-xs font-bold text-slate-600 mb-1">Drive Link</label><input id="f-link" type="url" value="${t.drive_link || ''}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;

  document.getElementById('action-modal').classList.remove('hidden');
  document.getElementById('modal-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const { error } = await sbClient.from('tasks').update({
      title: document.getElementById('f-title').value,
      description: document.getElementById('f-desc').value,
      priority: document.getElementById('f-pri').value,
      status: document.getElementById('f-status').value,
      assignee_id: document.getElementById('f-assignee').value,
      role_id: document.getElementById('f-role-id').value || null,
      due_date: document.getElementById('f-due').value || null,
      drive_link: document.getElementById('f-link').value || null,
    }).eq('id', id);
    if (error) return showToast(error.message, true);
    showToast('Task updated!'); closeActionModal(); resetModalSubmit(); loadTasks();
  };
}

// ─────────────────────────────────────────────
// 14. AUTH & HELPERS
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Show/hide password toggle
  const toggleBtn = document.getElementById('toggle-pw');
  const pwInput = document.getElementById('auth-password');
  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
    });
  }

  // Auth form submit
  const authForm = document.getElementById('auth-form');
  if (authForm) authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const errBox = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit-btn');
    errBox.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Signing in…';

    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Sign In';

    if (error) {
      errBox.textContent = error.message;
      errBox.classList.remove('hidden');
    } else if (data?.user) {
      currentUser = data.user;
      await fetchProfile();
      showApp();
      showToast('Welcome back to Nodaar Hub! 🎉');
    }
  });

  // Report form
  const reportForm = document.getElementById('report-form');
  if (reportForm) reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sbClient.from('reports').insert({
      user_id: currentUser.id,
      done_today: document.getElementById('rep-done').value,
      plan_tomorrow: document.getElementById('rep-plan').value,
      blockers: document.getElementById('rep-blockers').value || 'None',
      drive_link: document.getElementById('rep-link').value || null,
      hours_worked: Number(document.getElementById('rep-hours').value) || 8,
      mood: document.getElementById('rep-mood').value,
    });
    if (error) return showToast(error.message, true);
    showToast('Standup submitted! ✅');
    reportForm.reset();
    loadReports();
  });

  // Close notif panel on outside click
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notif-panel');
    const bell = document.getElementById('notif-bell');
    if (panel && !panel.contains(e.target) && !bell?.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  checkAuth();
});

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  navigate(activeTab);
}

async function logout() {
  if (!confirm('Sign out of Nodaar Hub?')) return;
  await sbClient.auth.signOut();
  showToast('Signed out');
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.add('mobile-open');
  sidebar.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (window.innerWidth < 768) {
    sidebar.classList.remove('mobile-open');
    sidebar.classList.add('hidden');
  }
  overlay.classList.add('hidden');
}

function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.innerHTML = (isErr ? '❌ ' : '✅ ') + escapeHtml(msg);
  t.className = `fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 text-xs font-semibold px-4 py-3 rounded-xl shadow-xl transition-all duration-300 flex items-center gap-2 max-w-xs ${isErr ? 'bg-red-600 text-white' : 'bg-navy-900 text-white'} opacity-100`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.add('opacity-0'); }, 3200);
}

function loadingHTML(span = '') {
  return `<div class="${span} flex items-center justify-center py-12 text-xs text-slate-400 gap-2">
    <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
    Loading…
  </div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
