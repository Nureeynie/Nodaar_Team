// ==============================================================================
// NODAAR TEAM HUB — Enterprise Workspace Logic v2.2
// Features: Overview & Member Performance Insights, Collapsible Sidebar,
//           List Views, Role Management, OKR Role Assignment, Admin Work Filters
// ==============================================================================

let sbClient = null;
let currentUser = null;
let currentProfile = null;
let activeTab = 'overview';
let allRoles = [];
let taskViewMode = 'board'; // 'board' or 'list'

const SB_URL = 'https://xzrczuoxlujzmztkupbz.supabase.co';
const SB_KEY = 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN';
window.SB_URL = window.SB_URL || SB_URL;
window.SB_KEY = window.SB_KEY || SB_KEY;

// ─────────────────────────────────────────────
// 1. INIT & AUTH
// ─────────────────────────────────────────────
function initSupabase() {
  try {
    if (window.sbClient) {
      sbClient = window.sbClient;
      return true;
    }
    if (window.supabase) {
      sbClient = window.supabase.createClient(SB_URL, SB_KEY);
      window.sbClient = sbClient;
      return true;
    }
    return false;
  } catch (err) {
    console.error('Supabase init failed:', err);
    return false;
  }
}

async function checkAuth() {
  if (!initSupabase()) {
    setTimeout(checkAuth, 100);
    return;
  }

  // Restore sidebar collapsed preference only on desktop (screen width >= 768px)
  if (window.innerWidth >= 768 && localStorage.getItem('nodaar_sidebar_collapsed') === 'true') {
    document.body.classList.add('sidebar-collapsed');
  } else {
    document.body.classList.remove('sidebar-collapsed');
  }

  try {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      await fetchProfile();
      await fetchAllRoles();
      showApp();
    } else {
      showAuth();
    }
  } catch (err) {
    console.warn('Session check notice:', err);
    showAuth();
  }

  sbClient.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      await fetchProfile();
      await fetchAllRoles();
      showApp();
    } else {
      currentUser = null;
      currentProfile = null;
      showAuth();
    }
  });
}

function toggleSidebarCollapse() {
  if (window.innerWidth < 768) {
    closeMobileSidebar();
    return;
  }
  const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('nodaar_sidebar_collapsed', isCollapsed);
}

// ─────────────────────────────────────────────
// 2. PROFILE & ROLES CACHE
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
      prof.access_level = 'Admin';
      prof.role = prof.role || 'Founder / Admin';
    }
    currentProfile = prof;
    updateSidebarUser();
  } catch (err) { console.error('fetchProfile:', err); }
}

async function fetchAllRoles() {
  try {
    const { data } = await sbClient.from('roles').select('*').order('name');
    allRoles = data || [];
    updateRoleDropdowns();
  } catch (err) {
    console.error('fetchAllRoles:', err);
  }
}

