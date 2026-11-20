// ==============================================================================
// NODAAR TEAM HUB — SUPABASE CLIENT LOGIC
// 100% Client-side, Real-time, Google Drive Links Integration
// ==============================================================================

let supabase = null;
let currentUser = null;
let currentProfile = null;
let activeTab = 'tasks';

// 1. Initialize Supabase
const DEFAULT_SB_URL = 'https://xzrczuoxlujzmztkupbz.supabase.co';
const DEFAULT_SB_KEY = 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN';

function initSupabase() {
  try {
    supabase = window.supabase.createClient(DEFAULT_SB_URL, DEFAULT_SB_KEY);
    return true;
  } catch (err) {
    console.error('Failed to init Supabase:', err);
    return false;
  }
}

// 2. Auth State Observer
async function checkAuth() {
  if (!initSupabase()) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchProfile();
    showApp();
  } else {
    showAuth();
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      currentUser = session.user;
      await fetchProfile();
      showApp();
    } else {
      currentUser = null;
      currentProfile = null;
      showAuth();
    }
  });
}

// 3. User Profile
async function fetchProfile() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    if (currentUser.email === 'nodaarltd@gmail.com') {
      data.access_level = 'Admin';
      data.role = 'Admin / Founder';
    }
    currentProfile = data;
    currentProfile = data;
    document.getElementById('user-display-name').textContent = data.full_name || currentUser.email;
    document.getElementById('user-display-email').textContent = `${data.role || 'Member'} · ${data.email}`;
  }
}

