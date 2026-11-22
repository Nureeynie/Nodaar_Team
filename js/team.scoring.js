// Nodaar Team Hub — Team Performance & Member Scoring Engine
// Supports both Automatic activity-based scoring and Admin manual evaluation / overrides.

(function () {
  const SCORE_STORAGE_KEY = 'nodaar_team_scores_v1';

  // Default weights for Automatic Scoring
  const AUTO_WEIGHTS = {
    tasks: 0.35,      // 35% Task delivery rate
    standups: 0.25,   // 25% Standup frequency & hours
    meetings: 0.25,   // 25% Meeting attendance & contribution
    updates: 0.15     // 15% Daily task updates & proofs
  };

  // In-memory cache of evaluated scores
  let teamScoresCache = {};

  // Load scores from localStorage
  function loadLocalScores() {
    try {
      const raw = localStorage.getItem(SCORE_STORAGE_KEY);
      teamScoresCache = raw ? JSON.parse(raw) : {};
    } catch (e) {
      teamScoresCache = {};
    }
    return teamScoresCache;
  }

  // Save scores to localStorage
  function saveLocalScores() {
    try {
      localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(teamScoresCache));
    } catch (e) {
      console.error('Failed to save scores to localStorage', e);
    }
  }

  // Calculate Automatic Activity Score for a team member
  function calculateMemberAutoScore(user, allTasks, allReports, allMeetingParticipants, allTaskUpdates) {
    const uid = user.id;

    // 1. Task Delivery Score (35%)
    const memberTasks = (allTasks || []).filter(t => t.assignee_id === uid);
    let taskScore = 75; // Default baseline for members with no tasks assigned yet
    if (memberTasks.length > 0) {
      const done = memberTasks.filter(t => t.status === 'Done').length;
      const inProgress = memberTasks.filter(t => t.status === 'In Progress').length;
      taskScore = Math.min(100, Math.round(((done * 1.0 + inProgress * 0.5) / memberTasks.length) * 100));
    }

    // 2. Standup Consistency & Logged Hours Score (25%)
    const memberReports = (allReports || []).filter(r => r.user_id === uid);
    let standupScore = 70; // Baseline
    if (memberReports.length > 0) {
      const countScore = Math.min(100, memberReports.length * 20); // 5 reports = 100%
      const totalHours = memberReports.reduce((s, r) => s + (Number(r.hours_worked) || 8), 0);
      const avgHours = totalHours / memberReports.length;
      const hoursScore = Math.min(100, Math.round((avgHours / 8) * 100));
      standupScore = Math.round(countScore * 0.6 + hoursScore * 0.4);
    }

    // 3. Meeting Attendance & Scoring (25%)
    const memberMeetings = (allMeetingParticipants || []).filter(mp => mp.user_id === uid);
    let meetingScore = 80; // Baseline
    if (memberMeetings.length > 0) {
      const sum = memberMeetings.reduce((s, mp) => s + (Number(mp.overall_pct) || (mp.present ? 85 : 0)), 0);
      meetingScore = Math.min(100, Math.round(sum / memberMeetings.length));
    }

    // 4. Daily Task Updates & Work Proofs (15%)
    const memberUpdates = (allTaskUpdates || []).filter(u => u.user_id === uid);
    let updateScore = 75; // Baseline
    if (memberUpdates.length > 0) {
      const withProof = memberUpdates.filter(u => u.drive_link && u.drive_link.trim()).length;
      const proofRate = Math.min(100, Math.round((withProof / memberUpdates.length) * 100));
      updateScore = Math.min(100, Math.round(Math.min(100, memberUpdates.length * 25) * 0.6 + proofRate * 0.4));
    }

    // Overall Weighted Automatic Score
    const autoScore = Math.min(100, Math.max(0, Math.round(
      taskScore * AUTO_WEIGHTS.tasks +
      standupScore * AUTO_WEIGHTS.standups +
      meetingScore * AUTO_WEIGHTS.meetings +
      updateScore * AUTO_WEIGHTS.updates
    )));

    return {
      autoScore,
      taskScore,
      standupScore,
      meetingScore,
      updateScore,
      metrics: {
        totalTasks: memberTasks.length,
        completedTasks: memberTasks.filter(t => t.status === 'Done').length,
        standupsCount: memberReports.length,
        meetingsCount: memberMeetings.length,
        updatesCount: memberUpdates.length
      }
    };
  }

  // Get score grade & badge config
  function getScoreBadge(score) {
    if (score >= 90) {
      return { grade: 'A+', label: 'Elite Performer', color: 'emerald', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: '#10B981' };
    } else if (score >= 80) {
      return { grade: 'A', label: 'Strong Performer', color: 'blue', bg: 'bg-blue-50 text-blue-700 border-blue-200', ring: '#3B82F6' };
    } else if (score >= 65) {
      return { grade: 'B', label: 'Meets Expectations', color: 'amber', bg: 'bg-amber-50 text-amber-700 border-amber-200', ring: '#F59E0B' };
    } else {
      return { grade: 'C', label: 'Needs Support', color: 'rose', bg: 'bg-rose-50 text-rose-700 border-rose-200', ring: '#F43F5E' };
    }
  }

  // Main Loader for Team Scores View
  async function loadTeamScores() {
    const container = document.getElementById('team-scores-container');
    if (!container) return;

    container.innerHTML = `
      <div class="py-16 text-center text-slate-400">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3"></div>
        <div class="text-xs font-semibold">Calculating team performance metrics & scores…</div>
      </div>
    `;

    loadLocalScores();

    const sb = window.sbClient || (typeof getSupabase === 'function' ? getSupabase() : null);

    let profiles = [];
    let tasks = [];
    let reports = [];
    let meetingParticipants = [];
    let taskUpdates = [];

    try {
      if (sb) {
        const [pRes, tRes, rRes, mpRes, tuRes] = await Promise.allSettled([
          sb.from('profiles').select('*, roles:role_id(name,color)').order('full_name'),
          sb.from('tasks').select('*'),
          sb.from('reports').select('*'),
          sb.from('meeting_participants').select('*'),
          sb.from('task_updates').select('*')
        ]);
        profiles = pRes.value?.data || [];
        tasks = tRes.value?.data || [];
        reports = rRes.value?.data || [];
        meetingParticipants = mpRes.value?.data || [];
        taskUpdates = tuRes.value?.data || [];
      }
    } catch (e) {
      console.warn('Error fetching Supabase data for team scores, using cached data', e);
    }

    // Fallback if profiles list is empty
    if (!profiles || profiles.length === 0) {
      profiles = JSON.parse(localStorage.getItem('nodaar_profiles_cache') || '[]') || [];
      if (profiles.length === 0 && window.currentUser) {
        profiles = [{
          id: window.currentUser.id,
          full_name: window.currentUser.user_metadata?.full_name || window.currentUser.email || 'Current User',
          email: window.currentUser.email,
          role: 'Founder / Admin',
          access_level: 'Admin'
        }];
      }
    }

    // Compute automatic scores & merge with manual entries
    const memberEvaluations = profiles.map(member => {
      const autoData = calculateMemberAutoScore(member, tasks, reports, meetingParticipants, taskUpdates);
      const saved = teamScoresCache[member.id] || {
        mode: 'auto', // 'auto' | 'manual' | 'blended'
        manualScore: autoData.autoScore,
        adminNotes: '',
        lastReviewedAt: null,
        reviewedBy: null
      };

      let finalScore = autoData.autoScore;
      if (saved.mode === 'manual' && typeof saved.manualScore === 'number') {
        finalScore = saved.manualScore;
      } else if (saved.mode === 'blended' && typeof saved.manualScore === 'number') {
        finalScore = Math.round(autoData.autoScore * 0.5 + saved.manualScore * 0.5);
      }

      return {
        member,
        autoData,
        saved,
        finalScore
      };
    });

    renderTeamScoresUI(memberEvaluations);
  }

  // Render the Team Scores & Evaluations View
  function renderTeamScoresUI(evaluations) {
    const container = document.getElementById('team-scores-container');
    if (!container) return;

    if (evaluations.length === 0) {
      container.innerHTML = `
        <div class="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400">
          <p class="text-sm font-semibold">No team members registered yet to score.</p>
        </div>
      `;
      return;
    }

    const isAdmin = Boolean(
      window.currentProfile?.access_level === 'Admin' ||
      (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
      window.currentUser?.email === 'nodaarltd@gmail.com' ||
      (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
    );

    // Summary statistics
    const totalMembers = evaluations.length;
    const avgScore = Math.round(evaluations.reduce((s, e) => s + e.finalScore, 0) / totalMembers);
    const sorted = [...evaluations].sort((a, b) => b.finalScore - a.finalScore);
    const topPerformer = sorted[0];
    const topBadge = getScoreBadge(topPerformer?.finalScore || 0);
    const avgBadge = getScoreBadge(avgScore);

    const autoCount = evaluations.filter(e => e.saved.mode === 'auto').length;
    const manualCount = evaluations.filter(e => e.saved.mode !== 'auto').length;

    let html = `
      <!-- 1. KPI Metric Bar -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Team Performance</span>
            <span class="text-xl">🏆</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-black text-navy-900">${avgScore}%</span>
            <span class="pill ${avgBadge.bg} border text-[11px] font-bold">Grade ${avgBadge.grade}</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Average across all ${totalMembers} team members</p>
          <div class="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div class="bg-brand-500 h-1.5 rounded-full" style="width:${avgScore}%"></div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Top Performer</span>
            <span class="text-xl">🌟</span>
          </div>
          <div class="font-extrabold text-navy-900 text-sm truncate">${escapeHtml(topPerformer?.member.full_name || 'Member')}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-2xl font-black text-emerald-600">${topPerformer?.finalScore}%</span>
            <span class="pill ${topBadge.bg} border text-[10px] font-bold">${topBadge.label}</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Leading current cycle</p>
        </div>

        <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Scoring Mode</span>
            <span class="text-xl">⚡</span>
          </div>
          <div class="text-sm font-extrabold text-navy-900 flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Automatic & Manual
          </div>
          <div class="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span><b>${autoCount}</b> Auto-scored</span>
            <span class="text-brand-600 font-semibold">${manualCount} Admin reviews</span>
          </div>
          <p class="text-[10px] text-slate-400 mt-2">Activity tracked: tasks, standups, meetings</p>
        </div>

        <div class="bg-gradient-to-br from-navy-950 to-navy-900 text-white p-5 rounded-3xl shadow-sm border border-navy-800 relative overflow-hidden">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-brand-400 uppercase tracking-wider">Admin Controls</span>
            <span class="text-xl">🛡️</span>
          </div>
          <div class="text-xs text-slate-300 font-medium leading-relaxed">
            ${isAdmin ? 'You have full permission to add manual scores, adjust ratings or recalculate.' : 'Signed in as team member (Read-only scorecard mode).'}
          </div>
          ${isAdmin ? `
            <button onclick="window.recalculateAllAutoScores()" class="mt-3 w-full py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5">
              <span>⚡</span> Recalculate All Scores
            </button>
          ` : `
            <div class="mt-3 text-[11px] text-brand-400 font-semibold">🔒 Admin evaluation active</div>
          `}
        </div>
      </div>

      <!-- 2. Controls & Search Bar -->
      <div class="bg-white rounded-3xl border border-slate-200 p-4 mb-6 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 flex-1">
          <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 w-full sm:w-auto sm:min-w-[220px]">
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M10 18a8 8 0 110-16 8 8 0 010 16z"/></svg>
            <input type="text" id="score-search-input" class="bg-transparent text-xs w-full focus:outline-none" oninput="window.filterScorecards()">
          </div>

          <select id="score-filter-mode" onchange="window.filterScorecards()" class="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="all">All Modes (Auto + Manual)</option>
            <option value="auto">⚡ Automatic Activity</option>
            <option value="manual">✏️ Admin Manual Review</option>
            <option value="blended">⚖️ Hybrid Blended</option>
          </select>

          <select id="score-sort-by" onchange="window.filterScorecards()" class="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="score-desc">Highest Score First</option>
            <option value="score-asc">Lowest Score First</option>
            <option value="name">Alphabetical (A-Z)</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="window.exportScorecardSummary()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5">
            <span>📥</span> Export Summary
          </button>
        </div>
      </div>

      <!-- 3. Member Scorecards List -->
      <div id="scorecards-list" class="space-y-4">
        ${evaluations.map(ev => renderMemberScorecard(ev, isAdmin)).join('')}
      </div>
    `;

    container.innerHTML = html;
  }

  // Render Individual Scorecard Card
  function renderMemberScorecard(ev, isAdmin) {
    const { member, autoData, saved, finalScore } = ev;
    const badge = getScoreBadge(finalScore);
    const initials = (member.full_name || member.email || 'M').charAt(0).toUpperCase();

    const modeLabels = {
      auto: '<span class="pill bg-emerald-50 text-emerald-700 border border-emerald-200">⚡ Automatic Activity</span>',
      manual: '<span class="pill bg-purple-50 text-purple-700 border border-purple-200">✏️ Admin Evaluated</span>',
      blended: '<span class="pill bg-blue-50 text-blue-700 border border-blue-200">⚖️ Blended (50% Auto + 50% Admin)</span>'
    };

    const roleName = member.roles?.name || member.role || 'Team Member';
    const roleColor = member.roles?.color || '#FE8A03';

    return `
      <div class="scorecard-card bg-white rounded-3xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition" data-name="${escapeHtml((member.full_name || member.email || '').toLowerCase())}" data-mode="${saved.mode || 'auto'}" data-score="${finalScore}">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <!-- Member Avatar & Info -->
          <div class="flex items-center gap-3.5 w-full lg:w-auto min-w-0">
            <div class="relative flex-shrink-0">
              <div class="w-12 h-12 rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                ${member.avatar_url
                  ? `<img src="${member.avatar_url}" class="w-full h-full object-cover">`
                  : `<div class="w-full h-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-base flex items-center justify-center">${initials}</div>`
                }
              </div>
              <span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white" style="background:${badge.ring}">
                ${badge.grade}
              </span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-bold text-navy-900 text-sm">${escapeHtml(member.full_name || member.email)}</h4>
                ${member.access_level === 'Admin' ? '<span class="pill bg-purple-100 text-purple-700 text-[9px]">Admin</span>' : ''}
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="pill text-[10px]" style="background:${roleColor}15;color:${roleColor};border:1px solid ${roleColor}30;">${escapeHtml(roleName)}</span>
                <span class="text-[11px] text-slate-400 truncate">${escapeHtml(member.email || '')}</span>
              </div>
              <div class="mt-2 flex items-center gap-1.5">
                ${modeLabels[saved.mode] || modeLabels.auto}
              </div>
            </div>
          </div>

          <!-- Activity Dimension Breakdown Bars -->
          <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
            <div>
              <div class="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                <span>📋 Tasks</span>
                <span class="font-bold text-navy-900">${autoData.taskScore}%</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div class="bg-blue-500 h-1.5 rounded-full" style="width:${autoData.taskScore}%"></div>
              </div>
              <div class="text-[10px] text-slate-400 mt-1">${autoData.metrics.completedTasks}/${autoData.metrics.totalTasks} Done</div>
            </div>

            <div>
              <div class="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                <span>📝 Standups</span>
                <span class="font-bold text-navy-900">${autoData.standupScore}%</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div class="bg-amber-500 h-1.5 rounded-full" style="width:${autoData.standupScore}%"></div>
              </div>
              <div class="text-[10px] text-slate-400 mt-1">${autoData.metrics.standupsCount} Logged</div>
            </div>

            <div>
              <div class="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                <span>🎙️ Meetings</span>
                <span class="font-bold text-navy-900">${autoData.meetingScore}%</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div class="bg-emerald-500 h-1.5 rounded-full" style="width:${autoData.meetingScore}%"></div>
              </div>
              <div class="text-[10px] text-slate-400 mt-1">${autoData.metrics.meetingsCount} Attended</div>
            </div>

            <div>
              <div class="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                <span>⏱️ Updates</span>
                <span class="font-bold text-navy-900">${autoData.updateScore}%</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div class="bg-purple-500 h-1.5 rounded-full" style="width:${autoData.updateScore}%"></div>
              </div>
              <div class="text-[10px] text-slate-400 mt-1">${autoData.metrics.updatesCount} Proofs</div>
            </div>
          </div>

          <!-- Score Rating Gauge & Admin Action -->
          <div class="flex items-center justify-between lg:justify-end gap-3 sm:gap-4 w-full lg:w-auto min-w-0">
            <div class="text-right">
              <div class="flex items-baseline justify-end gap-1.5">
                <span class="text-3xl font-black text-navy-900">${finalScore}%</span>
                <span class="text-xs font-bold text-slate-400">/ 100</span>
              </div>
              <div class="pill ${badge.bg} border text-[10px] font-bold mt-0.5">
                ${badge.label}
              </div>
              ${saved.adminNotes ? `<div class="text-[10px] text-slate-500 mt-1 max-w-[150px] truncate" title="${escapeHtml(saved.adminNotes)}">💬 "${escapeHtml(saved.adminNotes)}"</div>` : ''}
            </div>

            <div>
              ${isAdmin ? `
                <button onclick="window.openScoreModal('${member.id}', '${escapeHtml((member.full_name || member.email).replace(/'/g, "\\'"))}')" class="px-3.5 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 hover:text-brand-800 font-bold text-xs rounded-xl border border-brand-200/80 transition shadow-sm flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                  <span>Score</span>
                </button>
              ` : `
                <button onclick="window.viewMemberScoreDetail('${member.id}')" class="px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition">
                  Details
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Open Score Adjustment & Management Modal for Admin
  window.openScoreModal = function (userId, userName) {
    loadLocalScores();
    const entry = teamScoresCache[userId] || {
      mode: 'auto',
      manualScore: 80,
      breakdown: { task: 80, attendance: 80, collaboration: 80, quality: 80 },
      adminNotes: ''
    };

    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    if (!modalTitle || !modalFields) return;

    modalTitle.innerHTML = `🏆 Manage Score: <span class="text-brand-600">${escapeHtml(userName)}</span>`;
    modalFields.innerHTML = `
      <div class="space-y-4">
        <!-- Mode Switcher -->
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Scoring Mode</label>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 cursor-pointer text-center hover:bg-slate-50 ${entry.mode === 'auto' ? 'bg-brand-50 border-brand-400 font-bold text-brand-700' : 'text-slate-600'}">
              <input type="radio" name="score-mode" value="auto" ${entry.mode === 'auto' ? 'checked' : ''} class="hidden" onchange="window.updateScoreModalMode(this.value)">
              <span class="text-xs">⚡ Automatic</span>
              <span class="text-[10px] text-slate-400 mt-0.5">System activity</span>
            </label>
            <label class="flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 cursor-pointer text-center hover:bg-slate-50 ${entry.mode === 'blended' ? 'bg-brand-50 border-brand-400 font-bold text-brand-700' : 'text-slate-600'}">
              <input type="radio" name="score-mode" value="blended" ${entry.mode === 'blended' ? 'checked' : ''} class="hidden" onchange="window.updateScoreModalMode(this.value)">
              <span class="text-xs">⚖️ Blended</span>
              <span class="text-[10px] text-slate-400 mt-0.5">50% Auto + 50% Admin</span>
            </label>
            <label class="flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 cursor-pointer text-center hover:bg-slate-50 ${entry.mode === 'manual' ? 'checked' : ''} ${entry.mode === 'manual' ? 'bg-brand-50 border-brand-400 font-bold text-brand-700' : 'text-slate-600'}">
              <input type="radio" name="score-mode" value="manual" ${entry.mode === 'manual' ? 'checked' : ''} class="hidden" onchange="window.updateScoreModalMode(this.value)">
              <span class="text-xs">✏️ Manual</span>
              <span class="text-[10px] text-slate-400 mt-0.5">Admin evaluation</span>
            </label>
          </div>
        </div>

        <!-- Sliders for Manual / Blended evaluation -->
        <div id="manual-sliders-box" class="${entry.mode === 'auto' ? 'opacity-50 pointer-events-none' : ''} space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-navy-900">Admin Evaluation Breakdown</span>
            <span id="modal-computed-score" class="text-sm font-black text-brand-600">80%</span>
          </div>

          <div>
            <div class="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span>Task Execution & Quality</span>
              <span id="val-task-slider">${entry.breakdown?.task || 80}%</span>
            </div>
            <input type="range" id="slider-task" min="0" max="100" value="${entry.breakdown?.task || 80}" class="w-full accent-brand-500" oninput="window.recomputeModalScore()">
          </div>

          <div>
            <div class="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span>Attendance & Standup Punctuality</span>
              <span id="val-att-slider">${entry.breakdown?.attendance || 80}%</span>
            </div>
            <input type="range" id="slider-att" min="0" max="100" value="${entry.breakdown?.attendance || 80}" class="w-full accent-brand-500" oninput="window.recomputeModalScore()">
          </div>

          <div>
            <div class="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span>Team Collaboration & Meetings</span>
              <span id="val-collab-slider">${entry.breakdown?.collaboration || 80}%</span>
            </div>
            <input type="range" id="slider-collab" min="0" max="100" value="${entry.breakdown?.collaboration || 80}" class="w-full accent-brand-500" oninput="window.recomputeModalScore()">
          </div>

          <div>
            <div class="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span>Leadership & Initiative Bonus</span>
              <span id="val-qual-slider">${entry.breakdown?.quality || 80}%</span>
            </div>
            <input type="range" id="slider-qual" min="0" max="100" value="${entry.breakdown?.quality || 80}" class="w-full accent-brand-500" oninput="window.recomputeModalScore()">
          </div>
        </div>

        <!-- Notes / Feedback -->
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Admin Feedback & Review Notes</label>
          <textarea id="modal-score-notes" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${escapeHtml(entry.adminNotes || '')}</textarea>
        </div>

        <!-- Hidden ID -->
        <input type="hidden" id="modal-score-user-id" value="${userId}">
      </div>
    `;

    document.getElementById('action-modal').classList.remove('hidden');

    window.recomputeModalScore();

    // Bind form submit
    const modalForm = document.getElementById('modal-form');
    modalForm.onsubmit = async function (e) {
      e.preventDefault();
      const uid = document.getElementById('modal-score-user-id').value;
      const selectedMode = document.querySelector('input[name="score-mode"]:checked')?.value || 'auto';
      const taskVal = Number(document.getElementById('slider-task')?.value || 80);
      const attVal = Number(document.getElementById('slider-att')?.value || 80);
      const collabVal = Number(document.getElementById('slider-collab')?.value || 80);
      const qualVal = Number(document.getElementById('slider-qual')?.value || 80);
      const manualScore = Math.round((taskVal + attVal + collabVal + qualVal) / 4);
      const notes = document.getElementById('modal-score-notes')?.value || '';

      teamScoresCache[uid] = {
        mode: selectedMode,
        manualScore,
        breakdown: { task: taskVal, attendance: attVal, collaboration: collabVal, quality: qualVal },
        adminNotes: notes,
        lastReviewedAt: new Date().toISOString(),
        reviewedBy: window.currentUser?.id
      };

      saveLocalScores();

      // Attempt Supabase sync if member_scores table is present
      try {
        const sb = window.sbClient || (typeof getSupabase === 'function' ? getSupabase() : null);
        if (sb) {
          await sb.from('member_scores').upsert({
            user_id: uid,
            mode: selectedMode,
            manual_score: manualScore,
            task_score: taskVal,
            attendance_score: attVal,
            collaboration_score: collabVal,
            leadership_score: qualVal,
            admin_notes: notes,
            scored_by: window.currentUser?.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        }
      } catch (err) {
        console.info('Supabase member_scores not present; saved to local cache', err);
      }

      if (typeof showToast === 'function') {
        showToast('Team score updated successfully! 🏆');
      }
      closeActionModal();
      loadTeamScores();
    };
  };

  window.updateScoreModalMode = function (mode) {
    const sliderBox = document.getElementById('manual-sliders-box');
    if (sliderBox) {
      if (mode === 'auto') {
        sliderBox.classList.add('opacity-50', 'pointer-events-none');
      } else {
        sliderBox.classList.remove('opacity-50', 'pointer-events-none');
      }
    }
    // Update border highlight on labels
    document.querySelectorAll('input[name="score-mode"]').forEach(input => {
      const parent = input.closest('label');
      if (parent) {
        if (input.value === mode) {
          parent.className = 'flex flex-col items-center justify-center p-2.5 rounded-xl border border-brand-400 bg-brand-50 cursor-pointer text-center font-bold text-brand-700';
        } else {
          parent.className = 'flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 cursor-pointer text-center hover:bg-slate-50 text-slate-600';
        }
      }
    });
  };

  window.recomputeModalScore = function () {
    const t = Number(document.getElementById('slider-task')?.value || 80);
    const a = Number(document.getElementById('slider-att')?.value || 80);
    const c = Number(document.getElementById('slider-collab')?.value || 80);
    const q = Number(document.getElementById('slider-qual')?.value || 80);

    const valT = document.getElementById('val-task-slider');
    const valA = document.getElementById('val-att-slider');
    const valC = document.getElementById('val-collab-slider');
    const valQ = document.getElementById('val-qual-slider');

    if (valT) valT.textContent = t + '%';
    if (valA) valA.textContent = a + '%';
    if (valC) valC.textContent = c + '%';
    if (valQ) valQ.textContent = q + '%';

    const avg = Math.round((t + a + c + q) / 4);
    const compEl = document.getElementById('modal-computed-score');
    if (compEl) {
      compEl.textContent = avg + '%';
    }
  };

  window.filterScorecards = function () {
    const q = (document.getElementById('score-search-input')?.value || '').toLowerCase();
    const mode = document.getElementById('score-filter-mode')?.value || 'all';
    const sort = document.getElementById('score-sort-by')?.value || 'score-desc';

    const cards = Array.from(document.querySelectorAll('.scorecard-card'));
    cards.forEach(card => {
      const name = card.dataset.name || '';
      const cardMode = card.dataset.mode || 'auto';
      const matchesQ = !q || name.includes(q);
      const matchesMode = mode === 'all' || cardMode === mode;
      card.style.display = matchesQ && matchesMode ? '' : 'none';
    });

    // Reorder visible cards
    const container = document.getElementById('scorecards-list');
    if (!container) return;

    const visibleCards = cards.filter(c => c.style.display !== 'none');
    visibleCards.sort((a, b) => {
      if (sort === 'score-desc') return Number(b.dataset.score) - Number(a.dataset.score);
      if (sort === 'score-asc') return Number(a.dataset.score) - Number(b.dataset.score);
      if (sort === 'name') return (a.dataset.name || '').localeCompare(b.dataset.name || '');
      return 0;
    });
    visibleCards.forEach(c => container.appendChild(c));
  };

  window.recalculateAllAutoScores = function () {
    loadLocalScores();
    Object.keys(teamScoresCache).forEach(k => {
      if (teamScoresCache[k].mode === 'auto') {
        delete teamScoresCache[k];
      }
    });
    saveLocalScores();
    if (typeof showToast === 'function') {
      showToast('⚡ Recalculated all automatic team scores from live activities!');
    }
    loadTeamScores();
  };

  window.exportScorecardSummary = function () {
    const cards = document.querySelectorAll('.scorecard-card');
    let csv = 'Member,Score,Mode\n';
    cards.forEach(c => {
      const name = c.dataset.name || '';
      const score = c.dataset.score || '';
      const mode = c.dataset.mode || '';
      csv += `"${name}",${score}%,${mode}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nodaar_Team_Scores_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    if (typeof showToast === 'function') {
      showToast('Scorecard exported! 📥');
    }
  };

  // Register with App Navigation
  if (typeof window.TAB_META !== 'undefined') {
    window.TAB_META['scores'] = {
      title: 'Team Scores & Evaluations',
      sub: 'Automatic activity-based scoring + Admin performance reviews and adjustments',
      btn: ''
    };
  }

  // Hook into loadTabData
  const origLoadTabData = window.loadTabData;
  window.loadTabData = async function (tab) {
    if (tab === 'scores') {
      await loadTeamScores();
    } else if (origLoadTabData) {
      await origLoadTabData(tab);
    }
  };

  window.loadTeamScores = loadTeamScores;

})();