function updateRoleDropdowns() {
  const taskRoleSel = document.getElementById('task-role-filter');
  if (taskRoleSel) {
    const prev = taskRoleSel.value;
    taskRoleSel.innerHTML = '<option value="all">All Roles</option>' +
      allRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    taskRoleSel.value = prev || 'all';
  }

  const okrRoleSel = document.getElementById('okr-role-filter');
  if (okrRoleSel) {
    const prev = okrRoleSel.value;
    okrRoleSel.innerHTML = '<option value="all">All Roles & Departments</option>' +
      allRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    okrRoleSel.value = prev || 'all';
  }

  const adminSwitcherBox = document.getElementById('admin-role-switcher-box');
  const adminRoleSelect = document.getElementById('admin-active-role-select');
  if (adminSwitcherBox && adminRoleSelect) {
    if (currentProfile?.access_level === 'Admin') {
      adminSwitcherBox.classList.remove('hidden');
      adminSwitcherBox.classList.add('flex');
      let options = `<option value="">Admin / Founder</option>`;
      allRoles.forEach(r => {
        const sel = currentProfile.role_id === r.id ? 'selected' : '';
        options += `<option value="${r.id}" ${sel}>${escapeHtml(r.name)}</option>`;
      });
      adminRoleSelect.innerHTML = options;
    } else {
      adminSwitcherBox.classList.add('hidden');
      adminSwitcherBox.classList.remove('flex');
    }
  }

  const pfRoleSel = document.getElementById('pf-role-id');
  if (pfRoleSel) {
    pfRoleSel.innerHTML = '<option value="">No Role</option>' +
      allRoles.map(r => `<option value="${r.id}" ${currentProfile?.role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  }
}

async function switchAdminRole(roleId) {
  if (!currentProfile || currentProfile.access_level !== 'Admin') return;
  const targetRole = allRoles.find(r => r.id === roleId);
  const newRoleName = targetRole ? targetRole.name : 'Founder / Admin';

  currentProfile.role_id = roleId || null;
  currentProfile.role = newRoleName;

  await sbClient.from('profiles').update({
    role_id: roleId || null,
    role: newRoleName
  }).eq('id', currentUser.id);

  updateSidebarUser();
  showToast(`Switched active role to: ${newRoleName}`);
  loadTabData(activeTab);
}

function updateSidebarUser() {
  const p = currentProfile;
  if (!p) return;
  const name = p.full_name || p.email || 'User';
  const role = p.role || 'Member';

  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = `${role} · ${p.access_level || 'Member'}`;

  const avatarEl = document.getElementById('sidebar-avatar');
  if (avatarEl) {
    if (p.avatar_url) {
      avatarEl.innerHTML = `<img src="${p.avatar_url}" class="w-full h-full object-cover" alt="Avatar">`;
    } else {
      avatarEl.textContent = name.charAt(0).toUpperCase();
    }
  }

  const rolesBtn = document.getElementById('roles-nav-btn');
  if (rolesBtn) rolesBtn.style.display = p.access_level === 'Admin' ? 'flex' : 'none';

  const teamAddUserBtn = document.getElementById('team-add-user-btn');
  if (teamAddUserBtn) {
    if (p.access_level === 'Admin') teamAddUserBtn.classList.remove('hidden');
    else teamAddUserBtn.classList.add('hidden');
  }

  loadNotifBadge();
}

// ─────────────────────────────────────────────
// 3. NAVIGATION
// ─────────────────────────────────────────────
const TAB_META = {
  overview:{ title:'Overview & Insights', sub:'Team velocity, performance metrics and member accountability', btn:'' },
  tasks:   { title:'Tasks & Deliverables', sub:'Track assignments, admin work and Google Drive links', btn:'New Task' },
  reports: { title:'Daily Standup Reports', sub:'Submit what you worked on and attach Drive proof-of-work', btn:'New Standup' },
  okrs:    { title:'Quarterly OKRs & Goals', sub:'High-level business and role targets', btn:'New OKR' },
  meetings:{ title:'Team Meetings & Notes', sub:'Video links, agendas and Drive meeting notes', btn:'New Meeting' },
  ideas:   { title:'Ideas & Innovation Decks', sub:'Pitch initiatives with Google Docs / Slides attachments', btn:'New Idea' },
  team:    { title:'Team Directory', sub:'Manage organization members, assigned roles, permissions, and contacts', btn:'Add User' },
  whatsapp:{ title:'WhatsApp Team Groups', sub:'Join and manage official team WhatsApp groups, department broadcast channels and emergency lines', btn:'New Group' },
  scores:  { title:'Team Scores & Evaluations', sub:'Automatic activity scores and admin member evaluations', btn:'' },
  channels:{ title:'Channels & Broadcasts', sub:'MS Teams style team collaboration, URL links and announcements', btn:'New Post' },
  roles:   { title:'Roles & Permissions', sub:'Create roles, assign members and categorize work', btn:'New Role' },
  profile: { title:'Profile & Settings', sub:'Edit your profile, avatar, role and account security', btn:'' },
};

function navigate(tab) {
  activeTab = tab;
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

  document.querySelectorAll('#sidebar-nav .nav-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.querySelector(`[data-tab="${tab}"]`);
  if (target) {
    target.classList.add('active');
    const parentDetails = target.closest('details');
    if (parentDetails) parentDetails.open = true;
  }

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
  document.getElementById('notif-panel').classList.add('hidden');
}

async function loadTabData(tab) {
  switch (tab) {
    case 'overview':await loadOverviewData(); break;
    case 'tasks':   await loadTasks(); break;
    case 'reports': await loadReports(); break;
    case 'okrs':    await loadOKRs(); break;
    case 'meetings':await loadMeetings(); break;
    case 'ideas':   await loadIdeas(); break;
    case 'team':    await loadTeam(); break;
    case 'whatsapp': if (window.loadWhatsAppView) window.loadWhatsAppView(); break;
    case 'scores':   if (window.renderTeamScoresView) await window.renderTeamScoresView(); break;
    case 'channels': if (window.loadChannels) await window.loadChannels(); break;
    case 'roles':   await loadRoles(); break;
    case 'profile': loadProfilePage(); break;
  }
}

// ─────────────────────────────────────────────
// 4. OVERVIEW & MEMBER PERFORMANCE INSIGHTS
// ─────────────────────────────────────────────
async function loadOverviewData() {
  const kpiContainer = document.getElementById('overview-kpi-cards');
  const blockersContainer = document.getElementById('overview-blockers-container');
  const tableBody = document.getElementById('overview-performance-table');
  const rolesBreakdown = document.getElementById('overview-roles-breakdown');

  tableBody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 text-xs">Computing performance insights…</td></tr>`;

  // Parallel fetch: profiles, tasks, reports, okrs, roles
  const [
    { data: profiles },
    { data: tasks },
    { data: reports },
    { data: okrs },
    { data: roles }
  ] = await Promise.all([
    sbClient.from('profiles').select('*, roles:role_id(name,color)').order('full_name'),
    sbClient.from('tasks').select('*'),
    sbClient.from('reports').select('*, profiles:user_id(full_name, avatar_url)').order('created_at', { ascending: false }),
    sbClient.from('okrs').select('*'),
    sbClient.from('roles').select('*')
  ]);

  const allProfiles = profiles || [];
  const allTasks = tasks || [];
  const allReports = reports || [];
  const allOKRs = okrs || [];
  const allRolesList = roles || [];

  // Compute Task KPIs
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === 'Done').length;
  const inProgressTasks = allTasks.filter(t => t.status === 'In Progress').length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Compute Standup & Hours KPIs
  const totalHoursLogged = allReports.reduce((sum, r) => sum + (Number(r.hours_worked) || 0), 0);
  const avgHours = allReports.length > 0 ? (totalHoursLogged / allReports.length).toFixed(1) : '8.0';

  // Compute OKR aggregate
  let okrAvg = 0;
  if (allOKRs.length > 0) {
    const sumOkr = allOKRs.reduce((sum, o) => {
      const p = Math.min(100, Math.round(((o.current - (o.baseline||0)) / ((o.target - (o.baseline||0)) || 1)) * 100));
      return sum + Math.max(0, p);
    }, 0);
    okrAvg = Math.round(sumOkr / allOKRs.length);
  }

  // Active Blockers
  const activeBlockers = allReports.filter(r => r.blockers && r.blockers.toLowerCase() !== 'none' && r.blockers.trim() !== '');

  // Render KPI Cards
  kpiContainer.innerHTML = `
    <div class="card-hover bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold text-slate-400 uppercase">Task Delivery</span>
        <span class="text-lg">📋</span>
      </div>
      <div class="text-2xl font-black text-navy-900">${taskCompletionRate}%</div>
      <div class="text-xs text-slate-500 mt-1 flex items-center justify-between">
        <span><b>${completedTasks}</b> completed</span>
        <span class="text-blue-600 font-semibold">${inProgressTasks} in progress</span>
      </div>
      <div class="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
        <div class="bg-emerald-500 h-1.5 rounded-full" style="width:${taskCompletionRate}%"></div>
      </div>
    </div>

    <div class="card-hover bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold text-slate-400 uppercase">Standups Logged</span>
        <span class="text-lg">📝</span>
      </div>
      <div class="text-2xl font-black text-navy-900">${allReports.length}</div>
      <div class="text-xs text-slate-500 mt-1">
        <span>Avg <b>${avgHours} hrs</b> / standup</span>
      </div>
      <div class="text-[11px] text-brand-600 font-semibold mt-2">Total ${totalHoursLogged}h tracked</div>
    </div>

    <div class="card-hover bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold text-slate-400 uppercase">Quarterly OKRs</span>
        <span class="text-lg">🎯</span>
      </div>
      <div class="text-2xl font-black text-navy-900">${okrAvg}%</div>
      <div class="text-xs text-slate-500 mt-1">${allOKRs.length} active objectives</div>
      <div class="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
        <div class="bg-brand-500 h-1.5 rounded-full" style="width:${okrAvg}%"></div>
      </div>
    </div>

    <div class="card-hover bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold text-slate-400 uppercase">Team Roadblocks</span>
        <span class="text-lg">${activeBlockers.length > 0 ? '⚠️' : '✅'}</span>
      </div>
      <div class="text-2xl font-black ${activeBlockers.length > 0 ? 'text-red-600' : 'text-emerald-600'}">
        ${activeBlockers.length}
      </div>
      <div class="text-xs text-slate-500 mt-1">
        ${activeBlockers.length > 0 ? 'Blockers needing leadership' : 'No reported blockers'}
      </div>
      <div class="text-[11px] text-slate-400 font-medium mt-2">${allProfiles.length} active members</div>
    </div>
  `;

  // Render Blockers Watchlist
  if (activeBlockers.length > 0) {
    blockersContainer.classList.remove('hidden');
    blockersContainer.innerHTML = `
      <div class="bg-red-50/80 border border-red-200 rounded-3xl p-5 shadow-sm">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-lg">🚨</span>
          <h4 class="font-extrabold text-sm text-red-900">Active Roadblocks Needing Attention (${activeBlockers.length})</h4>
        </div>
        <div class="space-y-2">
          ${activeBlockers.slice(0, 4).map(b => `
            <div class="bg-white p-3 rounded-2xl border border-red-100 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <span class="text-xs font-bold text-navy-900">${escapeHtml(b.profiles?.full_name || 'Member')}:</span>
                <span class="text-xs text-red-700 font-medium">${escapeHtml(b.blockers)}</span>
              </div>
              <span class="text-[10px] text-slate-400">📅 ${b.report_date}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    blockersContainer.classList.add('hidden');
  }

  // Render Member Performance Table
  if (allProfiles.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400 text-xs">No team members registered.</td></tr>`;
  } else {
    tableBody.innerHTML = allProfiles.map(u => {
      const name = u.full_name || u.email || 'Member';
      const initials = name.charAt(0).toUpperCase();

      // Member's tasks
      const mTasks = allTasks.filter(t => t.assignee_id === u.id);
      const mDone = mTasks.filter(t => t.status === 'Done').length;
      const mTotal = mTasks.length;
      const mRate = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;

      // Member's standups
      const mReports = allReports.filter(r => r.user_id === u.id);
      const mHours = mReports.reduce((s, r) => s + (Number(r.hours_worked) || 0), 0);
      const latestReport = mReports[0];

      // Dominant mood
      const mood = latestReport?.mood || '—';

      // Latest deliverable
      const latestDrive = latestReport?.drive_link || mTasks.find(t => t.drive_link)?.drive_link;

      // Performance rating
      let statusBadge = '';
      if (mTotal === 0 && mReports.length === 0) {
        statusBadge = `<span class="pill bg-slate-100 text-slate-500">New / Idle</span>`;
      } else if (latestReport?.blockers && latestReport.blockers.toLowerCase() !== 'none' && latestReport.blockers.trim() !== '') {
        statusBadge = `<span class="pill bg-red-100 text-red-700">⚠️ Blocked</span>`;
      } else if (mRate >= 75 || mReports.length >= 3) {
        statusBadge = `<span class="pill bg-emerald-100 text-emerald-800">🔥 High Performer</span>`;
      } else {
        statusBadge = `<span class="pill bg-blue-100 text-blue-800">⚡ On Track</span>`;
      }

      const roleTag = u.roles
        ? `<span class="pill" style="background:${u.roles.color}22;color:${u.roles.color};border:1px solid ${u.roles.color}44;">${escapeHtml(u.roles.name)}</span>`
        : `<span class="text-slate-400 text-[11px]">—</span>`;

      return `
        <tr class="hover:bg-slate-50/70 transition">
          <td class="py-3 px-4">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                ${u.avatar_url
                  ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">`
                  : `<div class="w-full h-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-xs flex items-center justify-center">${initials}</div>`}
              </div>
              <div>
                <div class="font-bold text-navy-900">${escapeHtml(name)}</div>
                <div class="text-[11px] text-slate-400">${escapeHtml(u.email)}</div>
              </div>
            </div>
          </td>
          <td class="py-3 px-4">${roleTag}</td>
          <td class="py-3 px-4">
            <div class="flex items-center gap-2">
              <div class="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div class="bg-brand-500 h-1.5 rounded-full" style="width:${mRate}%"></div>
              </div>
              <span class="font-bold text-[11px] text-slate-700">${mDone}/${mTotal} (${mRate}%)</span>
            </div>
          </td>
          <td class="py-3 px-4">
            <span class="font-bold text-navy-900">${mReports.length}</span> reports
            <span class="text-slate-400 text-[11px]">· ${mHours}h</span>
          </td>
          <td class="py-3 px-4 text-sm">${mood}</td>
          <td class="py-3 px-4">
            ${latestDrive ? `
              <a href="${latestDrive}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline">
                <span>📁</span> Drive Link ↗
              </a>
            ` : '<span class="text-slate-300 text-[11px]">No link</span>'}
          </td>
          <td class="py-3 px-4 text-right">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  // Render Department & Role Velocity Breakdown
  if (allRolesList.length === 0) {
    rolesBreakdown.innerHTML = `<div class="py-4 text-center text-xs text-slate-400">No roles created yet. Use the Roles & Permissions tab to define team roles.</div>`;
  } else {
    rolesBreakdown.innerHTML = allRolesList.map(r => {
      const rMembers = allProfiles.filter(p => p.role_id === r.id);
      const rTasks = allTasks.filter(t => t.role_id === r.id);
      const rDone = rTasks.filter(t => t.status === 'Done').length;
      const rRate = rTasks.length > 0 ? Math.round((rDone / rTasks.length) * 100) : 0;
      const rOkrs = allOKRs.filter(o => o.role_id === r.id);

      return `
        <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0" style="background:${r.color}22;color:${r.color};border:1px solid ${r.color}44;">
              ${(r.name || 'R').charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="font-bold text-xs text-navy-900">${escapeHtml(r.name)}</div>
              <div class="text-[11px] text-slate-400">${rMembers.length} member${rMembers.length !== 1 ? 's' : ''} · ${rOkrs.length} assigned OKRs</div>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <div class="text-xs font-bold text-navy-900">${rDone}/${rTasks.length} Tasks (${rRate}%)</div>
              <div class="w-32 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                <div class="h-1.5 rounded-full" style="background:${r.color || '#FE8A03'};width:${rRate}%"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ─────────────────────────────────────────────
// 5. TASKS (Board & List Views)
// ─────────────────────────────────────────────
function setTaskViewMode(mode) {
  taskViewMode = mode;
  const boardBtn = document.getElementById('task-view-board-btn');
  const listBtn = document.getElementById('task-view-list-btn');
  const boardContainer = document.getElementById('tasks-board-container');
  const listContainer = document.getElementById('tasks-list-container');

  if (mode === 'board') {
    boardBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-navy-900 shadow-sm transition';
    listBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-navy-900 transition';
    boardContainer.classList.remove('hidden');
    listContainer.classList.add('hidden');
  } else {
    listBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-navy-900 shadow-sm transition';
    boardBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-navy-900 transition';
    boardContainer.classList.add('hidden');
    listContainer.classList.remove('hidden');
  }
  loadTasks();
}

async function loadTasks() {
  const boardContainer = document.getElementById('tasks-board-container');
  const tableBody = document.getElementById('tasks-table-body');

  boardContainer.innerHTML = loadingHTML('col-span-3');
  tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-xs text-slate-400">Loading tasks…</td></tr>`;

  const filter = document.getElementById('task-filter')?.value || 'all';
  const roleFilter = document.getElementById('task-role-filter')?.value || 'all';
  const priFilter = document.getElementById('task-priority-filter')?.value || 'all';

  let query = sbClient.from('tasks').select('*, profiles:assignee_id(full_name, email, avatar_url), roles:role_id(name,color)').order('created_at', { ascending: false });

  if (filter === 'mine') {
    query = query.eq('assignee_id', currentUser.id);
  } else if (filter === 'role') {
    if (currentProfile?.role_id) query = query.eq('role_id', currentProfile.role_id);
  } else if (filter === 'admin') {
    query = query.eq('is_admin_task', true);
  }

  if (roleFilter !== 'all') {
    query = query.eq('role_id', roleFilter);
  }

  if (priFilter !== 'all') {
    query = query.eq('priority', priFilter);
  }

  const { data: tasks, error } = await query;

  if (error || !tasks || tasks.length === 0) {
    const emptyMsg = `
      <div class="col-span-3 text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
        <div class="text-4xl mb-3">📋</div>
        <div class="text-sm font-bold text-navy-900 mb-1">No tasks found</div>
        <p class="text-xs text-slate-400 mb-4">Create your first task or change your filters above.</p>
        <button onclick="openActionModal()" class="px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl shadow">+ Create Task</button>
      </div>`;
    boardContainer.innerHTML = emptyMsg;
    tableBody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-xs text-slate-400">No tasks found. Click "+ New Task" above.</td></tr>`;
    return;
  }

  // 1. Render Kanban Board
  const columns = { 'To Do': [], 'In Progress': [], 'Done': [] };
  tasks.forEach(t => { (columns[t.status] || columns['To Do']).push(t); });

  const colColors = { 'To Do': 'border-slate-300', 'In Progress': 'border-blue-400', 'Done': 'border-emerald-400' };
  const colHeaders = { 'To Do': '⬜ To Do', 'In Progress': '🔵 In Progress', 'Done': '✅ Done' };

  boardContainer.innerHTML = ['To Do', 'In Progress', 'Done'].map(col => `
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

  // 2. Render List Table View
  const priColors = { Critical:'bg-red-50 text-red-700 border-red-200', High:'bg-orange-50 text-orange-700 border-orange-200', Medium:'bg-amber-50 text-amber-700 border-amber-200', Low:'bg-emerald-50 text-emerald-700 border-emerald-200' };

  tableBody.innerHTML = tasks.map(t => {
    const name = t.profiles?.full_name || 'Unassigned';
    const initials = name.charAt(0).toUpperCase();
    const roleTag = t.roles ? `<span class="pill" style="background:${t.roles.color}22;color:${t.roles.color};border:1px solid ${t.roles.color}44;">${escapeHtml(t.roles.name)}</span>` : '<span class="text-slate-300">—</span>';
    const adminTag = t.is_admin_task ? `<span class="pill bg-purple-100 text-purple-700 mr-1.5">🔒 Admin</span>` : '';

    return `
      <tr class="hover:bg-slate-50/70 transition">
        <td class="py-3 px-4">
          <div class="font-bold text-navy-900 flex items-center">${adminTag} ${escapeHtml(t.title)}</div>
          ${t.description ? `<div class="text-[11px] text-slate-400 line-clamp-1">${escapeHtml(t.description)}</div>` : ''}
        </td>
        <td class="py-3 px-4">
          <span class="pill border ${priColors[t.priority] || priColors.Medium}">${t.priority}</span>
        </td>
        <td class="py-3 px-4">${roleTag}</td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            ${t.profiles?.avatar_url
              ? `<img src="${t.profiles.avatar_url}" class="w-5 h-5 rounded-full object-cover">`
              : `<div class="w-5 h-5 rounded-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white text-[8px] font-black flex items-center justify-center">${initials}</div>`}
            <span class="text-slate-700 font-medium truncate max-w-[120px]">${escapeHtml(name)}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-slate-500 font-medium">${t.due_date ? `📅 ${t.due_date}` : '—'}</td>
        <td class="py-3 px-4">
          <select onchange="updateTaskStatus('${t.id}', this.value)" class="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 focus:outline-none">
            <option ${t.status==='To Do'?'selected':''}>To Do</option>
            <option ${t.status==='In Progress'?'selected':''}>In Progress</option>
            <option ${t.status==='Done'?'selected':''}>Done</option>
          </select>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${t.drive_link ? `<a href="${t.drive_link}" target="_blank" rel="noopener" class="p-1 text-brand-600 hover:text-brand-700" title="Open Google Drive">📁</a>` : ''}
            <button onclick="openEditTaskModal('${t.id}')" class="p-1 text-slate-400 hover:text-slate-600" title="Edit">✏️</button>
            <button onclick="deleteTask('${t.id}')" class="p-1 text-slate-400 hover:text-red-500" title="Delete">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
  const adminTag = t.is_admin_task ? `<span class="pill text-[9px] bg-purple-100 text-purple-700 border border-purple-200">🔒 Admin Work</span>` : '';
  const dueTag = t.due_date ? `<span class="text-[9px] text-slate-400 font-medium">📅 ${t.due_date}</span>` : '';

  return `
  <div class="card-hover bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 group">
    <div class="flex items-start justify-between gap-2 mb-2">
      <h4 class="font-bold text-xs text-navy-900 leading-snug flex-1">${escapeHtml(t.title)}</h4>
      <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded border flex-shrink-0 ${pColor}">${t.priority}</span>
    </div>
    ${t.description ? `<p class="text-[11px] text-slate-500 line-clamp-2 mb-2">${escapeHtml(t.description)}</p>` : ''}
    <div class="flex flex-wrap items-center gap-1.5 mb-3">${adminTag}${roleTag}${dueTag}</div>
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
// 6. REPORTS (List)
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
        <div><span class="font-bold text-navy-900 block mb-1">✅ Accomplished:</span><p class="text-slate-600 whitespace-pre-line">${escapeHtml(r.done_today)}</p></div>
        <div><span class="font-bold text-navy-900 block mb-1">🚀 Tomorrow's Plan:</span><p class="text-slate-600 whitespace-pre-line">${escapeHtml(r.plan_tomorrow)}</p></div>
      </div>
      ${r.blockers && r.blockers !== 'None' ? `<div class="mt-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg border border-red-100">⚠️ <b>Blocker:</b> ${escapeHtml(r.blockers)}</div>` : ''}
      ${r.drive_link ? `<a href="${r.drive_link}" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 font-bold hover:underline">📁 Open Drive Proof-of-Work ↗</a>` : ''}
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 7. OKRS (Structured List View)
// ─────────────────────────────────────────────
async function loadOKRs() {
  const container = document.getElementById('okrs-container');
  const roleFilter = document.getElementById('okr-role-filter')?.value || 'all';
  const quarterFilter = document.getElementById('okr-quarter-filter')?.value || 'all';

  let query = sbClient.from('okrs').select('*, profiles:owner_id(full_name), roles:role_id(name,color)').order('quarter');

  if (roleFilter !== 'all') {
    query = query.eq('role_id', roleFilter);
  }
  if (quarterFilter !== 'all') {
    query = query.eq('quarter', quarterFilter);
  }

  const { data: okrs } = await query;

  if (!okrs || okrs.length === 0) {
    container.innerHTML = '<div class="p-10 text-center text-xs text-slate-400">No OKRs found. Click "+ Add OKR" to set team objectives.</div>';
    return;
  }

  container.innerHTML = okrs.map(o => {
    const progress = Math.min(100, Math.round(((o.current - (o.baseline||0)) / ((o.target - (o.baseline||0)) || 1)) * 100));
    const progColor = progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-brand-500' : 'bg-amber-500';
    const roleTag = o.roles
      ? `<span class="pill" style="background:${o.roles.color}22;color:${o.roles.color};border:1px solid ${o.roles.color}44;">🎯 Role: ${escapeHtml(o.roles.name)}</span>`
      : `<span class="pill bg-slate-100 text-slate-600">Company-wide</span>`;

    return `
    <div class="p-4 sm:p-5 hover:bg-slate-50/50 transition">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div class="flex items-center gap-2">
          <span class="pill bg-brand-50 text-brand-700 border border-brand-200">${escapeHtml(o.quarter)} Goal</span>
          ${roleTag}
        </div>
        <div class="text-xs text-slate-400">Owner: <b class="text-slate-600">${escapeHtml(o.profiles?.full_name || 'Team')}</b></div>
      </div>
      <div class="mb-3">
        <h4 class="font-bold text-sm text-navy-900">${escapeHtml(o.objective)}</h4>
        <p class="text-xs text-slate-500 mt-1">🎯 <b>Key Result:</b> ${escapeHtml(o.key_result)}</p>
      </div>
      <div>
        <div class="flex justify-between text-xs font-bold mb-1.5">
          <span class="text-slate-500">${o.current} / ${o.target} ${o.unit || ''}</span>
          <span class="${progress >= 80 ? 'text-emerald-600' : 'text-brand-600'}">${progress}% Completed</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="${progColor} h-2 rounded-full transition-all duration-700" style="width:${progress}%"></div>
        </div>
      </div>
      ${o.drive_link ? `
        <div class="mt-3 pt-2 border-t border-slate-100">
          <a href="${o.drive_link}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline">
            📁 View Strategy in Google Drive ↗
          </a>
        </div>
      ` : ''}
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 8. MEETINGS (List View)
// ─────────────────────────────────────────────
async function loadMeetings() {
  const container = document.getElementById('meetings-container');
  if (!container) return;

  let remoteMeetings = [];
  try {
    if (sbClient) {
      const { data } = await sbClient.from('meetings').select('*').order('meeting_date', { ascending: true });
      remoteMeetings = data || [];
    }
  } catch (err) {
    console.warn('Load meetings remote error:', err);
  }

  const localMeetings = JSON.parse(localStorage.getItem('nodaar_meetings_local') || '[]');
  const meetMap = new Map();
  localMeetings.forEach(m => { if (m && (m.id || m.title)) meetMap.set(m.id || m.title, m); });
  remoteMeetings.forEach(m => { if (m && (m.id || m.title)) meetMap.set(m.id || m.title, m); });
  const meetings = Array.from(meetMap.values()).sort((a, b) => (a.meeting_date || '').localeCompare(b.meeting_date || ''));

  if (!meetings || meetings.length === 0) {
    container.innerHTML = '<div class="p-10 text-center text-xs text-slate-400">No meetings scheduled. Click "+ Schedule Meeting" to schedule one.</div>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = meetings.map(m => {
    const isPast = m.meeting_date < today;
    return `
    <div class="p-4 sm:p-5 hover:bg-slate-50/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isPast ? 'opacity-60' : ''}">
      <div class="flex gap-4 items-start">
        <div class="flex-shrink-0 w-12 h-12 bg-slate-100 rounded-2xl flex flex-col items-center justify-center border border-slate-200">
          <span class="text-[9px] font-black text-slate-500 uppercase">${new Date((m.meeting_date||today)+'T00:00').toLocaleString('en',{month:'short'})}</span>
          <span class="text-lg font-black text-navy-900 leading-none">${new Date((m.meeting_date||today)+'T00:00').getDate()}</span>
        </div>
        <div>
          <h4 class="font-bold text-sm text-navy-900">${escapeHtml(m.title)}</h4>
          <div class="text-[11px] text-slate-400 mt-0.5">${m.start_time || '10:00'} – ${m.end_time || '11:00'}</div>
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
  try {
    if (sbClient) await sbClient.from('meetings').delete().eq('id', id);
  } catch (e) {}
  try {
    const local = JSON.parse(localStorage.getItem('nodaar_meetings_local') || '[]');
    const filtered = local.filter(m => m.id !== id);
    localStorage.setItem('nodaar_meetings_local', JSON.stringify(filtered));
  } catch (e) {}
  showToast('Meeting deleted');
  loadMeetings();
}

// ─────────────────────────────────────────────
// 9. IDEAS (List View)
// ─────────────────────────────────────────────
async function loadIdeas() {
  const container = document.getElementById('ideas-container');
  const { data: ideas } = await sbClient.from('ideas').select('*, profiles:user_id(full_name, avatar_url)').order('created_at', { ascending: false });
  if (!ideas || ideas.length === 0) {
    container.innerHTML = '<div class="p-10 text-center text-xs text-slate-400">No ideas pitched yet. Have an initiative? Click "+ Pitch Idea"!</div>';
    return;
  }
  const statusColors = { 'Proposed':'bg-amber-50 text-amber-800 border-amber-200', 'Approved':'bg-emerald-50 text-emerald-800 border-emerald-200', 'In Review':'bg-blue-50 text-blue-800 border-blue-200', 'Rejected':'bg-red-50 text-red-700 border-red-200' };

  container.innerHTML = ideas.map(i => `
    <div class="p-4 sm:p-5 hover:bg-slate-50/50 transition">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="pill border ${statusColors[i.status] || statusColors['Proposed']}">${i.status || 'Proposed'}</span>
          <span class="font-bold text-sm text-navy-900">${escapeHtml(i.title)}</span>
        </div>
        <span class="text-xs text-slate-400">by ${escapeHtml(i.profiles?.full_name || 'Member')}</span>
      </div>
      <p class="text-xs text-slate-600 leading-relaxed mb-3">${escapeHtml(i.description)}</p>
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        ${i.expected_impact ? `<div class="text-[11px] text-slate-500"><b>💡 Expected Impact:</b> ${escapeHtml(i.expected_impact)}</div>` : '<div></div>'}
        ${i.drive_link ? `<a href="${i.drive_link}" target="_blank" rel="noopener" class="text-xs font-bold text-brand-600 hover:underline">📁 Pitch Deck in Drive ↗</a>` : ''}
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// 10. TEAM (Enterprise Table / List View)
// ─────────────────────────────────────────────
async function loadTeam() {
  const tableBody = document.getElementById('team-table-body');
  tableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-400">Loading team members…</td></tr>`;

  const addBtn = document.getElementById('team-add-user-btn');
  if (addBtn) addBtn.classList.remove('hidden');

  const { data: team } = await sbClient.from('profiles').select('*, roles:role_id(name,color)').order('full_name');

  const countEl = document.getElementById('team-count-text');
  if (countEl) countEl.textContent = `Team Directory (${(team || []).length} Members)`;

  if (!team || team.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-400">No team profiles found.</td></tr>`;
    return;
  }

  const isAdmin = currentProfile?.access_level === 'Admin';

  tableBody.innerHTML = team.map(u => {
    const name = u.full_name || u.email || 'Member';
    const initials = name.charAt(0).toUpperCase();
    const userIsAdmin = u.access_level === 'Admin';
    const roleTag = u.roles
      ? `<span class="pill" style="background:${u.roles.color}22;color:${u.roles.color};border:1px solid ${u.roles.color}44;">${escapeHtml(u.roles.name)}</span>`
      : `<span class="text-slate-400 text-[11px]">${escapeHtml(u.role || 'Member')}</span>`;

    return `
      <tr class="hover:bg-slate-50/70 transition">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
              ${u.avatar_url
                ? `<img src="${u.avatar_url}" class="w-full h-full object-cover" alt="">`
                : `<div class="w-full h-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-sm flex items-center justify-center">${initials}</div>`}
            </div>
            <div>
              <div class="font-bold text-navy-900">${escapeHtml(name)}</div>
              <div class="text-[11px] text-slate-400">${escapeHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">${roleTag}</td>
        <td class="py-3 px-4">
          ${userIsAdmin ? '<span class="pill bg-purple-100 text-purple-700 border border-purple-200 font-bold">Admin</span>' : '<span class="pill bg-slate-100 text-slate-600 font-semibold">Member</span>'}
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1 flex-wrap">
            <span class="pill bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-semibold">#announcements</span>
            <span class="pill bg-slate-100 text-slate-600 text-[9px] font-semibold">#general</span>
          </div>
        </td>
        <td class="py-3 px-4 text-slate-500 font-medium">
          ${u.phone ? `📞 ${escapeHtml(u.phone)}` : '<span class="text-slate-300">—</span>'}
        </td>
        <td class="py-3 px-4 text-right">
          ${isAdmin ? `
            <div class="flex items-center justify-end gap-2">
              <button onclick="openEditUserModal('${u.id}')" class="px-3 py-1 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition">
                ✏️ Edit & Role
              </button>
              ${u.id !== currentUser.id ? `
                <button onclick="toggleUserAdminRole('${u.id}', '${u.access_level}')" class="px-2.5 py-1 text-[11px] font-bold ${userIsAdmin ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'} rounded-lg transition">
                  ${userIsAdmin ? 'Set Member' : 'Promote Admin'}
                </button>
              ` : ''}
            </div>
          ` : '<span class="text-slate-300 text-xs">—</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleUserAdminRole(userId, currentLevel) {
  const newLevel = currentLevel === 'Admin' ? 'Member' : 'Admin';
  if (!confirm(`Switch this user's access level to ${newLevel}?`)) return;

  const { error } = await sbClient.from('profiles').update({ access_level: newLevel }).eq('id', userId);
  if (error) return showToast(error.message, true);

  showToast(`User is now an ${newLevel}!`);
  loadTeam();
}

function openAddUserModal() {
  const modal = document.getElementById('action-modal');
  document.getElementById('modal-title').textContent = 'Add New Team Member';

  const roleOptions = `<option value="">No Specific Role</option>` +
    allRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

  document.getElementById('modal-fields').innerHTML = `
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Full Name *</label>
      <input id="u-name" type="text" required placeholder="Jane Doe" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
    </div>
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Email Address *</label>
      <input id="u-email" type="email" required placeholder="jane@nodaar.com" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
    </div>
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Temporary Password *</label>
      <input id="u-password" type="password" required value="Nodaar@2026" placeholder="Min 6 characters" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
      <span class="text-[10px] text-slate-400">Share this password with the member to sign in.</span>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">Assigned Role</label>
        <select id="u-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          ${roleOptions}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">Access Level</label>
        <select id="u-access" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          <option value="Member">Member</option>
          <option value="Admin">Admin</option>
        </select>
      </div>
    </div>
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Job Title</label>
      <input id="u-title" type="text" placeholder="e.g. Marketing Specialist, Designer" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
    </div>
  `;

  modal.classList.remove('hidden');

  document.getElementById('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creating user…';

    const full_name = document.getElementById('u-name').value.trim();
    const email = document.getElementById('u-email').value.trim();
    const password = document.getElementById('u-password').value.trim();
    const role_id = document.getElementById('u-role-id').value || null;
    const access_level = document.getElementById('u-access').value;
    const selectedRole = allRoles.find(r => r.id === role_id);
    const job_title = document.getElementById('u-title').value.trim() || (selectedRole ? selectedRole.name : 'Member');

    try {
      const tempClient = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const { data: authData, error: authErr } = await tempClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name, role: job_title, access_level }
        }
      });

      if (authErr) throw authErr;

      const newUserId = authData.user?.id;
      if (newUserId) {
        await sbClient.from('profiles').upsert({
          id: newUserId,
          email,
          full_name,
          role: job_title,
          role_id,
          access_level
        });
      }

      showToast(`User ${full_name} created successfully! 🎉`);
      closeActionModal();
      resetModalSubmit();
      loadTeam();
    } catch (err) {
      showToast(err.message || 'Failed to create user', true);
    }
    btn.disabled = false; btn.textContent = 'Save';
  };
}

async function openEditUserModal(userId) {
  const { data: user } = await sbClient.from('profiles').select('*').eq('id', userId).single();
  if (!user) return;

  const modal = document.getElementById('action-modal');
  document.getElementById('modal-title').textContent = `Edit User: ${user.full_name || user.email}`;

  const roleOptions = `<option value="">No Role</option>` +
    allRoles.map(r => `<option value="${r.id}" ${r.id === user.role_id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

  document.getElementById('modal-fields').innerHTML = `
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
      <input id="eu-name" type="text" required value="${escapeHtml(user.full_name || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
    </div>
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Email</label>
      <input type="text" disabled value="${escapeHtml(user.email)}" class="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed">
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">Role / Department</label>
        <select id="eu-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          ${roleOptions}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">Access Level (Switch Role)</label>
        <select id="eu-access" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          <option value="Member" ${user.access_level === 'Member' ? 'selected' : ''}>Member</option>
          <option value="Admin" ${user.access_level === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
    </div>
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Job Title / Display Role</label>
      <input id="eu-title" type="text" value="${escapeHtml(user.role || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
    </div>
    <div>
      <label class="block text-xs font-bold text-slate-600 mb-1">Phone Number</label>
      <input id="eu-phone" type="tel" value="${escapeHtml(user.phone || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
    </div>
  `;

  modal.classList.remove('hidden');

  document.getElementById('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('eu-name').value.trim();
    const role_id = document.getElementById('eu-role-id').value || null;
    const access_level = document.getElementById('eu-access').value;
    const role = document.getElementById('eu-title').value.trim() || 'Member';
    const phone = document.getElementById('eu-phone').value.trim();

    const { error } = await sbClient.from('profiles').update({
      full_name,
      role_id,
      access_level,
      role,
      phone
    }).eq('id', userId);

    if (error) return showToast(error.message, true);

    showToast('User updated successfully!');
    closeActionModal();
    resetModalSubmit();
    loadTeam();
  };
}

// ─────────────────────────────────────────────
// 11. ROLES (List View)
// ─────────────────────────────────────────────
async function loadRoles() {
  const container = document.getElementById('roles-container');
  if (!container) return;
  container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading roles…</div>`;

  await fetchAllRoles();
  const roles = allRoles;

  const countEl = document.getElementById('roles-count-text');
  if (countEl) countEl.textContent = `Roles & Permissions (${roles.length} Active Roles)`;

  const { data: profiles } = await sbClient.from('profiles').select('id, full_name, email, role_id, avatar_url');
  const allProfs = profiles || [];

  if (!roles || roles.length === 0) {
    container.innerHTML = `<div class="p-10 text-center text-xs text-slate-400">
      No roles created yet.
      ${currentProfile?.access_level === 'Admin' ? '<div class="mt-3"><button onclick="openActionModal()" class="px-4 py-2 bg-brand-500 text-white font-bold text-xs rounded-xl shadow">+ Create Role</button></div>' : ''}
    </div>`;
    return;
  }

  container.innerHTML = roles.map(r => {
    const assigned = allProfs.filter(p => p.role_id === r.id);

    return `
      <div class="p-4 sm:p-5 hover:bg-slate-50/50 transition">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm flex-shrink-0" style="background:${r.color || '#FE8A03'}22;color:${r.color || '#FE8A03'};border:1px solid ${r.color || '#FE8A03'}44;">
              ${(r.name || 'R').charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 class="font-bold text-sm text-navy-900">${escapeHtml(r.name)}</h4>
              <p class="text-xs text-slate-500">${escapeHtml(r.description || 'No description provided.')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="pill bg-slate-100 text-slate-600 font-bold">${assigned.length} member${assigned.length !== 1 ? 's' : ''}</span>
            ${currentProfile?.access_level === 'Admin' ? `
              <button onclick="openAssignMemberModal('${r.id}','${escapeHtml(r.name)}')" class="px-3 py-1.5 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition">+ Assign</button>
              <button onclick="deleteRole('${r.id}')" class="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition" title="Delete Role">🗑</button>
            ` : ''}
          </div>
        </div>

        <div class="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black text-slate-400 uppercase">Assigned Members:</span>
          ${assigned.length > 0 ? assigned.map(m => `
            <div class="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-700">
              ${m.avatar_url ? `<img src="${m.avatar_url}" class="w-4 h-4 rounded-full object-cover">` : `<span class="w-4 h-4 rounded-full bg-brand-500 text-white text-[8px] flex items-center justify-center font-bold">${(m.full_name || m.email).charAt(0).toUpperCase()}</span>`}
              <span>${escapeHtml(m.full_name || m.email)}</span>
              ${currentProfile?.access_level === 'Admin' ? `<button onclick="unassignRoleMember('${m.id}')" class="text-slate-400 hover:text-red-500 text-xs ml-0.5 leading-none" title="Remove">&times;</button>` : ''}
            </div>
          `).join('') : '<span class="text-slate-300 text-xs">No members currently assigned</span>'}
        </div>
      </div>
    `;
  }).join('');
}

async function unassignRoleMember(userId) {
  await sbClient.from('profiles').update({ role_id: null }).eq('id', userId);
  showToast('Member removed from role');
  loadRoles();
}

async function deleteRole(id) {
  if (!confirm('Delete this role? Members assigned to it will be unassigned.')) return;
  await sbClient.from('roles').delete().eq('id', id);
  showToast('Role deleted');
  await fetchAllRoles();
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

  sbClient.from('profiles').select('id,full_name,email').order('full_name').then(({ data }) => {
    const sel = document.getElementById('f-member');
    if (!sel) return;
    sel.innerHTML = (data || []).map(m => `<option value="${m.id}">${escapeHtml(m.full_name || m.email)}</option>`).join('');
  });

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
// 12. PROFILE PAGE
// ─────────────────────────────────────────────
function loadProfilePage() {
  if (!currentProfile) return;
  const p = currentProfile;
  const name = p.full_name || p.email || 'Member';

  document.getElementById('profile-name-display').textContent = name;
  document.getElementById('profile-role-display').textContent = `${p.role || 'Member'}`;
  document.getElementById('profile-email-display').textContent = p.email || '';
  document.getElementById('profile-access-badge').textContent = p.access_level || 'Member';
  document.getElementById('profile-access-badge').className = `pill mt-2 ${p.access_level === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`;

  const largeAvatar = document.getElementById('profile-avatar-large');
  if (p.avatar_url) {
    largeAvatar.innerHTML = `<img src="${p.avatar_url}" class="w-full h-full object-cover" alt="Avatar">`;
  } else {
    largeAvatar.textContent = name.charAt(0).toUpperCase();
  }

  document.getElementById('pf-name').value = p.full_name || '';
  document.getElementById('pf-role').value = p.role || '';
  document.getElementById('pf-phone').value = p.phone || '';

  const pfRoleSel = document.getElementById('pf-role-id');
  if (pfRoleSel) {
    pfRoleSel.innerHTML = '<option value="">No Role</option>' +
      allRoles.map(r => `<option value="${r.id}" ${p.role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  }
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
    const role_id = document.getElementById('pf-role-id').value || null;
    const phone = document.getElementById('pf-phone').value.trim();

    const { error } = await sbClient.from('profiles').update({ full_name, role, role_id, phone }).eq('id', currentUser.id);
    if (error) return showToast(error.message, true);

    currentProfile.full_name = full_name;
    currentProfile.role = role;
    currentProfile.role_id = role_id;
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
// 13. NOTIFICATIONS
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
// 14. ACTION MODAL (Tasks, OKRs, Meetings, Ideas, Roles, Team, WhatsApp)
// ─────────────────────────────────────────────
async function openActionModal() {
  // Delegate to specific modal if on specialized tab
  if (activeTab === 'team') {
    if (typeof openAddUserModal === 'function') {
      openAddUserModal();
      return;
    }
  }
  if (activeTab === 'whatsapp') {
    if (window.openWhatsAppGroupModal) {
      window.openWhatsAppGroupModal();
      return;
    }
  }
  if (activeTab === 'channels') {
    if (window.openPostUpdateModal) {
      window.openPostUpdateModal();
      return;
    }
  }
  if (activeTab === 'reports') {
    const rf = document.getElementById('report-form');
    if (rf) {
      rf.scrollIntoView({ behavior: 'smooth' });
      const firstInput = rf.querySelector('input, textarea');
      if (firstInput) firstInput.focus();
      return;
    }
  }

  const modal = document.getElementById('action-modal');
  const fields = document.getElementById('modal-fields');
  const title = document.getElementById('modal-title');

  let roleOptions = '<option value="">No Specific Role</option>';
  try {
    await fetchAllRoles();
    if (allRoles && allRoles.length) {
      roleOptions += allRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    }
  } catch (e) {
    console.warn('Could not fetch roles for modal', e);
  }

  let memberOptions = `<option value="${currentUser?.id || 'admin'}">(Me)</option>`;
  try {
    const { data: members } = await sbClient.from('profiles').select('id,full_name,email').order('full_name');
    if (members && members.length) {
      memberOptions += members.filter(m => m.id !== currentUser?.id).map(m => `<option value="${m.id}">${escapeHtml(m.full_name || m.email)}</option>`).join('');
    }
  } catch (e) {
    console.warn('Could not fetch members for modal', e);
  }

  if (activeTab === 'tasks' || !['okrs','meetings','ideas','roles'].includes(activeTab)) {
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
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Assign to Role</label><select id="f-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${roleOptions}</select></div>
      </div>
      <div class="flex items-center gap-2 p-2.5 bg-purple-50 border border-purple-200/60 rounded-xl">
        <input type="checkbox" id="f-admin-task" class="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer">
        <label for="f-admin-task" class="text-xs font-bold text-purple-900 cursor-pointer">🔒 Mark as Admin Work / Executive Task</label>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Google Drive Link</label><input id="f-link" type="url" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;

  } else if (activeTab === 'okrs') {
    title.textContent = 'New OKR';
    fields.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Quarter</label><select id="f-q" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"><option>Q1</option><option>Q2</option><option>Q3</option><option selected>Q4</option></select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Unit</label><input id="f-unit" type="text" value="%" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Objective *</label><input id="f-obj" type="text" required placeholder="Scale Client Base & Market Share" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Key Result *</label><input id="f-kr" type="text" required placeholder="Acquire 100 new paying clients" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Target</label><input id="f-target" type="number" required value="100" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Current Progress</label><input id="f-current" type="number" value="0" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Assign to Role / Dept</label>
          <select id="f-okr-role" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
            <option value="">Company-wide</option>
            ${allRoles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Lead / Owner</label>
          <select id="f-okr-owner" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
            ${memberOptions}
          </select>
        </div>
      </div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Drive Strategy Doc</label><input id="f-link" type="url" placeholder="https://drive.google.com/..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>`;

  } else if (activeTab === 'meetings') {
    title.textContent = 'Schedule Meeting';
    const today = new Date().toISOString().slice(0, 10);
    fields.innerHTML = `
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Meeting Title *</label><input id="f-title" type="text" required placeholder="Weekly Marketing Sync" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Date *</label><input id="f-date" type="date" required value="${today}" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Start</label><input id="f-start" type="time" value="10:00" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">End</label><input id="f-end" type="time" value="11:00" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
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
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Role Name *</label><input id="f-title" type="text" required placeholder="Marketing, Engineering, Operations..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Description</label><textarea id="f-desc" rows="2" placeholder="Responsibilities and scope for this role..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"></textarea></div>
      <div><label class="block text-xs font-bold text-slate-600 mb-1">Role Color</label>
        <div class="flex items-center gap-3">
          <input id="f-color" type="color" value="#FE8A03" class="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer">
          <span class="text-xs text-slate-400">Color helps identify role badges on cards</span>
        </div>
      </div>`;
  }

  modal.classList.remove('hidden');
  document.getElementById('modal-form').onsubmit = handleModalSubmit;
}
window.openActionModal = openActionModal;

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
      const is_admin_task = document.getElementById('f-admin-task')?.checked || false;
      const drive_link = document.getElementById('f-link').value || null;

      const { error } = await sbClient.from('tasks').insert({
        title, description, priority, due_date, drive_link, assignee_id, role_id, is_admin_task
      });
      if (error) throw error;

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
      const role_id = document.getElementById('f-okr-role').value || null;
      const owner_id = document.getElementById('f-okr-owner').value || currentUser.id;
      const drive_link = document.getElementById('f-link').value || null;

      const { error } = await sbClient.from('okrs').insert({
        quarter, unit, objective, key_result, target, current, drive_link, owner_id, role_id
      });
      if (error) throw error;
      showToast('OKR saved!'); closeActionModal(); loadOKRs();

    } else if (activeTab === 'meetings') {
      const title = document.getElementById('f-title').value.trim();
      const meeting_date = document.getElementById('f-date').value;
      const start_time = document.getElementById('f-start').value;
      const end_time = document.getElementById('f-end').value;
      const meet_link = document.getElementById('f-meet').value.trim() || null;
      const drive_notes_link = document.getElementById('f-notes').value.trim() || null;
      const agenda = document.getElementById('f-agenda').value.trim() || null;

      const newMeeting = {
        id: 'meet_' + Date.now(),
        title,
        meeting_date,
        start_time,
        end_time,
        meet_link,
        drive_notes_link,
        agenda,
        created_at: new Date().toISOString()
      };

      try {
        if (sbClient) {
          await sbClient.from('meetings').insert({ title, meeting_date, start_time, end_time, meet_link, drive_notes_link, agenda });
        }
      } catch (err) {
        console.warn('Supabase meeting insert notice:', err);
      }

      try {
        const local = JSON.parse(localStorage.getItem('nodaar_meetings_local') || '[]');
        local.push(newMeeting);
        localStorage.setItem('nodaar_meetings_local', JSON.stringify(local));
      } catch (e) {}

      showToast('Meeting scheduled successfully! 📅');
      closeActionModal();
      loadMeetings();

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
      showToast('Role created!'); closeActionModal();
      await fetchAllRoles();
      loadRoles();
    }
  } catch (err) {
    showToast(err.message || 'Error saving', true);
  }
  btn.disabled = false; btn.textContent = 'Save';
}

function closeActionModal() {
  document.getElementById('action-modal').classList.add('hidden');
}

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
    <div class="flex items-center gap-2 p-2.5 bg-purple-50 border border-purple-200/60 rounded-xl">
      <input type="checkbox" id="f-admin-task" ${t.is_admin_task ? 'checked' : ''} class="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer">
      <label for="f-admin-task" class="text-xs font-bold text-purple-900 cursor-pointer">🔒 Mark as Admin Work / Executive Task</label>
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
      is_admin_task: document.getElementById('f-admin-task')?.checked || false,
      due_date: document.getElementById('f-due').value || null,
      drive_link: document.getElementById('f-link').value || null,
    }).eq('id', id);
    if (error) return showToast(error.message, true);
    showToast('Task updated!'); closeActionModal(); resetModalSubmit(); loadTasks();
  };
}

// ─────────────────────────────────────────────
// 15. AUTH & HELPERS
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-pw');
  const pwInput = document.getElementById('auth-password');
  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
    });
  }

  const authForm = document.getElementById('auth-form');
  if (authForm) authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const errBox = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit-btn');
    errBox.classList.add('hidden');
    errBox.textContent = '';
    btn.disabled = true;
    btn.innerHTML = `<span>Signing in…</span>`;

    if (!sbClient) {
      initSupabase();
    }
    if (!sbClient) {
      errBox.textContent = 'Connecting to authentication services... please wait a few seconds and try again.';
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = `<span>Sign In to Workspace</span>`;
      return;
    }

    try {
      const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
      btn.disabled = false;
      btn.innerHTML = `<span>Sign In to Workspace</span>`;

      if (error) {
        errBox.textContent = error.message || 'Invalid email or password.';
        errBox.classList.remove('hidden');
      } else if (data?.user) {
        currentUser = data.user;
        await fetchProfile();
        await fetchAllRoles();
        showApp();
        showToast('Welcome back to Nodaar Hub! 🎉');
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `<span>Sign In to Workspace</span>`;
      errBox.textContent = err.message || 'Network connection error while signing in. Please check your connection.';
      errBox.classList.remove('hidden');
      console.error('Sign-in error:', err);
    }
  });

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
  const appShell = document.getElementById('app-shell');
  if (appShell) {
    appShell.classList.add('hidden');
    appShell.classList.remove('flex');
  }
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  const appShell = document.getElementById('app-shell');
  if (appShell) {
    appShell.classList.remove('hidden');
    appShell.classList.add('flex');
  }
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