// 4. View Navigation
function navigate(tab) {
  activeTab = tab;
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const activeSection = document.getElementById(`view-${tab}`);
  if (activeSection) activeSection.classList.remove('hidden');

  // Highlight menu
  const targetIndex = ['tasks', 'reports', 'okrs', 'meetings', 'ideas', 'team'].indexOf(tab);
  const buttons = document.querySelectorAll('#sidebar-nav .nav-btn');
  if (buttons[targetIndex]) buttons[targetIndex].classList.add('active');

  // Update header text
  const titles = {
    tasks: ['Tasks & Deliverables', 'Track assignments and open Google Drive attachments', 'New Task'],
    reports: ['Daily Standup Reports', 'Submit what you worked on today and attach Drive proof-of-work', 'New Standup'],
    okrs: ['Quarterly OKRs & Goals', 'High-level business and product targets', 'New OKR'],
    meetings: ['Team Meetings & Notes', 'Access video links, agendas, and Drive meeting notes', 'New Meeting'],
    ideas: ['Ideas & Innovation Decks', 'Pitch initiatives with Google Docs / Slides attachments', 'New Idea'],
    team: ['Team Roster', 'View colleagues, responsibilities, and contact info', '']
  };

  const [title, sub, btnText] = titles[tab] || ['Workspace', '', ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = sub;
  
  const actionBtn = document.getElementById('primary-action-btn');
  if (btnText) {
    actionBtn.classList.remove('hidden');
    document.getElementById('action-btn-text').textContent = btnText;
  } else {
    actionBtn.classList.add('hidden');
  }

  loadTabData(tab);
}

// 5. Data Loaders
async function loadTabData(tab) {
  switch (tab) {
    case 'tasks': await loadTasks(); break;
    case 'reports': await loadReports(); break;
    case 'okrs': await loadOKRs(); break;
    case 'meetings': await loadMeetings(); break;
    case 'ideas': await loadIdeas(); break;
    case 'team': await loadTeam(); break;
  }
}

// --- TASKS LOADER ---
async function loadTasks() {
  const container = document.getElementById('tasks-container');
  container.innerHTML = '<div class="text-xs text-slate-400 p-4">Loading tasks...</div>';

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*, profiles:assignee_id(full_name, email)')
    .order('created_at', { ascending: false });

  if (error || !tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
        <div class="text-2xl mb-2">📋</div>
        <div class="text-sm font-bold text-navy-900">No tasks created yet</div>
        <p class="text-xs text-slate-400 mb-4">Create your first task and attach a Google Drive link.</p>
        <button onclick="openActionModal()" class="px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl shadow">+ Create Task</button>
      </div>`;
    return;
  }

  const columns = { 'To Do': [], 'In Progress': [], 'Done': [] };
  tasks.forEach(t => {
    if (columns[t.status]) columns[t.status].push(t);
    else columns['To Do'].push(t);
  });

  let html = '';
  ['To Do', 'In Progress', 'Done'].forEach(col => {
    html += `
      <div class="bg-slate-100/70 p-4 rounded-3xl border border-slate-200/60">
        <div class="flex items-center justify-between mb-3 px-1">
          <span class="text-xs font-black text-navy-900 uppercase tracking-wider">${col}</span>
          <span class="text-xs font-bold bg-white text-slate-600 px-2.5 py-0.5 rounded-full shadow-sm">${columns[col].length}</span>
        </div>
        <div class="space-y-3">
          ${columns[col].map(taskCard).join('')}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function taskCard(t) {
  const driveBtn = t.drive_link ? `
    <a href="${t.drive_link}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition border border-brand-500/20">
      <span>📁</span> Drive Deliverable
    </a>` : '';

  const priorityColors = {
    Critical: 'bg-red-50 text-red-700 border-red-200',
    High: 'bg-orange-50 text-orange-700 border-orange-200',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200',
    Low: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };

  return `
    <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h4 class="font-bold text-xs text-navy-900 leading-snug">${escapeHtml(t.title)}</h4>
        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${priorityColors[t.priority] || priorityColors.Medium}">${t.priority}</span>
      </div>
      <p class="text-[11px] text-slate-500 line-clamp-2 mb-3">${escapeHtml(t.description || 'No description.')}</p>
      
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div class="text-[10px] text-slate-400 font-medium">👤 ${escapeHtml(t.profiles?.full_name || 'Unassigned')}</div>
        ${driveBtn}
      </div>

      <div class="mt-3 pt-2 flex items-center justify-between border-t border-slate-50">
        <select onchange="updateTaskStatus('${t.id}', this.value)" class="text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-600 focus:outline-none">
          <option ${t.status === 'To Do' ? 'selected' : ''}>To Do</option>
          <option ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option ${t.status === 'Done' ? 'selected' : ''}>Done</option>
        </select>
        <button onclick="deleteTask('${t.id}')" class="text-slate-300 hover:text-red-500 text-xs">🗑</button>
      </div>
    </div>
  `;
}

// --- REPORTS LOADER ---
async function loadReports() {
  const container = document.getElementById('reports-list');
  const { data: reports, error } = await supabase
    .from('reports')
    .select('*, profiles:user_id(full_name, email, role)')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!reports || reports.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">No reports submitted yet. Use the form above to post your first standup!</div>';
    return;
  }

  container.innerHTML = reports.map(r => `
    <div class="p-5 hover:bg-slate-50/50 transition">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-xs text-navy-900">${escapeHtml(r.profiles?.full_name || 'Member')}</span>
          <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">${escapeHtml(r.profiles?.role || 'Team')}</span>
          <span class="text-[10px] text-slate-400">📅 ${r.report_date}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs">${r.mood}</span>
          <span class="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">${r.hours_worked}h</span>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 mt-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
        <div>
          <span class="font-bold text-slate-900 block mb-0.5">✅ Done:</span>
          <p class="text-slate-600 whitespace-pre-line">${escapeHtml(r.done_today)}</p>
        </div>
        <div>
          <span class="font-bold text-slate-900 block mb-0.5">🚀 Plan Tomorrow:</span>
          <p class="text-slate-600 whitespace-pre-line">${escapeHtml(r.plan_tomorrow)}</p>
        </div>
      </div>
      ${r.blockers && r.blockers !== 'None' ? `
        <div class="mt-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg font-medium border border-red-100">
          ⚠️ <b>Blocker:</b> ${escapeHtml(r.blockers)}
        </div>` : ''}
      ${r.drive_link ? `
        <div class="mt-2">
          <a href="${r.drive_link}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-xs text-brand-600 font-bold hover:underline">
            📁 Open Drive Attachment / Proof of Work ↗
          </a>
        </div>` : ''}
    </div>
  `).join('');
}

// --- OKRs LOADER ---
async function loadOKRs() {
  const container = document.getElementById('okrs-container');
  const { data: okrs } = await supabase.from('okrs').select('*, profiles:owner_id(full_name)').order('quarter');

  if (!okrs || okrs.length === 0) {
    container.innerHTML = '<div class="col-span-2 text-center p-8 bg-white rounded-3xl border text-xs text-slate-400">No OKRs added. Click "+ New OKR" to set goals.</div>';
    return;
  }

  container.innerHTML = okrs.map(o => {
    const progress = Math.min(100, Math.round(((o.current - o.baseline) / (o.target - o.baseline || 1)) * 100));
    return `
      <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-black bg-brand-50 text-brand-700 px-3 py-1 rounded-full border border-brand-200">${o.quarter} Goal</span>
          <span class="text-xs font-bold text-slate-400">Owner: ${escapeHtml(o.profiles?.full_name || 'Team')}</span>
        </div>
        <div>
          <h3 class="font-bold text-sm text-navy-900">${escapeHtml(o.objective)}</h3>
          <p class="text-xs text-slate-500 mt-1">🎯 <b>Key Result:</b> ${escapeHtml(o.key_result)}</p>
        </div>
        <div>
          <div class="flex justify-between text-xs font-bold mb-1">
            <span class="text-slate-500">${o.current} / ${o.target} ${o.unit}</span>
            <span class="text-brand-600">${progress}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div class="bg-brand-500 h-2.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
          </div>
        </div>
        ${o.drive_link ? `
          <div class="pt-2 border-t border-slate-100">
            <a href="${o.drive_link}" target="_blank" rel="noopener" class="text-xs font-bold text-brand-600 hover:underline">
              📁 View Goal Strategy in Google Drive ↗
            </a>
          </div>` : ''}
      </div>
    `;
  }).join('');
}

// --- MEETINGS LOADER ---
async function loadMeetings() {
  const container = document.getElementById('meetings-container');
  const { data: meetings } = await supabase.from('meetings').select('*').order('meeting_date', { ascending: true });

  if (!meetings || meetings.length === 0) {
    container.innerHTML = '<div class="p-8 text-center bg-white rounded-3xl border text-xs text-slate-400">No upcoming meetings scheduled. Click "+ New Meeting" to schedule one.</div>';
    return;
  }

  container.innerHTML = meetings.map(m => `
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-black bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md">📅 ${m.meeting_date}</span>
          <span class="text-xs text-slate-500 font-semibold">${m.start_time} - ${m.end_time}</span>
        </div>
        <h4 class="font-bold text-sm text-navy-900">${escapeHtml(m.title)}</h4>
        <p class="text-xs text-slate-500 mt-1">${escapeHtml(m.agenda || 'No agenda posted.')}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${m.meet_link ? `<a href="${m.meet_link}" target="_blank" rel="noopener" class="px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700">Join Call ↗</a>` : ''}
        ${m.drive_notes_link ? `<a href="${m.drive_notes_link}" target="_blank" rel="noopener" class="px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-xs rounded-xl">📁 Meeting Doc</a>` : ''}
      </div>
    </div>
  `).join('');
}

// --- IDEAS LOADER ---
async function loadIdeas() {
  const container = document.getElementById('ideas-container');
  const { data: ideas } = await supabase.from('ideas').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false });

  if (!ideas || ideas.length === 0) {
    container.innerHTML = '<div class="col-span-3 text-center p-8 bg-white rounded-3xl border text-xs text-slate-400">No suggestions yet. Have an initiative? Click "+ New Idea"!</div>';
    return;
  }

  container.innerHTML = ideas.map(i => `
    <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">${i.status}</span>
        <span class="text-[11px] text-slate-400">by ${escapeHtml(i.profiles?.full_name || 'Member')}</span>
      </div>
      <h4 class="font-bold text-sm text-navy-900">${escapeHtml(i.title)}</h4>
      <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(i.description)}</p>
      ${i.expected_impact ? `<div class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl"><b>Impact:</b> ${escapeHtml(i.expected_impact)}</div>` : ''}
      ${i.drive_link ? `<div class="pt-2 border-t"><a href="${i.drive_link}" target="_blank" rel="noopener" class="text-xs font-bold text-brand-600 hover:underline">📁 View Pitch Deck in Drive ↗</a></div>` : ''}
    </div>
  `).join('');
}

// --- TEAM LOADER ---
async function loadTeam() {
  const container = document.getElementById('team-container');
  const { data: team } = await supabase.from('profiles').select('*').order('full_name');

  if (!team || team.length === 0) {
    container.innerHTML = '<div class="col-span-4 text-center p-8 text-xs text-slate-400">No team profiles found.</div>';
    return;
  }

  container.innerHTML = team.map(u => `
    <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm text-center">
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-xl flex items-center justify-center mx-auto mb-3 shadow-md">
        ${(u.full_name || u.email || 'U').charAt(0).toUpperCase()}
      </div>
      <h4 class="font-bold text-sm text-navy-900">${escapeHtml(u.full_name || 'Team Member')}</h4>
      <div class="text-xs text-brand-600 font-semibold mb-1">${escapeHtml(u.role || 'Member')}</div>
      <div class="text-[11px] text-slate-400 truncate mb-3">${escapeHtml(u.email)}</div>
      <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${u.access_level === 'Admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-600'}">
        ${u.access_level || 'Member'}
      </span>
    </div>
  `).join('');
}

// 6. Action Modal (Add New Task, OKR, etc.)
function openActionModal() {
  const modal = document.getElementById('action-modal');
  const fields = document.getElementById('modal-fields');
  const title = document.getElementById('modal-title');

  if (activeTab === 'tasks') {
    title.textContent = 'Add New Task';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Task Title</label><input id="f-title" type="text" required placeholder="Launch marketing campaign" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="f-desc" rows="2" placeholder="Deliverables and expectations..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Priority</label><select id="f-pri" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"><option>Medium</option><option>High</option><option>Critical</option><option>Low</option></select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Due Date</label><input id="f-due" type="date" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Drive Link (Folder / Doc / Sheet)</label><input id="f-link" type="url" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
    `;
  } else if (activeTab === 'okrs') {
    title.textContent = 'Add New OKR';
    fields.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Quarter</label><select id="f-q" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"><option>Q4</option><option>Q1</option><option>Q2</option><option>Q3</option></select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Unit</label><input id="f-unit" type="text" value="%" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Objective</label><input id="f-obj" type="text" required placeholder="Scale Client Base" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Key Result</label><input id="f-kr" type="text" required placeholder="Acquire 100 new paying clients" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Target Value</label><input id="f-target" type="number" required value="100" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Current Progress</label><input id="f-current" type="number" value="0" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Drive Strategy Doc Link</label><input id="f-link" type="url" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
    `;
  } else if (activeTab === 'meetings') {
    title.textContent = 'Schedule Meeting';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Meeting Title</label><input id="f-title" type="text" required placeholder="Weekly Marketing Sync" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Date</label><input id="f-date" type="date" required class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Start Time</label><input id="f-start" type="time" value="09:00" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">End Time</label><input id="f-end" type="time" value="10:00" class="w-full text-xs p-2.5 rounded-xl border border-slate-200"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Meet Link</label><input id="f-meet" type="url" placeholder="https://meet.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Drive Meeting Notes Doc</label><input id="f-notes" type="url" placeholder="https://docs.google.com/document/d/..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Agenda</label><textarea id="f-agenda" rows="2" placeholder="Review Q4 progress..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></textarea></div>
    `;
  } else if (activeTab === 'ideas') {
    title.textContent = 'Pitch an Idea';
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Title</label><input id="f-title" type="text" required placeholder="Community Ambassador Program" class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="f-desc" rows="3" required placeholder="Outline your initiative..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></textarea></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Expected Business Impact</label><input id="f-impact" type="text" placeholder="Estimated +20% engagement..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Pitch Deck / Google Slides Link</label><input id="f-link" type="url" placeholder="https://docs.google.com/presentation/d/..." class="w-full text-xs p-3 rounded-xl border border-slate-200"></div>
    `;
  }

  modal.classList.remove('hidden');
}

function closeActionModal() {
  document.getElementById('action-modal').classList.add('hidden');
}

// 7. Handle Modal Form Submit
document.getElementById('modal-form').onsubmit = async (e) => {
  e.preventDefault();

  if (activeTab === 'tasks') {
    const title = document.getElementById('f-title').value;
    const description = document.getElementById('f-desc').value;
    const priority = document.getElementById('f-pri').value;
    const due_date = document.getElementById('f-due').value || null;
    const drive_link = document.getElementById('f-link').value || null;

    const { error } = await supabase.from('tasks').insert({
      title, description, priority, due_date, drive_link,
      assignee_id: currentUser.id
    });

    if (error) return showToast(error.message, true);
    showToast('Task created successfully!');
    closeActionModal();
    loadTasks();
  } else if (activeTab === 'okrs') {
    const quarter = document.getElementById('f-q').value;
    const unit = document.getElementById('f-unit').value;
    const objective = document.getElementById('f-obj').value;
    const key_result = document.getElementById('f-kr').value;
    const target = Number(document.getElementById('f-target').value);
    const current = Number(document.getElementById('f-current').value);
    const drive_link = document.getElementById('f-link').value || null;

    const { error } = await supabase.from('okrs').insert({
      quarter, unit, objective, key_result, target, current, drive_link,
      owner_id: currentUser.id
    });

    if (error) return showToast(error.message, true);
    showToast('OKR saved!');
    closeActionModal();
    loadOKRs();
  } else if (activeTab === 'meetings') {
    const title = document.getElementById('f-title').value;
    const meeting_date = document.getElementById('f-date').value;
    const start_time = document.getElementById('f-start').value;
    const end_time = document.getElementById('f-end').value;
    const meet_link = document.getElementById('f-meet').value || null;
    const drive_notes_link = document.getElementById('f-notes').value || null;
    const agenda = document.getElementById('f-agenda').value || null;

    const { error } = await supabase.from('meetings').insert({
      title, meeting_date, start_time, end_time, meet_link, drive_notes_link, agenda
    });

    if (error) return showToast(error.message, true);
    showToast('Meeting scheduled!');
    closeActionModal();
    loadMeetings();
  } else if (activeTab === 'ideas') {
    const title = document.getElementById('f-title').value;
    const description = document.getElementById('f-desc').value;
    const expected_impact = document.getElementById('f-impact').value || null;
    const drive_link = document.getElementById('f-link').value || null;

    const { error } = await supabase.from('ideas').insert({
      user_id: currentUser.id,
      title, description, expected_impact, drive_link
    });

    if (error) return showToast(error.message, true);
    showToast('Idea submitted!');
    closeActionModal();
    loadIdeas();
  }
};

// 8. Submit Daily Standup Report
document.getElementById('report-form').onsubmit = async (e) => {
  e.preventDefault();
  const done_today = document.getElementById('rep-done').value;
  const plan_tomorrow = document.getElementById('rep-plan').value;
  const blockers = document.getElementById('rep-blockers').value || 'None';
  const drive_link = document.getElementById('rep-link').value || null;
  const hours_worked = Number(document.getElementById('rep-hours').value) || 8;
  const mood = document.getElementById('rep-mood').value;

  const { error } = await supabase.from('reports').insert({
    user_id: currentUser.id,
    done_today, plan_tomorrow, blockers, drive_link, hours_worked, mood
  });

  if (error) return showToast(error.message, true);
  showToast('Daily standup submitted!');
  document.getElementById('report-form').reset();
  loadReports();
};

// 9. Quick Actions
async function updateTaskStatus(id, status) {
  await supabase.from('tasks').update({ status }).eq('id', id);
  showToast(`Task moved to ${status}`);
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await supabase.from('tasks').delete().eq('id', id);
  showToast('Task deleted');
  loadTasks();
}

// 10. UI & Helpers
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  navigate(activeTab);
}



// Auth Form Submit (Strict Login-Only Mode)
document.getElementById('auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errBox = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit-btn');
  errBox.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (error) {
    errBox.textContent = error.message;
    errBox.classList.remove('hidden');
  } else {
    showToast('Welcome back to Nodaar Hub!');
  }
};

async function logout() {
  await supabase.auth.signOut();
  showToast('Signed out');
}

function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `fixed bottom-6 right-6 z-50 text-xs font-semibold px-4 py-3 rounded-xl shadow-xl transition-all duration-300 ${isErr ? 'bg-red-600 text-white' : 'bg-navy-900 text-white'}`;
  setTimeout(() => {
    t.className += ' opacity-0 translate-y-4 pointer-events-none';
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Start
window.addEventListener('DOMContentLoaded', checkAuth);
