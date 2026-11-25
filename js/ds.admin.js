/* Nodaar DS — admin screens
   Review queue, review+score, users, units, tasks & OKRs, meetings,
   ideas, scores & periods, calendar & leave, library admin, channels. */
(function () {
  const { $, $$, esc, S, sb, nameOf, lateBy } = window.DS;
  const { todayLagos, fmtDT, fmtD } = window.DS.fmt;
  const toast = window.DS.toast;

  const SECTIONS = ['Operations','Team','Reseller','Supplier','Customers','Social Media','Logistics','Finance','Mission and Vision','Research','Product/App','Others'];
  const TASK_STATUS = ['To do','In progress','In review','Done'];
  const FB_STATUS = ['Submitted','Approved','In progress','Implemented','Rejected'];

  // ── helpers ──
  const normTaskStatus = (s) => {
    const k = String(s || 'To do').trim().toLowerCase();
    if (k === 'in progress') return 'In progress';
    if (k === 'in review') return 'In review';
    if (k === 'done') return 'Done';
    return 'To do';
  };
  const tagFor = (s) => {
    const t = String(s || '');
    if (['Rejected','Dismissed','Declined'].includes(t)) return 'alert';
    if (['Approved','Done','Implemented','Scored','Resolved'].includes(t)) return 'ok';
    if (['Submitted','Open','In progress','In Progress','In review','In Review'].includes(t)) return '';
    return 'muted-tag';
  };
  const statusTag = (s, extra) => `<span class="tag ${tagFor(s)}">${esc(s || '—')}${extra ? ' ' + esc(extra) : ''}</span>`;

  function emptyState(big, hint, cta) {
    return `<div class="empty"><div class="big">${esc(big)}</div><div class="hint">${esc(hint)}</div>${cta || ''}</div>`;
  }

  // Pickers
  async function loadPeople() {
    const { data } = await sb.from('profiles').select('id,email,full_name,access_level,active').order('full_name');
    return data || [];
  }
  async function loadUnits() {
    const { data } = await sb.from('units').select('id,name,description,lead_id').order('name');
    return data || [];
  }
  async function loadPositions() {
    const { data } = await sb.from('positions').select('id,title').order('title');
    return data || [];
  }

  async function audit(action, target, oldv, newv) {
    try {
      await sb.from('audit_log').insert({ actor_id: S.user.id, action, target, old_value: oldv == null ? null : String(oldv), new_value: newv == null ? null : String(newv) });
    } catch (e) { /* audit is best-effort */ }
  }

  // notify every admin (and optionally the subject)
  // NOTE: supabase-js query builders are thenables, not Promises — they have no
  // .catch(). Always await them inside a try/catch and inspect .error instead.
  async function notifyAdmins(subject, title, body, linkTab) {
    try {
      const { data: admins } = await sb.from('profiles').select('id').eq('access_level', 'Admin').eq('active', true);
      for (const a of (admins || [])) {
        if (a.id === subject) continue;
        try { await sb.from('notifications').insert({ user_id: a.id, type: 'admin', title, body: body || null, link_tab: linkTab || null }); }
        catch (e) { /* notification is best-effort */ }
      }
    } catch (e) { /* best-effort */ }
  }
  async function notifyUser(userId, type, title, body, linkTab) {
    if (!userId) return;
    try { await sb.from('notifications').insert({ user_id: userId, type, title, body: body || null, link_tab: linkTab || null }); }
    catch (e) { /* notification is best-effort — never block the save on it */ }
  }

  /* ============================================================
     ADMIN DASHBOARD
     ============================================================ */
  window.renderAdminDashboard = async function (v) {
    const date = todayLagos();
    const people = await loadPeople();
    const active = people.filter(p => p.active !== false);
    const [pending, todayReports, tasks, meetings, fb, blockers, scores] = await Promise.all([
      sb.from('daily_reports').select('id', { count: 'exact', head: true }).in('status', ['Submitted']),
      sb.from('daily_reports').select('id,user_id,status,is_late').eq('report_date', date),
      sb.from('tasks').select('id,title,status,due_date,assignee_id'),
      sb.from('meetings').select('id,title,starts_at,meeting_date,start_time').gte('starts_at', new Date().toISOString()).order('starts_at').limit(5),
      sb.from('weekly_feedback').select('id,status,type').in('status', ['Submitted', 'Open']),
      sb.from('daily_reports').select('id,user_id,blockers').eq('report_date', date).not('blockers', 'is', null),
      sb.from('weekly_scores').select('user_id,weighted_total,manual_override,period_id,scored_at,periods:period_id(label,locked)').order('scored_at', { ascending: false }).limit(60),
    ]);

    const allTasks = tasks.data || [];
    const overdue = allTasks.filter(t => t.status !== 'Done' && t.due_date && t.due_date < date);
    const submittedToday = (todayReports.data || []).length;
    const missedToday = (todayReports.data || []).filter(r => r.missed_report).length;
    const openBlockers = (blockers.data || []).filter(b => b.blockers && b.blockers.trim());

    // per-member performance summary (latest weekly score per member)
    const latest = {};
    for (const s of (scores.data || [])) {
      if (!latest[s.user_id]) latest[s.user_id] = s;
    }

    v.innerHTML = `
      <div class="stat-grid">
        <div class="stat ${(pending.count || 0) ? 'accent' : ''}"><div class="num">${pending.count || 0}</div><div class="cap">Waiting for review</div></div>
        <div class="stat ok"><div class="num">${submittedToday}<span class="muted" style="font-size:16px">/${active.length}</span></div><div class="cap">Reports today</div></div>
        <div class="stat ${missedToday ? 'alert' : ''}"><div class="num ${missedToday ? 'alert-text' : ''}">${missedToday}</div><div class="cap">Missed today (0)</div></div>
        <div class="stat ${overdue.length ? 'alert' : ''}"><div class="num ${overdue.length ? 'alert-text' : ''}">${overdue.length}</div><div class="cap">Overdue tasks</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Needs your attention</h3><button class="btn accent sm" data-go="review">Open review queue</button></div>
        <div class="row"><div class="row-main"><div class="t">${pending.count || 0} daily reports waiting</div><div class="s">Approve with a score, or reject and ask for a resubmission.</div></div><button class="btn sm" data-go="review">Review</button></div>
        <div class="row"><div class="row-main"><div class="t">${openBlockers.length} open blockers today</div><div class="s">Members flagged something they cannot move past.</div></div></div>
        <div class="row"><div class="row-main"><div class="t">${(fb.data || []).length} ideas and problems awaiting a decision</div><div class="s">Approve, mark in progress, or reject with a reason.</div></div><button class="btn sm" data-go="ideas">Decide</button></div>
        <div class="row"><div class="row-main"><div class="t">${overdue.length} overdue tasks</div><div class="s">Past due date and not done.</div></div><button class="btn sm" data-go="tasks">Open tasks</button></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Per-member performance</h3>
            <p class="small muted" style="margin-top:2px">Latest scored week for active team members</p>
          </div>
          <button class="btn sm ghost" data-go="scores">All scores</button>
        </div>
        ${active.length ? `
          <div class="ds-list">
            ${active.map(p => {
              const s = latest[p.id];
              const val = s ? (s.manual_override ?? s.weighted_total) : null;
              const initials = window.DS.getInitials(nameOf(p));
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-avatar">${esc(initials)}</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${esc(nameOf(p))}</span>
                        ${val != null ? `<span class="tag ok"><b>${val}/100</b></span>` : '<span class="tag muted-tag">Not scored</span>'}
                        ${s ? (s.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>') : ''}
                      </div>
                      <div class="ds-list-sub">
                        <span>Period: <b>${s ? esc(s.periods?.label || '—') : 'No period yet'}</b></span>
                        <span>·</span>
                        <span>Role: ${esc(p.access_level || 'Member')}</span>
                      </div>
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button class="btn sm" data-go="scores">View</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : emptyState('No members yet', 'Create users so the team can start reporting.', '<button class="btn primary sm" data-go="users">Create a user</button>')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Upcoming meetings</h3><button class="btn sm ghost" data-go="meetings">All meetings</button></div>
        ${(meetings.data || []).length ? (meetings.data || []).map(raw => { const m = window.DS.meeting(raw); return `<div class="row"><div class="row-main"><div class="t">${esc(m.title)}</div><div class="s">${fmtDT(m.starts_at)}</div></div></div>`; }).join('')
          : emptyState('No upcoming meetings', 'Create one and invite a unit or individual members.')}
      </div>`;

    $$('[data-go]', v).forEach(b => b.addEventListener('click', () => window.DS.navigate(b.dataset.go)));
  };

  /* ============================================================
     REVIEW QUEUE
     ============================================================ */
  window.DS.registerRoute('review', {
    title: 'Review queue',
    sub: 'Daily reports, meeting reports, ideas and problems awaiting a decision',
    render: async (v) => { await window.renderReviewQueue(v); },
  });

  window.renderReviewQueue = async function (v) {
    const people = await loadPeople();
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const [{ data: reports }, { data: feedback }, { data: att }] = await Promise.all([
      sb.from('daily_reports').select('*').in('status', ['Submitted']).order('submitted_at', { ascending: true }),
      sb.from('weekly_feedback').select('*').in('status', ['Submitted', 'Open']).order('created_at', { ascending: true }),
      sb.from('meeting_attendance').select('*').order('id', { ascending: true }),
    ]);

    // meeting reports that have not been reviewed (no score marker)
    const { data: meetings } = await sb.from('meetings').select('id,title');
    const mmap = Object.fromEntries((meetings || []).map(m => [m.id, m]));
    const reviewedAtt = new Set((att || []).filter(a => a.scored).map(a => a.meeting_id + ':' + a.user_id));

    const items = [];
    for (const r of (reports || [])) {
      items.push({ kind: 'daily', kindLabel: 'Daily report', id: r.id, ts: r.submitted_at, who: pmap[r.user_id], late: r.is_late, lateMin: r.late_minutes, missed: r.missed_report, title: 'Daily report · ' + fmtD(r.report_date), sub: (r.did_yesterday || r.doing_today || '').slice(0, 120) });
    }
    for (const f of (feedback || [])) {
      items.push({ kind: 'feedback', kindLabel: f.type === 'idea' ? 'Idea' : 'Problem', id: f.id, ts: f.created_at, who: pmap[f.user_id], late: false, title: (f.type === 'idea' ? 'Idea' : 'Problem') + (f.title ? ' · ' + f.title : ''), sub: (f.content || '').slice(0, 120), feedback: f });
    }
    for (const a of (att || [])) {
      if (reviewedAtt.has(a.meeting_id + ':' + a.user_id)) continue;
      if (!a.note || !a.note.trim()) continue;
      items.push({ kind: 'meeting', kindLabel: 'Meeting', id: a.id, ts: a.created_at || new Date().toISOString(), who: pmap[a.user_id], late: false, title: 'Meeting report · ' + (mmap[a.meeting_id]?.title || 'Meeting'), sub: a.note.slice(0, 120), att: a });
    }
    items.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    const counts = {
      all: items.length,
      daily: items.filter(i => i.kind === 'daily').length,
      meeting: items.filter(i => i.kind === 'meeting').length,
      feedback: items.filter(i => i.kind === 'feedback').length,
    };
    const urgentCount = items.filter(i => i.late || i.missed).length;

    let filterKind = '';
    let filterWho = '';
    let reviewPage = 1;

    function renderReviewView() {
      const filtered = items.filter(it =>
        (!filterKind || it.kind === filterKind) &&
        (!filterWho || it.who?.id === filterWho)
      );
      const pg = window.DS.paginate(filtered, reviewPage, 25);
      const hasFilter = !!(filterKind || filterWho);

      v.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div>
              <h3>${filtered.length} item${filtered.length === 1 ? '' : 's'} ${hasFilter ? 'matching filter' : 'waiting'}</h3>
              <p class="small muted" style="margin-top:2px">Daily scrums, meeting reports, and weekly ideas needing decisions</p>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              ${urgentCount ? `<span class="tag alert">${urgentCount} late / missed</span>` : ''}
              ${pg.totalPages > 1 ? `<span class="tag muted-tag">${pg.curPage} / ${pg.totalPages}</span>` : ''}
            </div>
          </div>

          <div class="rq-toolbar">
            <div class="filter-chips" role="tablist" aria-label="Filter queue by type">
              <button type="button" class="filter-chip ${filterKind === '' ? 'active' : ''}" data-rq-chip="">
                <span>All</span><span class="chip-count">${counts.all}</span>
              </button>
              <button type="button" class="filter-chip ${filterKind === 'daily' ? 'active' : ''}" data-rq-chip="daily">
                <span>Daily</span><span class="chip-count">${counts.daily}</span>
              </button>
              <button type="button" class="filter-chip ${filterKind === 'meeting' ? 'active' : ''}" data-rq-chip="meeting">
                <span>Meetings</span><span class="chip-count">${counts.meeting}</span>
              </button>
              <button type="button" class="filter-chip ${filterKind === 'feedback' ? 'active' : ''}" data-rq-chip="feedback">
                <span>Ideas &amp; problems</span><span class="chip-count">${counts.feedback}</span>
              </button>
            </div>
            <div class="rq-who-wrap">
              <select class="input" id="rq-who" style="min-height:38px" aria-label="Filter by member">
                <option value="">All members</option>
                ${people.map(p => `<option value="${p.id}" ${filterWho === p.id ? 'selected' : ''}>${esc(nameOf(p))}</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="rq-list">
          ${pg.items.length ? `
            <div class="ds-list">
              ${pg.items.map(it => {
                const whoName = nameOf(it.who);
                const initials = window.DS.getInitials(whoName);
                const isUrgent = !!(it.late || it.missed);
                return `
                  <div class="ds-list-card rq-card ${isUrgent ? 'is-urgent' : ''}" data-kind="${it.kind}" data-who="${it.who?.id || ''}">
                    <div class="ds-list-main">
                      <div class="ds-list-avatar" title="${esc(whoName)}">${esc(initials)}</div>
                      <div class="ds-list-content">
                        <div class="ds-list-title-row">
                          <span class="ds-list-title">${esc(it.title)}</span>
                          <span class="tag ${it.kind === 'daily' ? 'brand' : 'muted-tag'}">${esc(it.kindLabel)}</span>
                          ${it.late ? `<span class="tag alert">Late by ${lateBy(it.lateMin)}</span>` : ''}
                          ${it.missed ? '<span class="tag alert">Missed</span>' : ''}
                        </div>
                        <div class="ds-list-sub">
                          <span><b>${esc(whoName)}</b></span>
                          <span>·</span>
                          <span>Submitted ${fmtDT(it.ts)}</span>
                        </div>
                        ${it.sub ? `<div class="ds-list-snippet">${esc(it.sub)}</div>` : ''}
                      </div>
                    </div>
                    <div class="ds-list-actions">
                      <button type="button" class="btn accent sm" data-open="${it.kind}:${it.id}">Open &amp; score</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : emptyState(
            hasFilter ? 'No matching items' : 'Nothing to review',
            hasFilter ? 'Try switching the type filter or choosing another team member.' : 'Every submission has been handled. New reports land here automatically.',
            hasFilter ? '<button type="button" class="btn sm" id="rq-clear-filters">Clear filters</button>' : ''
          )}
          </div>
          ${pg.renderBar('review')}
        </div>`;

      $$('[data-rq-chip]', v).forEach(chip => chip.addEventListener('click', () => {
        filterKind = chip.dataset.rqChip || '';
        reviewPage = 1;
        renderReviewView();
      }));
      $('#rq-who')?.addEventListener('change', (e) => {
        filterWho = e.target.value;
        reviewPage = 1;
        renderReviewView();
      });
      $('#rq-clear-filters')?.addEventListener('click', () => {
        filterKind = '';
        filterWho = '';
        reviewPage = 1;
        renderReviewView();
      });
      $$('[data-open]', v).forEach(b => b.addEventListener('click', () => {
        const [kind, id] = b.dataset.open.split(':');
        openReview(kind, id);
      }));

      window.DS.bindPagination(v, (p) => {
        reviewPage = p;
        renderReviewView();
      });
    }

    renderReviewView();
  };

  /* ── REVIEW & SCORE modal ── */
  // Open the shared review shell in the modal and attach its listeners.
  function openShell(spec) {
    const { html, bind } = reviewShell(spec);
    window.DS.modal.open(html);
    setTimeout(bind, 0);
  }

  async function openReview(kind, id) {
    const people = await loadPeople();
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const { esc: E } = window.DS;

    if (kind === 'daily') {
      const { data: r } = await sb.from('daily_reports').select('*').eq('id', id).single();
      if (!r) return toast('Report not found.', true);
      const who = pmap[r.user_id];
      const mine = r.user_id === S.user.id;
      openShell({
        title: 'Daily report — ' + fmtD(r.report_date),
        meta: `${E(nameOf(who))} · submitted ${fmtDT(r.submitted_at)}`,
        lateFlag: r.is_late ? `Late by ${lateBy(r.late_minutes)}` : '',
        missed: r.missed_report,
        body: `
          <dl class="kv">
            <dt>What I did yesterday</dt><dd>${E(r.did_yesterday || '—')}</dd>
            <dt>What I will do today</dt><dd>${E(r.doing_today || '—')}</dd>
            <dt>Blockers</dt><dd>${r.blockers ? E(r.blockers) : '<span class="muted">None</span>'}</dd>
            <dt>Evidence</dt><dd>${r.evidence_url ? `<a href="${E(r.evidence_url)}" target="_blank" rel="noopener">Open link</a>` : '<span class="muted">None</span>'}</dd>
            <dt>Submission time</dt><dd>${fmtDT(r.submitted_at)}</dd>
          </dl>`,
        score: r.score, note: r.review_note || '',
        disabled: mine || r.status === 'Approved',
        disabledNote: mine ? 'You cannot score your own submission.' : '',
        saveLabel: 'Approve and save score',
        onSave: async (score, note) => {
          const { error } = await sb.from('daily_reports').update({
            status: 'Approved', score, review_note: note || null,
            reviewed_by: S.user.id, reviewed_at: new Date().toISOString(),
            edited_by_admin: r.missed_report ? true : r.edited_by_admin,
          }).eq('id', id);
          if (error) return toast(error.message, true);
          await audit('daily_report_approve', 'daily_reports:' + id, r.score, score);
          await notifyUser(r.user_id, 'score', 'Daily report approved', `Score ${score}/100 for ${fmtD(r.report_date)}.`, 'scores');
          toast('Approved and scored.');
          window.DS.modal.close(); window.DS.navigate('review');
        },
        onReject: async (note) => {
          const { error } = await sb.from('daily_reports').update({
            status: 'Rejected', review_note: note || 'Please resubmit.',
            reviewed_by: S.user.id, reviewed_at: new Date().toISOString(),
          }).eq('id', id);
          if (error) return toast(error.message, true);
          await audit('daily_report_reject', 'daily_reports:' + id, null, note);
          await notifyUser(r.user_id, 'report_rejected', 'Daily report needs resubmission', note || 'Please resubmit your daily report.', 'report');
          toast('Rejected — member asked to resubmit.', true);
          window.DS.modal.close(); window.DS.navigate('review');
        },
        onDelete: async () => {
          const { error } = await sb.from('daily_reports').delete().eq('id', id);
          if (error) return toast(error.message, true);
          await audit('daily_report_delete', 'daily_reports:' + id);
          await notifyUser(r.user_id, 'report_deleted', 'Daily report removed by admin', `Your daily report for ${fmtD(r.report_date)} was removed by an administrator.`, 'report');
          toast('✓ Report deleted');
          window.DS.modal.close(); window.DS.navigate('review');
        },
      });
      return;
    }

    if (kind === 'feedback') {
      const { data: f } = await sb.from('weekly_feedback').select('*').eq('id', id).single();
      if (!f) return toast('Submission not found.', true);
      const who = pmap[f.user_id];
      openShell({
        title: (f.type === 'idea' ? 'Idea' : 'Problem') + (f.title ? ' — ' + f.title : ''),
        meta: `${E(nameOf(who))} · ${f.section || 'No section'} · submitted ${fmtDT(f.created_at)}`,
        body: `
          <dl class="kv">
            <dt>Section</dt><dd>${E(f.section || '—')}</dd>
            <dt>Description</dt><dd>${E(f.content || '—')}</dd>
            ${f.severity ? `<dt>Severity</dt><dd>${E(f.severity)}</dd>` : ''}
            <dt>Submitted</dt><dd>${fmtDT(f.created_at)}</dd>
          </dl>
          <div class="field" style="margin-top:16px"><label class="label" for="rv-fb-status">Decision</label>
            <select class="input" id="rv-fb-status">${FB_STATUS.map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`,
        score: f.score, note: f.admin_note || '',
        extra: 'feedback',
        saveLabel: 'Save decision',
        onSave: async (score, note) => {
          const st = $('#rv-fb-status').value;
          const { error } = await sb.from('weekly_feedback').update({
            status: st, admin_note: note || null, score: score == null ? null : score,
            reviewed_by: S.user.id, reviewed_at: new Date().toISOString(),
          }).eq('id', id);
          if (error) return toast(error.message, true);
          await audit('weekly_feedback_review', 'weekly_feedback:' + id, f.status, st);
          await notifyUser(f.user_id, 'feedback_status', `${f.type === 'idea' ? 'Idea' : 'Problem'} ${st.toLowerCase()}`, note || null, 'ideas');
          toast('Decision saved.');
          window.DS.modal.close(); window.DS.navigate('review');
        },
        onReject: async (note) => {
          const { error } = await sb.from('weekly_feedback').update({
            status: 'Rejected', admin_note: note || 'Rejected.', reviewed_by: S.user.id, reviewed_at: new Date().toISOString(),
          }).eq('id', id);
          if (error) return toast(error.message, true);
          await audit('weekly_feedback_reject', 'weekly_feedback:' + id, f.status, 'Rejected');
          await notifyUser(f.user_id, 'feedback_status', 'Idea rejected', note || null, 'ideas');
          toast('Rejected.', true);
          window.DS.modal.close(); window.DS.navigate('review');
        },
      });
      return;
    }

    if (kind === 'meeting') {
      const { data: a } = await sb.from('meeting_attendance').select('*').eq('id', id).single();
      if (!a) return toast('Report not found.', true);
      const { data: m } = await sb.from('meetings').select('*').eq('id', a.meeting_id).maybeSingle();
      const who = pmap[a.user_id];
      openShell({
        title: 'Meeting report — ' + (m?.title || 'Meeting'),
        meta: `${E(nameOf(who))} · attended ${a.attended ? 'yes' : 'no'}`,
        body: `<dl class="kv">
            <dt>Attended</dt><dd>${a.attended ? 'Yes' : 'No'}</dd>
            <dt>Contribution &amp; feedback</dt><dd>${E(a.note || '—')}</dd>
            <dt>Meeting date</dt><dd>${fmtDT(window.DS.meeting(m)?.starts_at || m?.meeting_date)}</dd>
          </dl>`,
        score: a.score ?? null, note: a.review_note || '',
        saveLabel: 'Approve and save score',
        onSave: async (score, note) => {
          const { error } = await sb.from('meeting_attendance').update({
            scored: true, score, review_note: note || null, reviewed_by: S.user.id, reviewed_at: new Date().toISOString(),
          }).eq('id', id);
          if (error) return toast(error.message, true);
          await audit('meeting_report_approve', 'meeting_attendance:' + id, null, score);
          await notifyUser(a.user_id, 'score', 'Meeting report approved', `Score ${score}/100.`, 'scores');
          toast('Approved and scored.');
          window.DS.modal.close(); window.DS.navigate('review');
        },
        onReject: async (note) => {
          const { error } = await sb.from('meeting_attendance').update({
            scored: true, review_note: note || 'Please resubmit.', reviewed_by: S.user.id, reviewed_at: new Date().toISOString(),
          }).eq('id', id);
          if (error) return toast(error.message, true);
          await audit('meeting_report_reject', 'meeting_attendance:' + id, null, note);
          await notifyUser(a.user_id, 'report_rejected', 'Meeting report needs resubmission', note || null, 'meetings');
          toast('Rejected.', true);
          window.DS.modal.close(); window.DS.navigate('review');
        },
      });
    }
  }

  // Shared review shell: score field starts EMPTY, approve / reject.
  // Returns { html, bind } so the caller can inject the markup and then attach
  // the listeners (the markup must be in the DOM before we can query it).
  function reviewShell(o) {
    const { esc: E } = window.DS;
    const html = `
      <div class="modal-head">
        <div style="min-width:0;flex:1">
          <h2 style="margin:0 0 4px;font-size:18px;line-height:1.25">${E(o.title)}</h2>
          <p class="muted small" style="margin:0">${o.meta || ''}</p>
        </div>
        <button type="button" class="btn sm ghost" id="rv-close" aria-label="Close review modal" style="padding:4px 8px;font-size:16px;line-height:1;flex-shrink:0">✕</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${o.lateFlag ? `<span class="tag alert">Late by ${E(o.lateFlag)}</span>` : ''}
        ${o.missed ? '<span class="tag alert">Missed report — recorded 0</span>' : ''}
        ${o.score != null ? `<span class="tag ok">Scored ${o.score}/100</span>` : '<span class="tag muted-tag">Not scored yet</span>'}
      </div>
      <div class="card" style="padding:14px;margin-bottom:16px;background:var(--bg)">${o.body}</div>
      ${o.disabled ? `<div class="error-box" style="margin-bottom:14px">${E(o.disabledNote || 'This item cannot be scored.')}</div>` : `
      <div class="field">
        <label class="label" for="rv-score">Score (0–100)</label>
        <input class="input" id="rv-score" type="number" min="0" max="100" step="1" inputmode="numeric"
               placeholder="Enter a score" ${o.disabled ? 'disabled' : ''}>
        <div class="form-error" id="rv-score-err" role="alert" aria-live="polite"></div>
      </div>
      <div class="field">
        <label class="label" for="rv-note">Note ${o.extra === 'feedback' ? '(reason if rejected)' : '(optional)'}</label>
        <textarea class="input" id="rv-note" placeholder="What stood out, or what needs another pass.">${E(o.note || '')}</textarea>
      </div>
      <div class="review-actions">
        <button class="btn accent" id="rv-save" type="button">${E(o.saveLabel || 'Approve and save score')}</button>
        <button class="btn alert" id="rv-reject" type="button">Reject and ask to resubmit</button>
      </div>
      ${o.onDelete ? `<button class="btn ghost alert sm" style="width:100%;margin-top:12px" id="rv-del" type="button">Delete submission permanently</button>` : ''}
      <p class="tiny muted" style="margin-top:12px">The system never suggests a score — you decide. Late submissions are shown with their exact time and are not penalised automatically.</p>`}`;

    // wiring, called by the caller once the markup is in the DOM
    const bind = () => {
      $('#rv-close')?.addEventListener('click', window.DS.modal.close);
      const save = $('#rv-save'), rej = $('#rv-reject'), sc = $('#rv-score'), nt = $('#rv-note'), del = $('#rv-del');
      if (!save) return;
      save.addEventListener('click', async () => {
        const err = $('#rv-score-err');
        err.classList.remove('show');
        const raw = (sc.value || '').trim();
        if (raw === '') { err.textContent = 'Enter a score between 0 and 100.'; err.classList.add('show'); sc.focus(); return; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 100) { err.textContent = 'Score must be between 0 and 100.'; err.classList.add('show'); sc.focus(); return; }
        save.disabled = true;
        try { await o.onSave(Math.round(n), (nt.value || '').trim()); }
        catch (e) { err.textContent = e.message || 'Could not save.'; err.classList.add('show'); save.disabled = false; }
      });
      rej?.addEventListener('click', async () => {
        const note = (nt?.value || '').trim();
        if (!note) { nt.focus(); toast('Add a short reason so the member knows what to fix.', true); return; }
        rej.disabled = true;
        try { await o.onReject(note); } catch (e) { toast(e.message || 'Could not reject.', true); rej.disabled = false; }
      });
      del?.addEventListener('click', async () => {
        const ok = await window.DS.confirmModal({
          title: 'Delete submission',
          message: 'Are you sure you want to permanently delete this submission? This cannot be undone.',
          confirmLabel: 'Delete permanently',
          isAlert: true,
        });
        if (!ok) return;
        del.disabled = true;
        try { await o.onDelete(); }
        catch (e) { toast(e.message || 'Could not delete.', true); del.disabled = false; }
      });
    };
    return { html, bind };
  }

  /* ============================================================
     USERS
     ============================================================ */
  window.DS.registerRoute('users', {
    title: 'Users', sub: 'Create accounts, set temporary passwords, promote to admin',
    render: async (v) => { await window.renderUsersAdmin(v); },
  });

  window.renderUsersAdmin = async function (v) {
    const [people, unitsRes, umRes, posRes] = await Promise.all([
      loadPeople(),
      sb.from('units').select('id,name'),
      sb.from('unit_members').select('*'),
      loadPositions(),
    ]);
    const units = unitsRes.data || [];
    const um = umRes.data || [];
    const unitMap = Object.fromEntries(units.map(u => [u.id, u.name]));
    const posMap = Object.fromEntries((posRes || []).map(p => [p.id, p.title]));
    let userPage = 1;
    let userQuery = '';
    let userFilter = '';

    v.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Invite / create a user</h3>
            <p class="small muted" style="margin-top:2px">Provision a team account with a temporary password and optional unit placement</p>
          </div>
        </div>
        <form id="nu-form" novalidate>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="nu-name">Full name</label><input class="input" id="nu-name" required placeholder="e.g. Alex Johnson"></div>
            <div class="field"><label class="label" for="nu-email">Work email</label><input class="input" id="nu-email" type="email" required placeholder="alex@company.com"></div>
            <div class="field">
              <div class="pw-label-row">
                <label class="label" for="nu-pass" style="margin-bottom:0">Temporary password</label>
                <div class="pw-label-actions">
                  <button type="button" class="btn ghost sm" id="nu-gen-pw" style="min-height:auto;padding:2px 8px;font-size:11px;color:var(--brand-ink)">Generate</button>
                  <button type="button" class="btn ghost sm" id="nu-toggle-pw" style="min-height:auto;padding:2px 8px;font-size:11px">Hide</button>
                </div>
              </div>
              <input class="input" id="nu-pass" type="text" required minlength="6" placeholder="At least 6 characters">
            </div>
            <div class="field"><label class="label" for="nu-role">Access level</label><select class="input" id="nu-role"><option>Member</option><option>Admin</option></select></div>
            <div class="field"><label class="label" for="nu-unit">Assign to unit</label><select class="input" id="nu-unit"><option value="">None yet</option>${units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="nu-position">Role in unit</label><input class="input" id="nu-position" placeholder="e.g. Lead, Analyst"></div>
          </div>
          <div class="error-box hidden" id="nu-error" style="margin-bottom:14px" role="alert" aria-live="polite"></div>
          <button class="btn accent" id="nu-submit-btn" type="submit">Create &amp; invite user</button>
          <p class="tiny muted" style="margin-top:10px">The user signs in with the temporary password and must set a new one before accessing the workspace.</p>
        </form>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Team members</h3>
            <p class="small muted" id="users-count-sub" style="margin-top:2px">${people.length} user${people.length === 1 ? '' : 's'} registered in system</p>
          </div>
          <span class="tag muted-tag" id="users-pg-tag">1 / 1</span>
        </div>
        <div class="rq-toolbar">
          <div class="filter-chips" role="tablist" aria-label="Filter team members">
            <button type="button" class="filter-chip active" data-uf-chip=""><span>All</span><span class="chip-count">${people.length}</span></button>
            <button type="button" class="filter-chip" data-uf-chip="Admin"><span>Admins</span><span class="chip-count">${people.filter(p => p.access_level === 'Admin').length}</span></button>
            <button type="button" class="filter-chip" data-uf-chip="Member"><span>Members</span><span class="chip-count">${people.filter(p => p.access_level !== 'Admin' && p.active !== false).length}</span></button>
            <button type="button" class="filter-chip" data-uf-chip="inactive"><span>Deactivated</span><span class="chip-count">${people.filter(p => p.active === false).length}</span></button>
          </div>
          <div class="rq-who-wrap">
            <input type="search" class="input" id="u-q" placeholder="Search name or email…" style="min-height:38px" aria-label="Search users">
          </div>
        </div>
        <div id="users-list-body"></div>
      </div>
    `;

    const resetUserPassword = async (userId) => {
      const person = people.find(x => x.id === userId);
      const pw = await window.DS.promptModal({
        title: 'Reset temporary password',
        subtitle: person ? `User: ${nameOf(person)}` : '',
        label: 'New temporary password',
        placeholder: 'At least 6 characters',
        type: 'password',
        minLength: 6,
        confirmLabel: 'Reset password',
      });
      if (!pw) return;
      const { error } = await sb.auth.admin.setUserPassword
        ? await sb.auth.admin.setUserPassword(userId, pw)
        : await sb.auth.admin.updateUserById(userId, { password: pw });
      if (error) return toast(error.message, true);
      await sb.from('profiles').update({ must_change_password: true }).eq('id', userId);
      await audit('user_password_reset', 'profiles:' + userId);
      toast(`✓ Password reset: ${pw}`);
    };

    const promoteUser = async (userId) => {
      const { error } = await sb.from('profiles').update({ access_level: 'Admin' }).eq('id', userId);
      if (error) return toast(error.message, true);
      await audit('user_promoted', 'profiles:' + userId, 'Member', 'Admin');
      toast('✓ Promoted to admin.');
      window.DS.navigate('users');
    };

    const demoteUser = async (userId) => {
      const { error } = await sb.from('profiles').update({ access_level: 'Member' }).eq('id', userId);
      if (error) return toast(error.message, true);
      await audit('user_demoted', 'profiles:' + userId, 'Admin', 'Member');
      toast('Changed to member.', true);
      window.DS.navigate('users');
    };

    const toggleUserActive = async (userId, isActive) => {
      const { error } = await sb.from('profiles').update({ active: !isActive }).eq('id', userId);
      if (error) return toast(error.message, true);
      await audit(isActive ? 'user_deactivated' : 'user_reactivated', 'profiles:' + userId);
      toast(isActive ? '✓ Account deactivated.' : '✓ Account reactivated.');
      window.DS.navigate('users');
    };

    const openUserModal = (userId) => {
      const p = people.find(x => x.id === userId);
      if (!p) return;
      const myUnits = um.filter(u => u.user_id === p.id).map(u => {
        const un = unitMap[u.unit_id];
        const pos = posMap[u.position_id];
        return un ? (pos ? `${un} (${pos})` : un) : null;
      }).filter(Boolean);
      const actions = [
        { label: 'Reset password', onClick: () => resetUserPassword(p.id) },
        p.access_level === 'Admin'
          ? (p.id === S.user.id ? null : { label: 'Make member', onClick: () => demoteUser(p.id) })
          : { label: 'Make admin', onClick: () => promoteUser(p.id) },
        p.id === S.user.id ? null : {
          label: p.active === false ? 'Reactivate' : 'Deactivate',
          className: p.active === false ? '' : 'alert',
          onClick: () => toggleUserActive(p.id, p.active !== false),
        }
      ];
      window.DS.showDetailsModal({
        title: nameOf(p),
        subtitle: p.email || 'No email registered',
        badgeHtml: p.access_level === 'Admin' ? '<span class="tag">Admin</span>' : '<span class="tag muted-tag">Member</span>',
        rows: [
          { label: 'Full name', value: nameOf(p) },
          { label: 'Work email', value: p.email || '—' },
          { label: 'Phone', value: p.phone || '—' },
          { label: 'Access level', value: p.access_level || 'Member' },
          { label: 'Assigned units', value: myUnits.length ? myUnits.join(', ') : 'None assigned yet' },
          { label: 'Account status', isHtml: true, value: p.active === false ? '<span class="tag alert">Deactivated</span>' : '<span class="tag ok">Active</span>' },
          { label: 'Password status', value: p.must_change_password ? 'Temporary password (must change upon login)' : 'Password configured' },
          { label: 'User ID', value: p.id }
        ],
        actions
      });
    };

    function renderUsersList() {
      const filtered = people.filter(p => {
        const hay = `${p.full_name || ''} ${p.email || ''}`.toLowerCase();
        const matchQ = !userQuery || hay.includes(userQuery);
        const matchF = !userFilter
          || (userFilter === 'Admin' && p.access_level === 'Admin')
          || (userFilter === 'Member' && p.access_level !== 'Admin' && p.active !== false)
          || (userFilter === 'inactive' && p.active === false);
        return matchQ && matchF;
      });
      const pg = window.DS.paginate(filtered, userPage, 25);
      const sub = $('#users-count-sub', v);
      if (sub) sub.textContent = (userQuery || userFilter)
        ? `${filtered.length} matching user${filtered.length === 1 ? '' : 's'}`
        : `${people.length} user${people.length === 1 ? '' : 's'} registered in system`;
      const pgTag = $('#users-pg-tag', v);
      if (pgTag) pgTag.textContent = `${pg.curPage} / ${pg.totalPages}`;

      const body = $('#users-list-body', v);
      if (!body) return;
      body.innerHTML = pg.items.length ? `
        <div class="ds-list">
          ${pg.items.map(p => {
            const myUnits = um.filter(u => u.user_id === p.id).map(u => unitMap[u.unit_id]).filter(Boolean);
            const initials = window.DS.getInitials(nameOf(p));
            const actions = [
              { label: 'View user details', icon: '👤', attrs: `data-view-user="${p.id}"` },
              { divider: true },
              { label: 'Reset password', icon: '🔑', attrs: `data-pw="${p.id}"` },
              p.access_level === 'Admin'
                ? { label: 'Make member', icon: '👤', attrs: `data-demote="${p.id}"`, disabled: p.id === S.user.id }
                : { label: 'Make admin', icon: '⭐', attrs: `data-promote="${p.id}"` },
              { divider: true },
              {
                label: p.active === false ? 'Reactivate account' : 'Deactivate account',
                icon: p.active === false ? '✓' : '🚫',
                isAlert: p.active !== false,
                attrs: `data-tog="${p.id}" data-active="${p.active === false ? '0' : '1'}"`,
                disabled: p.id === S.user.id
              }
            ];
            return `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-avatar">${esc(initials)}</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(nameOf(p))}</span>
                      <span class="tag ${p.access_level === 'Admin' ? 'brand' : 'muted-tag'}">${p.access_level}</span>
                      ${p.active === false ? '<span class="tag alert">Deactivated</span>' : '<span class="tag ok">Active</span>'}
                      ${myUnits.length ? `<span class="tag muted-tag">🏢 ${esc(myUnits.join(', '))}</span>` : ''}
                    </div>
                    <div class="ds-list-sub">
                      <span>📧 ${esc(p.email || 'No email registered')}</span>
                      ${p.must_change_password ? '<span>·</span><span class="tag muted-tag">Temp password</span>' : ''}
                    </div>
                  </div>
                </div>
                <div class="ds-list-actions">
                  <button type="button" class="btn sm" data-view-user="${p.id}">View</button>
                  ${window.DS.renderActionMenu(actions)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${pg.renderBar('users')}
      ` : emptyState(
        (userQuery || userFilter) ? 'No matching users' : 'No users yet',
        (userQuery || userFilter) ? 'Try clearing the search query or filter chip.' : 'Create the first account with the form above.'
      );

      $$('[data-view-user]', body).forEach(b => b.addEventListener('click', () => openUserModal(b.dataset.viewUser)));
      $$('[data-pw]', body).forEach(b => b.addEventListener('click', () => resetUserPassword(b.dataset.pw)));
      $$('[data-promote]', body).forEach(b => b.addEventListener('click', () => promoteUser(b.dataset.promote)));
      $$('[data-demote]', body).forEach(b => b.addEventListener('click', () => demoteUser(b.dataset.demote)));
      $$('[data-tog]', body).forEach(b => b.addEventListener('click', () => toggleUserActive(b.dataset.tog, b.dataset.active === '1')));
      window.DS.initActionMenus(body);
      window.DS.bindPagination(body, (newPage) => { userPage = newPage; renderUsersList(); });
    }

    // Bind top form + filter controls once
    $('#nu-gen-pw')?.addEventListener('click', () => {
      const inp = $('#nu-pass');
      if (inp) {
        inp.value = window.DS.generateTempPassword();
        inp.type = 'text';
        const tog = $('#nu-toggle-pw');
        if (tog) tog.textContent = 'Hide';
      }
    });
    $('#nu-toggle-pw')?.addEventListener('click', () => {
      const inp = $('#nu-pass');
      const tog = $('#nu-toggle-pw');
      if (!inp) return;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      if (tog) tog.textContent = show ? 'Hide' : 'Show';
    });

    $$('[data-uf-chip]', v).forEach(chip => chip.addEventListener('click', () => {
      userFilter = chip.dataset.ufChip || '';
      userPage = 1;
      $$('[data-uf-chip]', v).forEach(c => c.classList.toggle('active', c === chip));
      renderUsersList();
    }));
    $('#u-q')?.addEventListener('input', (e) => {
      userQuery = e.target.value.toLowerCase().trim();
      userPage = 1;
      renderUsersList();
    });

    $('#nu-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#nu-error');
      const submitBtn = $('#nu-submit-btn');
      err.classList.add('hidden'); err.classList.remove('show');
      const email = $('#nu-email').value.trim();
      const password = $('#nu-pass').value;
      const full_name = $('#nu-name').value.trim();
      const access_level = $('#nu-role').value;
      if (!full_name || !email || !password) { err.textContent = 'Name, email and temporary password are all required.'; err.classList.remove('hidden'); err.classList.add('show'); return; }
      if (password.length < 6) { err.textContent = 'Temporary password must be at least 6 characters.'; err.classList.remove('hidden'); err.classList.add('show'); return; }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account…'; }
      const res = await fetch('https://xzrczuoxlujzmztkupbz.supabase.co/functions/v1/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (S.session?.access_token || '') },
        body: JSON.stringify({
          email, password, full_name,
          role: access_level, access_level,
          unit_id: $('#nu-unit').value || null,
          position_title: ($('#nu-position').value || '').trim() || null,
        }),
      });
      let body = {};
      try { body = await res.json(); } catch (errJson) { /* non-JSON */ }
      if (!res.ok) {
        err.textContent = body.error || 'Could not create the account.';
        err.classList.remove('hidden'); err.classList.add('show');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create & invite user'; }
        return;
      }
      const newId = body.user?.id;
      if (newId) {
        await sb.from('profiles').update({ access_level, must_change_password: true, active: true }).eq('id', newId);
        await audit('user_created', 'profiles:' + newId, null, email);
      }

      const inviteMsg = `Welcome to Nodaar Team Hub!\nSign in URL: ${window.location.origin}\nEmail: ${email}\nTemporary password: ${password}\n(You will be prompted to choose a new password on first login.)`;
      window.DS.modal.open(`
        <div class="modal-head">
          <div>
            <h2 style="margin:0 0 4px">User account ready</h2>
            <p class="muted small" style="margin:0">Share these temporary credentials with ${esc(full_name)}.</p>
          </div>
          <button type="button" class="btn sm ghost" id="inv-done-x" aria-label="Close" style="padding:4px 8px">✕</button>
        </div>
        <dl class="kv" style="margin-bottom:16px">
          <dt>Name</dt><dd>${esc(full_name)}</dd>
          <dt>Email</dt><dd>${esc(email)}</dd>
          <dt>Access level</dt><dd><span class="tag brand">${esc(access_level)}</span></dd>
          <dt>Temp password</dt><dd><code style="font-size:14px;font-weight:800;background:var(--brand-50);color:var(--brand-ink);padding:3px 8px;border-radius:6px;border:1px solid var(--brand-200)">${esc(password)}</code></dd>
        </dl>
        <div class="modal-actions">
          <button type="button" class="btn accent" id="inv-copy-btn">Copy invite credentials</button>
          <button type="button" class="btn" id="inv-done-btn">Done</button>
        </div>
      `);
      const closeAndReload = () => { window.DS.modal.close(); window.DS.navigate('users'); };
      $('#inv-done-x')?.addEventListener('click', closeAndReload);
      $('#inv-done-btn')?.addEventListener('click', closeAndReload);
      $('#inv-copy-btn')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(inviteMsg);
          toast('✓ Invite credentials copied to clipboard.');
        } catch {
          toast('Copy the temporary password above before closing.');
        }
      });
    });

    renderUsersList();
  };

  /* ============================================================
     UNITS & ROLES
     ============================================================ */
  window.renderUnitsAdmin = async function (v) {
    const [units, people, positions, um] = await Promise.all([
      loadUnits(), loadPeople(), loadPositions(),
      sb.from('unit_members').select('*').then(r => r.data || []),
    ]);
    const activePeople = people.filter(p => p.active !== false);
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const posMap = Object.fromEntries(positions.map(p => [p.id, p.title]));

    v.innerHTML = `
      <div class="stat-grid">
        <div class="stat accent"><div class="num">${units.length}</div><div class="cap">Units</div></div>
        <div class="stat"><div class="num">${um.length}</div><div class="cap">Unit placements</div></div>
        <div class="stat"><div class="num">${positions.length}</div><div class="cap">Defined roles</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Create a unit</h3></div>
        <form id="nu2-form" novalidate>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="un-name">Unit name</label><input class="input" id="un-name" required placeholder="Operations"></div>
            <div class="field"><label class="label" for="un-lead">Unit lead</label><select class="input" id="un-lead"><option value="">No lead yet</option>${activePeople.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label class="label" for="un-desc">Description</label><input class="input" id="un-desc" placeholder="What this unit owns"></div>
          <div class="error-box hidden" id="nu2-error" style="margin-bottom:14px"></div>
          <button class="btn primary" id="nu2-submit" type="submit">Create unit</button>
        </form>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Units &amp; rosters</h3>
            <p class="small muted" style="margin-top:2px">Manage unit leads, invite members, and assign role titles</p>
          </div>
          <span class="tag muted-tag">${units.length} unit${units.length === 1 ? '' : 's'}</span>
        </div>
        ${units.length ? units.map(u => {
          const members = um.filter(m => m.unit_id === u.id);
          const lead = u.lead_id ? pmap[u.lead_id] : null;
          return `
            <div class="unit-card">
              <div class="unit-card-head">
                <div class="ds-list-main">
                  <div class="ds-list-icon">🏢</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(u.name)}</span>
                      <span class="tag muted-tag">${members.length} member${members.length === 1 ? '' : 's'}</span>
                      ${lead ? `<span class="tag brand">Lead: ${esc(nameOf(lead))}</span>` : ''}
                    </div>
                    ${u.description ? `<div class="ds-list-sub">${esc(u.description)}</div>` : ''}
                  </div>
                </div>
                <div class="unit-head-actions" style="display:flex;gap:6px;flex-wrap:wrap">
                  <button type="button" class="btn accent sm" data-addm="${u.id}">+ Add members</button>
                  <button type="button" class="btn sm" data-editunit="${u.id}">Edit</button>
                  <button type="button" class="btn sm ghost alert" data-delunit="${u.id}">Delete</button>
                </div>
              </div>
              <div class="unit-card-body">
                ${members.length ? members.map(m => {
                  const person = pmap[m.user_id];
                  const mName = nameOf(person);
                  const roleTitle = posMap[m.position_id] || 'Member';
                  return `
                    <div class="unit-member-row">
                      <div class="ds-list-main" style="gap:10px">
                        <div class="picker-mini-avatar">${esc(window.DS.getInitials(mName))}</div>
                        <div class="ds-list-content">
                          <div class="ds-list-title-row">
                            <span class="ds-list-title" style="font-size:13.5px">${esc(mName)}</span>
                            <span class="tag muted-tag">${esc(roleTitle)}</span>
                          </div>
                          ${person?.email ? `<div class="ds-list-sub" style="margin-top:1px">${esc(person.email)}</div>` : ''}
                        </div>
                      </div>
                      <div style="display:flex;gap:6px;flex-shrink:0">
                        <button type="button" class="btn sm ghost" data-chrole="${m.id}" data-curpos="${m.position_id || ''}" data-who="${esc(mName)}">Role</button>
                        <button type="button" class="btn sm ghost alert" data-rmm="${m.id}" data-who="${esc(mName)}" aria-label="Remove ${esc(mName)} from unit">Remove</button>
                      </div>
                    </div>
                  `;
                }).join('') : '<div class="small muted" style="padding:4px 0">No members in this unit yet.</div>'}
              </div>
            </div>
          `;
        }).join('') : emptyState('No units yet', 'Create one above — a member can belong to several units.', '<button class="btn primary sm" data-focus="un-name">Create the first unit</button>')}
      </div>`;

    $('#nu2-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#nu2-error');
      const btn = $('#nu2-submit');
      err.classList.add('hidden'); err.classList.remove('show');
      const name = $('#un-name').value.trim();
      if (!name) { err.textContent = 'Unit name is required.'; err.classList.remove('hidden'); err.classList.add('show'); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
      const { error } = await sb.from('units').insert({ name, description: $('#un-desc').value.trim() || null, lead_id: $('#un-lead').value || null });
      if (error) {
        err.textContent = error.message; err.classList.remove('hidden'); err.classList.add('show');
        if (btn) { btn.disabled = false; btn.textContent = 'Create unit'; }
        return;
      }
      await audit('unit_created', 'units:' + name);
      toast('✓ Unit created.');
      window.DS.navigate('units');
    });

    $$('[data-addm]', v).forEach(b => b.addEventListener('click', () => {
      const unitObj = units.find(u => u.id === b.dataset.addm);
      addMemberModal(b.dataset.addm, unitObj?.name || 'Unit', activePeople, positions, um);
    }));
    $$('[data-editunit]', v).forEach(b => b.addEventListener('click', () => {
      const unitObj = units.find(u => u.id === b.dataset.editunit);
      if (unitObj) editUnitModal(unitObj, activePeople);
    }));
    $$('[data-chrole]', v).forEach(b => b.addEventListener('click', () => {
      changeMemberRoleModal(b.dataset.chrole, b.dataset.who, b.dataset.curpos, positions);
    }));
    $$('[data-rmm]', v).forEach(b => b.addEventListener('click', async () => {
      const ok = await window.DS.confirmModal({
        title: 'Remove from unit',
        message: `Remove ${b.dataset.who || 'this member'} from the unit?`,
        confirmLabel: 'Remove member',
        isAlert: true,
      });
      if (!ok) return;
      await sb.from('unit_members').delete().eq('id', b.dataset.rmm);
      await audit('unit_member_removed', 'unit_members:' + b.dataset.rmm);
      toast('Member removed from unit.');
      window.DS.navigate('units');
    }));
    $$('[data-delunit]', v).forEach(b => b.addEventListener('click', async () => {
      const ok = await window.DS.confirmModal({
        title: 'Delete unit',
        message: 'Delete this unit? Its member assignments and linked OKRs will be removed as well.',
        confirmLabel: 'Delete unit',
        isAlert: true,
      });
      if (!ok) return;
      await sb.from('units').delete().eq('id', b.dataset.delunit);
      await audit('unit_deleted', 'units:' + b.dataset.delunit);
      toast('Unit deleted.', true);
      window.DS.navigate('units');
    }));
    $('[data-focus]')?.addEventListener('click', () => $('#un-name')?.focus());
  };

  function editUnitModal(unit, people) {
    window.DS.modal.open(`
      <div class="modal-head">
        <div>
          <h2 style="margin:0 0 4px">Edit unit</h2>
          <p class="muted small" style="margin:0">${esc(unit.name)}</p>
        </div>
        <button type="button" class="btn sm ghost" id="eu-close" aria-label="Close" style="padding:4px 8px">✕</button>
      </div>
      <form id="eu-form" novalidate>
        <div class="field"><label class="label" for="eu-name">Unit name</label><input class="input" id="eu-name" required value="${esc(unit.name)}"></div>
        <div class="field"><label class="label" for="eu-desc">Description</label><input class="input" id="eu-desc" value="${esc(unit.description || '')}" placeholder="What this unit owns"></div>
        <div class="field"><label class="label" for="eu-lead">Unit lead</label>
          <select class="input" id="eu-lead"><option value="">No lead</option>${people.map(p => `<option value="${p.id}" ${unit.lead_id === p.id ? 'selected' : ''}>${esc(nameOf(p))}</option>`).join('')}</select></div>
        <div class="modal-actions">
          <button class="btn" type="button" id="eu-cancel">Cancel</button>
          <button class="btn primary" type="submit" id="eu-save">Save changes</button>
        </div>
      </form>
    `);
    $('#eu-close')?.addEventListener('click', window.DS.modal.close);
    $('#eu-cancel')?.addEventListener('click', window.DS.modal.close);
    $('#eu-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#eu-name').value.trim();
      if (!name) return toast('Unit name is required.', true);
      const btn = $('#eu-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const { error } = await sb.from('units').update({
        name,
        description: $('#eu-desc').value.trim() || null,
        lead_id: $('#eu-lead').value || null,
      }).eq('id', unit.id);
      if (error) { toast(error.message, true); if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; } return; }
      await audit('unit_updated', 'units:' + unit.id, unit.name, name);
      window.DS.modal.close();
      toast('✓ Unit updated.');
      window.DS.navigate('units');
    });
  }

  function changeMemberRoleModal(membershipId, memberName, currentPosId, positions) {
    window.DS.modal.open(`
      <div class="modal-head">
        <div>
          <h2 style="margin:0 0 4px">Change unit role</h2>
          <p class="muted small" style="margin:0">${esc(memberName || 'Team member')}</p>
        </div>
        <button type="button" class="btn sm ghost" id="cr-close" aria-label="Close" style="padding:4px 8px">✕</button>
      </div>
      <form id="cr-form" novalidate>
        <div class="field"><label class="label" for="cr-pos">Existing role title</label>
          <select class="input" id="cr-pos"><option value="">Member</option>${positions.map(p => `<option value="${p.id}" ${currentPosId === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="cr-newpos">Or create a new role title</label><input class="input" id="cr-newpos" placeholder="e.g. Tech Lead"></div>
        <div class="modal-actions">
          <button class="btn" type="button" id="cr-cancel">Cancel</button>
          <button class="btn primary" type="submit">Save role</button>
        </div>
      </form>
    `);
    $('#cr-close')?.addEventListener('click', window.DS.modal.close);
    $('#cr-cancel')?.addEventListener('click', window.DS.modal.close);
    $('#cr-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      let posId = $('#cr-pos').value || null;
      const np = ($('#cr-newpos').value || '').trim();
      if (np) {
        const { data: p } = await sb.from('positions').select('id').eq('title', np).maybeSingle();
        if (p) posId = p.id;
        else { const { data: created } = await sb.from('positions').insert({ title: np }).select().single(); posId = created?.id; }
      }
      const { error } = await sb.from('unit_members').update({ position_id: posId }).eq('id', membershipId);
      if (error) return toast(error.message, true);
      await audit('unit_member_role_changed', 'unit_members:' + membershipId);
      window.DS.modal.close();
      toast('✓ Role updated.');
      window.DS.navigate('units');
    });
  }

  function addMemberModal(unitId, unitName, people, positions, um) {
    const inUnit = new Set(um.filter(m => m.unit_id === unitId).map(m => m.user_id));
    const avail = people.filter(p => !inUnit.has(p.id));
    window.DS.modal.open(`
      <div class="modal-head">
        <div>
          <h2 style="margin:0 0 4px">Add members to unit</h2>
          <p class="muted small" style="margin:0">${esc(unitName)} · Pick one or more team members</p>
        </div>
        <button type="button" class="btn sm ghost" id="am-close" aria-label="Close" style="padding:4px 8px">✕</button>
      </div>
      <form id="am-form" novalidate>
        <div class="field">
          <label class="label">Select members</label>
          ${window.DS.renderMemberPicker({ id: 'am-users', people: avail, emptyHint: 'Everyone active is already in this unit.' })}
        </div>
        <div class="field"><label class="label" for="am-pos">Role in unit</label>
          <select class="input" id="am-pos"><option value="">Member</option>${positions.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="am-newpos">Or add a new role title</label><input class="input" id="am-newpos" placeholder="e.g. Analyst"></div>
        <div class="modal-actions">
          <button class="btn" type="button" id="am-cancel">Cancel</button>
          <button class="btn accent" type="submit" id="am-submit" ${avail.length ? '' : 'disabled'}>Add selected to unit</button>
        </div>
      </form>`);
    const picker = window.DS.bindMemberPicker(document, 'am-users');
    $('#am-close')?.addEventListener('click', window.DS.modal.close);
    $('#am-cancel')?.addEventListener('click', window.DS.modal.close);
    $('#am-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userIds = picker.getSelected();
      if (!userIds.length) return toast('Select at least one member to add.', true);
      const btn = $('#am-submit');
      if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
      let posId = $('#am-pos').value || null;
      const np = ($('#am-newpos').value || '').trim();
      if (np) {
        const { data: p } = await sb.from('positions').select('id').eq('title', np).maybeSingle();
        if (p) posId = p.id;
        else { const { data: created } = await sb.from('positions').insert({ title: np }).select().single(); posId = created?.id; }
      }
      const rows = userIds.map(uid => ({ user_id: uid, unit_id: unitId, position_id: posId }));
      const { error } = await sb.from('unit_members').insert(rows);
      if (error) {
        toast(error.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Add selected to unit'; }
        return;
      }
      await audit('unit_member_added', 'unit_members:' + unitId, null, `${userIds.length} member(s)`);
      window.DS.modal.close();
      toast(`✓ Added ${userIds.length} member${userIds.length === 1 ? '' : 's'} to unit.`);
      window.DS.navigate('units');
    });
  }

  /* ============================================================
     TASKS & OKRs (admin)
     ============================================================ */
  window.renderTasksAdmin = async function (v) {
    const [people, units, { data: tasks }, { data: okrs }, { data: krs }] = await Promise.all([
      loadPeople(), loadUnits(),
      sb.from('tasks').select('*').order('due_date'),
      sb.from('okrs').select('*').order('created_at', { ascending: false }),
      sb.from('key_results').select('*'),
    ]);
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const date = todayLagos();
    const { data: assignees } = await sb.from('task_assignees').select('*');

    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Create a task</h3></div>
        <form id="nt-form" novalidate>
          <div class="field"><label class="label" for="nt-title">Title</label><input class="input" id="nt-title" required placeholder="Draft the reseller pricing sheet"></div>
          <div class="field"><label class="label" for="nt-desc">Description</label><textarea class="input" id="nt-desc" placeholder="What done looks like"></textarea></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="nt-status">Status</label><select class="input" id="nt-status">${TASK_STATUS.map(s => `<option>${s}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="nt-pri">Priority</label><select class="input" id="nt-pri"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></div>
            <div class="field"><label class="label" for="nt-due">Due date</label><input class="input" id="nt-due" type="date"></div>
            <div class="field"><label class="label" for="nt-assignee">Assign to member</label><select class="input" id="nt-assignee"><option value="">Nobody yet</option>${people.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="nt-unit">Assign to unit</label><select class="input" id="nt-unit"><option value="">No unit</option>${units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="nt-okr">Link to OKR</label><select class="input" id="nt-okr"><option value="">No OKR</option>${(okrs || []).map(o => `<option value="${o.id}">${esc(o.title || o.objective || 'OKR')}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label class="label" for="nt-ev">Evidence link (URL)</label><input class="input" id="nt-ev" type="url" placeholder="https://drive.google.com/…"></div>
          <div class="error-box hidden" id="nt-error" style="margin-bottom:14px"></div>
          <button class="btn primary" type="submit">Create task</button>
        </form>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Tasks</h3>
            <p class="small muted" style="margin-top:2px">${(tasks || []).length} total deliverables</p>
          </div>
          <select class="input" id="tf-status" style="min-height:36px;width:auto" aria-label="Filter tasks by status">
            <option value="">All statuses</option>${TASK_STATUS.map(s => `<option>${s}</option>`).join('')}
          </select>
        </div>
        <div id="tasks-admin-body"></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Create an OKR</h3></div>
        <form id="no-form" novalidate>
          <div class="field"><label class="label" for="ok-title">Objective</label><input class="input" id="ok-title" required placeholder="e.g. Increase product adoption"></div>
          <div class="field"><label class="label" for="ok-desc">Description</label><textarea class="input" id="ok-desc"></textarea></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="ok-unit">Unit</label><select class="input" id="ok-unit"><option value="">Company-wide</option>${units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="ok-status">Status</label><select class="input" id="ok-status"><option>On Track</option><option>At Risk</option><option>Off Track</option><option>Done</option></select></div>
            <div class="field"><label class="label" for="ok-prog">Progress %</label><input class="input" id="ok-prog" type="number" min="0" max="100" value="0"></div>
          </div>
          <div class="field"><label class="label" for="ok-kr">Key result</label><input class="input" id="ok-kr" placeholder="e.g. 50 active enterprise clients"></div>
          <div class="error-box hidden" id="ok-error" style="margin-bottom:14px"></div>
          <button class="btn primary" type="submit">Create OKR</button>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h3>OKRs</h3></div>
        ${(okrs || []).length ? (okrs || []).map(o => {
          const mine = (krs || []).filter(k => k.okr_id === o.id);
          return `<div style="border-bottom:1px solid var(--line-soft);padding:var(--sp3) 0">
            <div class="card-head" style="margin-bottom:8px">
              <div><h3>${esc(o.title || o.objective || 'OKR')}</h3><div class="small muted">${esc(o.description || '')}</div></div>
              ${statusTag(o.status)}
            </div>
            <div class="progress" style="max-width:360px;margin-bottom:8px"><div style="width:${o.progress || 0}%"></div></div>
            <div class="small muted">${o.progress || 0}% · ${units.find(u => u.id === o.unit_id)?.name || 'Company-wide'}</div>
            ${mine.length ? `<div style="margin-top:10px">${mine.map(k => `<div class="row" style="padding:6px 0"><div class="row-main"><div class="t" style="font-size:13px">${esc(k.title)}</div><div class="s">${esc(k.target || '')} → ${esc(k.current || '')}</div></div><span class="tag muted-tag">${k.progress || 0}%</span></div>`).join('')}</div>` : ''}
            <button class="btn sm" style="margin-top:10px" data-addkr="${o.id}">Add key result</button>
          </div>`;
        }).join('') : emptyState('No OKRs yet', 'Create an objective above, then attach key results to it.')}
      </div>`;

    $('#nt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#nt-error');
      err.classList.remove('show');
      const title = $('#nt-title').value.trim();
      if (!title) { err.textContent = 'Task title is required.'; err.classList.add('show'); return; }
      const status = $('#nt-status').value;
      const { data: created, error } = await sb.from('tasks').insert({
        title, description: $('#nt-desc').value.trim() || null,
        status: status === 'In progress' ? 'In Progress' : status === 'In review' ? 'In Review' : status === 'To do' ? 'To Do' : status,
        priority: $('#nt-pri').value, due_date: $('#nt-due').value || null,
        assignee_id: $('#nt-assignee').value || null,
        unit_id: $('#nt-unit').value || null,
        okr_id: $('#nt-okr').value || null,
        evidence_url: $('#nt-ev').value.trim() || null,
        created_by: S.user.id,
      }).select().single();
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      const aid = $('#nt-assignee').value;
      if (aid) await sb.from('task_assignees').insert({ task_id: created.id, user_id: aid, assigned_by: S.user.id });
      await audit('task_created', 'tasks:' + created.id, null, title);
      toast('Task created.');
      window.DS.navigate('tasks');
    });

    $('#no-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#ok-error');
      err.classList.remove('show');
      const title = $('#ok-title').value.trim();
      if (!title) { err.textContent = 'Objective is required.'; err.classList.add('show'); return; }
      const { data: created, error } = await sb.from('okrs').insert({
        title, description: $('#ok-desc').value.trim() || null,
        unit_id: $('#ok-unit').value || null,
        status: $('#ok-status').value,
        progress: Math.max(0, Math.min(100, Number($('#ok-prog').value) || 0)),
      }).select().single();
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      const kr = ($('#ok-kr').value || '').trim();
      if (kr) await sb.from('key_results').insert({ okr_id: created.id, title: kr, progress: 0 });
      await audit('okr_created', 'okrs:' + created.id, null, title);
      toast('OKR created.');
      window.DS.navigate('tasks');
    });

    let taskPage = 1;
    let taskFilter = '';

    const deleteTaskById = async (taskId, btnEl) => {
      const ok = await window.DS.confirmModal({
        title: 'Delete task',
        message: 'Are you sure you want to permanently delete this task?',
        confirmLabel: 'Delete task',
        isAlert: true,
      });
      if (!ok) return;
      if (btnEl) btnEl.disabled = true;
      const { error } = await sb.from('tasks').delete().eq('id', taskId);
      if (error) { toast(error.message, true); if (btnEl) btnEl.disabled = false; return; }
      toast('✓ Task deleted.');
      window.DS.navigate('tasks');
    };

    const openTaskModal = (taskId) => {
      const t = (tasks || []).find(x => x.id === taskId);
      if (!t) return;
      const as = (assignees || []).filter(a => a.task_id === t.id).map(a => nameOf(pmap[a.user_id]));
      const overdue = t.due_date && t.due_date < date && t.status !== 'Done';
      window.DS.showDetailsModal({
        title: t.title,
        subtitle: `Task · Due ${t.due_date ? fmtD(t.due_date) : 'No deadline'}`,
        badgeHtml: `<span class="tag ${t.status === 'Done' ? 'ok' : (t.status || '').toLowerCase().includes('review') ? '' : 'muted-tag'}">${esc(t.status || 'To do')}</span>`,
        rows: [
          { label: 'Task title', value: t.title },
          { label: 'Description', value: t.description || 'No additional description provided' },
          { label: 'Assignee(s)', value: as.length ? as.join(', ') : 'Unassigned' },
          { label: 'Current status', value: t.status || 'To do' },
          { label: 'Priority', value: t.priority || 'Normal' },
          { label: 'Due date', isHtml: true, value: overdue ? `<span class="tag alert">Overdue ${fmtD(t.due_date)}</span>` : (t.due_date ? fmtD(t.due_date) : '—') },
          { label: 'Extension requested', isHtml: true, value: t.extension_requested ? `<span class="tag alert">Yes (${esc(t.extension_note || 'Requested by assignee')})</span>` : 'No' },
          { label: 'Evidence URL', isHtml: true, value: t.evidence_url ? `<a href="${esc(t.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost" style="padding:2px 8px;font-size:12px">Open evidence link ↗</a>` : '<span class="muted">No evidence submitted</span>' },
          { label: 'Task ID', value: t.id }
        ],
        actions: [
          t.evidence_url ? { label: 'Open evidence ↗', href: t.evidence_url } : null,
          { label: 'Delete task', className: 'alert', onClick: () => deleteTaskById(t.id) }
        ]
      });
    };

    function renderTasksBody() {
      const container = $('#tasks-admin-body', v);
      if (!container) return;
      const filtered = (tasks || []).filter(t => !taskFilter || normTaskStatus(t.status) === taskFilter);
      const pg = window.DS.paginate(filtered, taskPage, 25);
      container.innerHTML = filtered.length ? `
        <div class="ds-list">
          ${pg.items.map(t => {
            const as = (assignees || []).filter(a => a.task_id === t.id).map(a => nameOf(pmap[a.user_id]));
            const overdue = t.due_date && t.due_date < date && t.status !== 'Done';
            const normSt = normTaskStatus(t.status);
            const actions = [
              { label: 'View task details', icon: '📋', attrs: `data-view-task="${t.id}"` },
              { divider: true },
              t.evidence_url ? { label: 'Open evidence link', icon: '↗', attrs: `onclick="window.open('${esc(t.evidence_url)}', '_blank')"` } : null,
              { divider: true },
              { label: 'Delete task', icon: '🗑️', isAlert: true, attrs: `data-del-task="${t.id}"` },
            ];
            return `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">🎯</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(t.title)}</span>
                      <span class="tag ${t.status === 'Done' ? 'ok' : (t.status || '').toLowerCase().includes('review') ? '' : 'muted-tag'}">${esc(t.status || 'To do')}</span>
                      ${t.priority ? `<span class="tag muted-tag">${esc(t.priority)}</span>` : ''}
                      ${overdue ? '<span class="tag alert">Overdue</span>' : ''}
                      ${t.extension_requested ? '<span class="tag brand">Extension</span>' : ''}
                    </div>
                    <div class="ds-list-sub">
                      <span>👤 <b>${as.length ? esc(as.join(', ')) : 'Unassigned'}</b></span>
                      <span>·</span>
                      <span>Due: ${t.due_date ? fmtD(t.due_date) : 'No due date'}</span>
                      ${t.evidence_url ? `<span>·</span><a href="${esc(t.evidence_url)}" target="_blank" rel="noopener">Evidence link ↗</a>` : ''}
                    </div>
                    ${t.description ? `<div class="ds-list-snippet">${esc(t.description)}</div>` : ''}
                  </div>
                </div>
                <div class="ds-list-actions">
                  <select class="input" style="min-height:32px;padding:2px 8px;font-size:12px;width:auto" data-setst="${t.id}" aria-label="Change task status">
                    ${TASK_STATUS.map(s => `<option ${normSt === s ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                  <button type="button" class="btn sm" data-view-task="${t.id}">View</button>
                  ${window.DS.renderActionMenu(actions)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${pg.renderBar('tasks')}
      ` : emptyState(taskFilter ? 'No matching tasks' : 'No tasks yet', taskFilter ? 'Try clearing the status filter above.' : 'Create one above and assign it to a member or a unit.');

      $$('[data-setst]', container).forEach(sel => sel.addEventListener('change', async () => {
        const raw = sel.value;
        const map = { 'To do': 'To Do', 'In progress': 'In Progress', 'In review': 'In Review', 'Done': 'Done' };
        const newSt = map[raw] || raw;
        const { error } = await sb.from('tasks').update({ status: newSt }).eq('id', sel.dataset.setst);
        if (error) return toast(error.message, true);
        const item = (tasks || []).find(x => x.id === sel.dataset.setst);
        if (item) item.status = newSt;
        await audit('task_status_changed', 'tasks:' + sel.dataset.setst, null, raw);
        toast('Task status updated.');
      }));
      $$('[data-view-task]', container).forEach(b => b.addEventListener('click', () => openTaskModal(b.dataset.viewTask)));
      $$('[data-del-task]', container).forEach(b => b.addEventListener('click', () => deleteTaskById(b.dataset.delTask, b)));
      window.DS.initActionMenus(container);
      window.DS.bindPagination(container, (p) => { taskPage = p; renderTasksBody(); });
    }

    renderTasksBody();

    $('#tf-status').addEventListener('change', () => {
      taskFilter = $('#tf-status').value;
      taskPage = 1;
      renderTasksBody();
    });

    $$('[data-addkr]', v).forEach(b => b.addEventListener('click', () => {
      window.DS.modal.open(`
        <h2 style="margin-bottom:16px">Add a key result</h2>
        <form id="kr-form" novalidate>
          <div class="field"><label class="label" for="kr-title">Key result</label><input class="input" id="kr-title" required placeholder="30 active resellers"></div>
          <div class="field"><label class="label" for="kr-target">Target</label><input class="input" id="kr-target" placeholder="30 resellers"></div>
          <div class="field"><label class="label" for="kr-cur">Current</label><input class="input" id="kr-cur" placeholder="12 resellers"></div>
          <div style="display:flex;gap:10px"><button class="btn primary" style="flex:1" type="submit">Add key result</button><button class="btn" type="button" id="kr-cancel">Cancel</button></div>
        </form>`);
      $('#kr-cancel').addEventListener('click', window.DS.modal.close);
      $('#kr-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = $('#kr-title').value.trim();
        if (!title) return toast('Key result title is required.', true);
        await sb.from('key_results').insert({ okr_id: b.dataset.addkr, title, target: $('#kr-target').value.trim() || null, current: $('#kr-cur').value.trim() || null, progress: 0 });
        window.DS.modal.close();
        toast('Key result added.');
        window.DS.navigate('tasks');
      });
    }));
  };

  /* ============================================================
     MEETINGS (admin)
     ============================================================ */
  window.renderMeetingsAdmin = async function (v) {
    const [people, units, meetingsRes, attRes, umRes] = await Promise.all([
      loadPeople(), loadUnits(),
      sb.from('meetings').select('*, units:unit_id(name)').order('starts_at', { ascending: false }),
      sb.from('meeting_attendance').select('*'),
      sb.from('unit_members').select('unit_id,user_id'),
    ]);
    const meetings = meetingsRes.data || [];
    const att = attRes.data || [];
    const um = umRes.data || [];
    const activePeople = people.filter(p => p.active !== false);
    const list = meetings;
    let meetPage = 1;

    function renderView() {
      const pg = window.DS.paginate(list, meetPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head"><h3>Create a meeting</h3></div>
          <form id="nm-form" novalidate>
            <div class="field"><label class="label" for="mt-title">Title</label><input class="input" id="mt-title" required placeholder="Weekly unit sync"></div>
            <div class="field"><label class="label" for="mt-desc">Description</label><textarea class="input" id="mt-desc" placeholder="Agenda"></textarea></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:0 16px">
              <div class="field"><label class="label" for="mt-start">Starts</label><input class="input" id="mt-start" type="datetime-local" required></div>
              <div class="field"><label class="label" for="mt-end">Ends</label><input class="input" id="mt-end" type="datetime-local"></div>
              <div class="field"><label class="label" for="mt-unit">Invite unit</label><select class="input" id="mt-unit"><option value="">Everyone</option>${units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
            </div>
            <div class="field"><label class="label" for="mt-link">Meeting link (URL)</label><input class="input" id="mt-link" type="url" placeholder="https://meet.google.com/…"></div>
            <div class="field">
              <div class="pw-label-row">
                <label class="label" style="margin-bottom:0">Invite members</label>
                <span class="tiny muted" id="mt-invite-hint">Select individual members or pick a unit above</span>
              </div>
              ${window.DS.renderMemberPicker({ id: 'mt-invite', people: activePeople })}
            </div>
            <div class="error-box hidden" id="nm-error" style="margin-bottom:14px"></div>
            <button class="btn accent" id="nm-submit" type="submit">Create meeting</button>
          </form>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h3>Meetings</h3>
              <p class="small muted" style="margin-top:2px">${list.length} meeting${list.length === 1 ? '' : 's'} recorded</p>
            </div>
          </div>
          ${pg.items.length ? `
            <div class="desktop-only" id="mt-desktop-list">
              ${pg.items.map(raw => {
                const m = window.DS.meeting(raw);
                const reports = att.filter(a => a.meeting_id === m.id);
                const yes = reports.filter(a => a.attended).length;
                const actions = [
                  { label: 'View details', icon: '📋', attrs: `data-view-meeting="${m.id}"` },
                  { label: 'Mark attendance', icon: '👥', attrs: `data-att="${m.id}"` },
                  { label: 'Notes link', icon: '📄', attrs: `data-notes="${m.id}"` },
                  m.link ? { label: 'Join meeting', icon: '↗', attrs: `onclick="window.open('${esc(m.link)}', '_blank')"` } : null,
                ];
                return `<div style="border-bottom:1px solid var(--line-soft);padding:var(--sp3) 0">
                  <div class="card-head" style="margin-bottom:8px">
                    <div>
                      <h3 style="word-break:normal;overflow-wrap:break-word">${esc(m.title)}</h3>
                      <div class="small muted" style="word-break:normal;overflow-wrap:break-word">${fmtDT(m.starts_at)}${m.ends_at ? ' – ' + fmtDT(m.ends_at) : ''} · ${esc(m.units?.name || 'Everyone')}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                      <button type="button" class="btn sm ghost" data-view-meeting="${m.id}" style="padding:2px 8px;font-size:12px">View</button>
                      <button class="btn sm" data-att="${m.id}">Mark attendance</button>
                      <button class="btn sm ghost" data-notes="${m.id}">Notes</button>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                  <div class="small muted">${reports.length ? `${yes} of ${reports.length} attended` : 'No meeting reports yet'}${m.notes_link ? ` · <a href="${esc(m.notes_link)}" target="_blank" rel="noopener">Notes ↗</a>` : ''}</div>
                </div>`;
              }).join('')}
            </div>

            <div class="records-list mobile-only" id="mt-mobile-cards">
              ${pg.items.map(raw => {
                const m = window.DS.meeting(raw);
                const reports = att.filter(a => a.meeting_id === m.id);
                const yes = reports.filter(a => a.attended).length;
                const actions = [
                  { label: 'View details', icon: '📋', attrs: `data-view-meeting="${m.id}"` },
                  { label: 'Mark attendance', icon: '👥', attrs: `data-att="${m.id}"` },
                  { label: 'Notes link', icon: '📄', attrs: `data-notes="${m.id}"` },
                  m.link ? { label: 'Join meeting', icon: '↗', attrs: `onclick="window.open('${esc(m.link)}', '_blank')"` } : null,
                ];
                return `
                  <div class="record-card">
                    <div class="record-card-top">
                      <div class="record-header-info">
                        <div class="record-title">👥 ${esc(m.title)}</div>
                        <div class="record-sub">${fmtDT(m.starts_at)} · <span class="tag muted-tag">${esc(m.units?.name || 'Everyone')}</span></div>
                      </div>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                    ${m.description || m.agenda ? `<div class="record-snippet">${esc((m.description || m.agenda).slice(0, 100))}</div>` : ''}
                    <div class="record-footer">
                      <span class="tiny muted">${reports.length ? `${yes} attended` : 'No reports'}</span>
                      <div style="display:flex;gap:6px">
                        <button type="button" class="btn sm" data-view-meeting="${m.id}">View</button>
                        <button class="btn sm primary" data-att="${m.id}">Attendance</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${pg.renderBar('meetings')}
          ` : emptyState('No meetings yet', 'Create one above and invite a unit or individual members.')}
        </div>`;

      bindEvents();
      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (p) => {
        meetPage = p;
        renderView();
      });
    }

    function bindEvents() {
      const invitePicker = window.DS.bindMemberPicker(v, 'mt-invite');

      $('#mt-unit')?.addEventListener('change', (e) => {
        const uid = e.target.value;
        const hint = $('#mt-invite-hint', v);
        if (!uid) {
          if (hint) hint.textContent = 'Select individual members or pick a unit above';
          return;
        }
        const unitMemIds = um.filter(m => m.unit_id === uid).map(m => m.user_id);
        invitePicker.setSelected(unitMemIds);
        if (hint) hint.textContent = `Pre-selected ${unitMemIds.length} member${unitMemIds.length === 1 ? '' : 's'} from unit`;
      });

      $('#nm-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#nm-error');
        const btn = $('#nm-submit');
        err.classList.add('hidden'); err.classList.remove('show');
        const title = $('#mt-title').value.trim();
        const start = $('#mt-start').value;
        if (!title || !start) { err.textContent = 'Title and start time are required.'; err.classList.remove('hidden'); err.classList.add('show'); return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
        const { data: created, error } = await sb.from('meetings').insert({
          title, description: $('#mt-desc').value.trim() || null,
          agenda: $('#mt-desc').value.trim() || null,
          starts_at: new Date(start).toISOString(),
          ends_at: $('#mt-end').value ? new Date($('#mt-end').value).toISOString() : null,
          unit_id: $('#mt-unit').value || null,
          location: $('#mt-link').value.trim() || null,
          meet_link: $('#mt-link').value.trim() || null,
          organizer_id: S.user.id,
        }).select().single();
        if (error) {
          err.textContent = error.message; err.classList.remove('hidden'); err.classList.add('show');
          if (btn) { btn.disabled = false; btn.textContent = 'Create meeting'; }
          return;
        }
        const picked = invitePicker.getSelected();
        for (const uid of picked) { try { await sb.from('meeting_attendance').insert({ meeting_id: created.id, user_id: uid, attended: false }); } catch (e) { /* best-effort */ } }
        await audit('meeting_created', 'meetings:' + created.id, null, title);
        for (const uid of picked) await notifyUser(uid, 'meeting', 'New meeting: ' + title, fmtDT(new Date(start).toISOString()), 'meetings');
        toast('✓ Meeting created.');
        window.DS.navigate('meetings');
      });

      $$('[data-att]', v).forEach(b => b.addEventListener('click', () => {
        const raw = list.find(x => x.id === b.dataset.att);
        attendanceModal(b.dataset.att, raw?.title || 'Meeting', activePeople, att);
      }));
      $$('[data-notes]', v).forEach(b => b.addEventListener('click', async () => {
        const raw = list.find(x => x.id === b.dataset.notes);
        const url = await window.DS.promptModal({
          title: 'Meeting notes link',
          subtitle: raw ? raw.title : '',
          label: 'Notes link (URL)',
          type: 'url',
          defaultValue: raw?.minutes || raw?.drive_notes_link || 'https://',
          placeholder: 'https://docs.google.com/…',
          confirmLabel: 'Save link',
        });
        if (!url) return;
        await sb.from('meetings').update({ minutes: url, drive_notes_link: url }).eq('id', b.dataset.notes);
        await audit('meeting_notes_updated', 'meetings:' + b.dataset.notes);
        toast('Notes link saved.');
        window.DS.navigate('meetings');
      }));

      $$('[data-view-meeting]', v).forEach(b => b.addEventListener('click', () => {
        const raw = list.find(x => x.id === b.dataset.viewMeeting);
        if (!raw) return;
        const m = window.DS.meeting(raw);
        const reports = att.filter(a => a.meeting_id === m.id);
        const yes = reports.filter(a => a.attended).length;
        window.DS.showDetailsModal({
          title: m.title,
          subtitle: `Meeting · ${fmtDT(m.starts_at)}`,
          badgeHtml: `<span class="tag muted-tag">${esc(m.units?.name || 'Everyone')}</span>`,
          rows: [
            { label: 'Title', value: m.title },
            { label: 'Starts', value: fmtDT(m.starts_at) },
            { label: 'Ends', value: m.ends_at ? fmtDT(m.ends_at) : '—' },
            { label: 'Target unit', value: m.units?.name || 'Everyone' },
            { label: 'Meeting link', isHtml: true, value: m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(m.link)} ↗</a>` : '<span class="muted">No link set</span>' },
            { label: 'Description / agenda', value: m.description || m.agenda || 'No agenda provided' },
            { label: 'Attendance', value: `${yes} attended (${reports.length} reported)` },
            { label: 'Drive notes link', isHtml: true, value: m.notes_link ? `<a href="${esc(m.notes_link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(m.notes_link)} ↗</a>` : '<span class="muted">None</span>' }
          ],
          actions: [
            { label: 'Mark attendance', onClick: () => attendanceModal(m.id, m.title, activePeople, att) },
            m.link ? { label: 'Join meeting ↗', className: 'primary', href: m.link } : null
          ]
        });
      }));
    }

    renderView();
  };

  function attendanceModal(meetingId, meetingTitle, people, attRows = []) {
    const existingRows = (attRows || []).filter(a => a.meeting_id === meetingId);
    const alreadyAttended = existingRows.filter(a => a.attended).map(a => a.user_id);
    window.DS.modal.open(`
      <div class="modal-head">
        <div>
          <h2 style="margin:0 0 4px">Mark attendance</h2>
          <p class="muted small" style="margin:0">${esc(meetingTitle)} · Tick who attended</p>
        </div>
        <button type="button" class="btn sm ghost" id="at-close" aria-label="Close" style="padding:4px 8px">✕</button>
      </div>
      <form id="at-form" novalidate>
        <div class="field">
          ${window.DS.renderMemberPicker({ id: 'at-users', people, selectedIds: alreadyAttended })}
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" id="at-cancel">Cancel</button>
          <button class="btn primary" type="submit" id="at-save">Save attendance</button>
        </div>
      </form>`);
    const picker = window.DS.bindMemberPicker(document, 'at-users');
    $('#at-close')?.addEventListener('click', window.DS.modal.close);
    $('#at-cancel')?.addEventListener('click', window.DS.modal.close);
    $('#at-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#at-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const ids = picker.getSelected();
      const selSet = new Set(ids);
      for (const uid of ids) {
        const { error } = await sb.from('meeting_attendance').upsert({ meeting_id: meetingId, user_id: uid, attended: true }, { onConflict: 'meeting_id,user_id' });
        if (error) toast(error.message, true);
      }
      for (const row of existingRows) {
        if (row.attended && !selSet.has(row.user_id)) {
          await sb.from('meeting_attendance').update({ attended: false }).eq('id', row.id);
        }
      }
      await audit('attendance_marked', 'meeting_attendance:' + meetingId);
      window.DS.modal.close();
      toast(`✓ ${ids.length} marked as attending.`);
      window.DS.navigate('meetings');
    });
  }

  /* ============================================================
     IDEAS & PROBLEMS (admin)
     ============================================================ */
  window.renderIdeasAdmin = async function (v) {
    const people = await loadPeople();
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const { data } = await sb.from('weekly_feedback').select('*, periods:period_id(label)').order('created_at', { ascending: false });
    const list = data || [];
    let ideasPage = 1;
    let ideasFilter = '';

    function renderView() {
      const filtered = list.filter(f =>
        !ideasFilter
        || f.type === ideasFilter
        || (ideasFilter === 'pending' && ['Submitted', 'Open'].includes(f.status))
      );
      const pg = window.DS.paginate(filtered, ideasPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div>
              <h3>All submissions</h3>
              <p class="small muted" style="margin-top:2px">${filtered.length} weekly idea${filtered.length === 1 ? '' : 's'} &amp; problem${filtered.length === 1 ? '' : 's'}</p>
            </div>
            <select class="input" id="if-filter" style="min-height:36px;width:auto" aria-label="Filter submissions">
              <option value="" ${ideasFilter === '' ? 'selected' : ''}>All</option>
              <option value="idea" ${ideasFilter === 'idea' ? 'selected' : ''}>Ideas</option>
              <option value="problem" ${ideasFilter === 'problem' ? 'selected' : ''}>Problems</option>
              <option value="pending" ${ideasFilter === 'pending' ? 'selected' : ''}>Awaiting decision</option>
            </select>
          </div>

          ${pg.items.length ? `
            <div id="if-list" class="desktop-only">
              ${pg.items.map(f => {
                const actions = [
                  { label: 'View details', icon: '📋', attrs: `data-view-fb="${f.id}"` },
                  { label: 'Make decision', icon: '⚖️', attrs: `data-dec="${f.id}"` },
                ];
                return `
                  <div class="row" style="align-items:flex-start">
                    <div class="row-main">
                      <div class="t">${f.type === 'idea' ? '💡 Idea' : '⚠️ Problem'}${f.title ? ' · ' + esc(f.title) : ''}</div>
                      <div class="s">${esc(nameOf(pmap[f.user_id]))} · ${esc(f.periods?.label || 'No period')} · ${esc(f.section || 'No section')}${f.severity ? ' · ' + esc(f.severity) : ''}</div>
                      <div class="s">${esc(f.content || '')}</div>
                      ${f.admin_note ? `<div class="s"><b>Admin note:</b> ${esc(f.admin_note)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                      <button type="button" class="btn sm ghost" data-view-fb="${f.id}" style="padding:2px 8px;font-size:12px">View</button>
                      ${statusTag(f.status)}
                      <button class="btn sm" data-dec="${f.id}">Decide</button>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="records-list mobile-only" id="if-cards">
              ${pg.items.map(f => {
                const actions = [
                  { label: 'View details', icon: '📋', attrs: `data-view-fb="${f.id}"` },
                  { label: 'Make decision', icon: '⚖️', attrs: `data-dec="${f.id}"` },
                ];
                return `
                  <div class="record-card">
                    <div class="record-card-top">
                      <div class="record-header-info">
                        <div class="record-title">${f.type === 'idea' ? '💡' : '⚠️'} ${esc(f.title || f.type)}</div>
                        <div class="record-sub">${esc(nameOf(pmap[f.user_id]))} · ${esc(f.periods?.label || '')}</div>
                      </div>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                    <div class="record-tags">
                      ${statusTag(f.status)}
                      <span class="tag muted-tag">${esc(f.section || 'General')}</span>
                      ${f.severity ? `<span class="tag ${f.severity === 'Critical' || f.severity === 'High' ? 'alert' : 'muted-tag'}">${esc(f.severity)}</span>` : ''}
                    </div>
                    ${f.content ? `<div class="record-snippet">${esc(f.content.slice(0, 100))}${f.content.length > 100 ? '…' : ''}</div>` : ''}
                    <div class="record-footer">
                      <span class="tiny muted">${fmtDT(f.created_at)}</span>
                      <div style="display:flex;gap:6px">
                        <button type="button" class="btn sm" data-view-fb="${f.id}">View</button>
                        <button class="btn sm primary" data-dec="${f.id}">Decide</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${pg.renderBar('ideas')}
          ` : emptyState(ideasFilter ? 'No matching submissions' : 'Nothing submitted yet', ideasFilter ? 'Try switching the filter above.' : 'Members submit one idea and one problem each week. They land here.')}
        </div>`;

      bindEvents();
      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (p) => {
        ideasPage = p;
        renderView();
      });
    }

    function bindEvents() {
      $('#if-filter')?.addEventListener('change', (e) => {
        ideasFilter = e.target.value;
        ideasPage = 1;
        renderView();
      });

      const openDecisionModal = async (fbId) => {
        const { data: f } = await sb.from('weekly_feedback').select('*').eq('id', fbId).single();
        if (!f) return toast('Submission not found.', true);
        window.DS.modal.open(`
          <div class="modal-head">
            <div>
              <h2 style="margin:0 0 4px">${f.type === 'idea' ? 'Idea' : 'Problem'} decision</h2>
              <p class="muted small" style="margin:0">${esc(f.title || '')} · ${esc(f.section || 'No section')}</p>
            </div>
            <button type="button" class="btn sm ghost" id="dec-close" aria-label="Close" style="padding:4px 8px">✕</button>
          </div>
          <div class="card" style="padding:14px;margin-bottom:16px;background:var(--bg)"><div class="small">${esc(f.content || '')}</div></div>
          <form id="dec-form" novalidate>
            <div class="field"><label class="label" for="dec-status">Status</label>
              <select class="input" id="dec-status">${FB_STATUS.map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="dec-note">Reason / note</label><textarea class="input" id="dec-note" placeholder="Explain the decision — the member sees this.">${esc(f.admin_note || '')}</textarea></div>
            <div class="modal-actions"><button class="btn" type="button" id="dec-cancel">Cancel</button><button class="btn primary" type="submit">Save decision</button></div>
          </form>`);
        $('#dec-close')?.addEventListener('click', window.DS.modal.close);
        $('#dec-cancel').addEventListener('click', window.DS.modal.close);
        $('#dec-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const st = $('#dec-status').value;
          const note = $('#dec-note').value.trim();
          if (st === 'Rejected' && !note) { toast('Add a reason when rejecting.', true); return; }
          const { error } = await sb.from('weekly_feedback').update({ status: st, admin_note: note || null, reviewed_by: S.user.id, reviewed_at: new Date().toISOString() }).eq('id', f.id);
          if (error) return toast(error.message, true);
          await audit('feedback_decision', 'weekly_feedback:' + f.id, f.status, st);
          await notifyUser(f.user_id, 'feedback_status', `${f.type === 'idea' ? 'Idea' : 'Problem'} ${st.toLowerCase()}`, note || null, 'ideas');
          window.DS.modal.close();
          toast('Decision saved.');
          window.DS.navigate('ideas');
        });
      };

      $$('[data-view-fb]', v).forEach(b => b.addEventListener('click', () => {
        const f = list.find(x => x.id === b.dataset.viewFb);
        if (!f) return;
        window.DS.showDetailsModal({
          title: `${f.type === 'idea' ? '💡 Idea' : '⚠️ Problem'}: ${f.title || 'Untitled'}`,
          subtitle: `Submitted by ${nameOf(pmap[f.user_id])} · ${f.periods?.label || 'Current period'}`,
          badgeHtml: statusTag(f.status),
          rows: [
            { label: 'Type', value: f.type === 'idea' ? 'Weekly Idea' : 'Weekly Problem' },
            { label: 'Title', value: f.title || 'Untitled' },
            { label: 'Submitted by', value: nameOf(pmap[f.user_id]) },
            { label: 'Section / Department', value: f.section || 'General' },
            { label: 'Severity', value: f.severity || 'Normal' },
            { label: 'Full description', value: f.content || 'No details provided' },
            { label: 'Current status', value: f.status },
            { label: 'Admin review note', value: f.admin_note || 'No notes yet' },
            { label: 'Submitted on', value: fmtDT(f.created_at) }
          ],
          actions: [
            { label: 'Make decision', className: 'primary', onClick: () => openDecisionModal(f.id) }
          ]
        });
      }));

      $$('[data-dec]', v).forEach(b => b.addEventListener('click', () => openDecisionModal(b.dataset.dec)));
    }

    renderView();
  };

  /* ============================================================
     SCORES & PERIODS (admin)
     ============================================================ */
  window.renderScoresAdmin = async function (v) {
    const people = await loadPeople();
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const [{ data: criteria }, { data: periods }, { data: weekly }, { data: monthly }, { data: auditRows }] = await Promise.all([
      sb.from('score_criteria').select('*').order('weight', { ascending: false }),
      sb.from('periods').select('*').order('start_date', { ascending: false }),
      sb.from('weekly_scores').select('*, periods:period_id(label,type,locked)').order('scored_at', { ascending: false }),
      sb.from('monthly_scores').select('*, periods:period_id(label,type,locked)').order('scored_at', { ascending: false }),
      sb.from('audit_log').select('*, profiles:actor_id(full_name)').order('created_at', { ascending: false }).limit(25),
    ]);

    const weeklyPeriods = (periods || []).filter(p => p.type === 'weekly');
    const activePeriod = weeklyPeriods.find(p => !p.locked) || weeklyPeriods[0];

    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Category weights</h3><span class="tag muted-tag">Must total 100</span></div>
        <div id="wt-list">
          ${(criteria || []).map(c => `
            <div class="row"><div class="row-main"><div class="t">${esc(c.label)}</div><div class="s">Scored 0–${c.max_points} by the admin</div></div>
              <input class="input" style="width:96px;min-height:38px" type="number" min="0" max="100" data-crit="${c.key}" value="${c.weight}" aria-label="${esc(c.label)} weight">
            </div>`).join('')}
        </div>
        <div class="error-box hidden" id="wt-error" style="margin:14px 0"></div>
        <button class="btn primary" id="wt-save">Save weights</button>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Periods</h3>
            <p class="small muted" style="margin-top:2px">Weekly and monthly reporting cycles</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn sm" id="new-period">New period</button>
          </div>
        </div>
        ${(periods || []).length ? `
          <div class="ds-list">
            ${(periods || []).map(p => `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">🗓️</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(p.label)}</span>
                      <span class="tag muted-tag">${p.type === 'weekly' ? 'Weekly' : 'Monthly'}</span>
                      ${p.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>'}
                    </div>
                    <div class="ds-list-sub">
                      <span>${fmtD(p.start_date)} → ${fmtD(p.end_date)}</span>
                    </div>
                  </div>
                </div>
                <div class="ds-list-actions">
                  ${p.locked
                    ? `<button class="btn sm" data-unlock="${p.id}" data-label="${esc(p.label)}">Reopen</button>`
                    : `<button class="btn sm ghost" data-lock="${p.id}" data-label="${esc(p.label)}">Lock</button>`}
                </div>
              </div>
            `).join('')}
          </div>
        ` : emptyState('No periods yet', 'Create a weekly period so reports and scores have somewhere to land.')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Enter a weekly score</h3>
          ${activePeriod ? `<span class="tag ${activePeriod.locked ? 'muted-tag' : ''}">${esc(activePeriod.label)}${activePeriod.locked ? ' · locked' : ''}</span>` : ''}
        </div>
        ${activePeriod ? `
        ${activePeriod.locked ? `<div class="error-box" style="margin-bottom:16px">This period is locked. Reopen it before editing scores.</div>` : ''}
        <form id="ws-form" novalidate>
          <div class="field"><label class="label" for="ws-period">Period</label>
            <select class="input" id="ws-period" ${activePeriod.locked ? 'disabled' : ''}>${weeklyPeriods.map(p => `<option value="${p.id}" ${p.id === activePeriod.id ? 'selected' : ''}>${esc(p.label)}${p.locked ? ' (locked)' : ''}</option>`).join('')}</select></div>
          <div class="field"><label class="label" for="ws-user">Member</label>
            <select class="input" id="ws-user" ${activePeriod.locked ? 'disabled' : ''}>${people.filter(p => p.active !== false).map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 16px">
            ${(criteria || []).map(c => `<div class="field"><label class="label" for="ws-${c.key}">${esc(c.label)} (0–${c.max_points})</label>
              <input class="input" id="ws-${c.key}" type="number" min="0" max="${c.max_points}" step="1" inputmode="numeric" placeholder="—" ${activePeriod.locked ? 'disabled' : ''}></div>`).join('')}
          </div>
          <div class="field"><label class="label" for="ws-note">Note</label><input class="input" id="ws-note" placeholder="Optional context" ${activePeriod.locked ? 'disabled' : ''}></div>
          <div class="error-box hidden" id="ws-error" style="margin-bottom:14px"></div>
          <button class="btn primary" type="submit" ${activePeriod.locked ? 'disabled' : ''}>Save weekly score</button>
          <p class="tiny muted" style="margin-top:10px">Every criterion field starts empty. The weighted total is computed for you — nothing is suggested.</p>
        </form>` : emptyState('No weekly period', 'Create a weekly period first.')}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Weekly scores</h3>
            <p class="small muted" style="margin-top:2px">Calculated performance reviews for each member</p>
          </div>
          <span class="tag muted-tag">${(weekly || []).length} recorded</span>
        </div>
        ${(weekly || []).length ? `
          <div class="ds-list">
            ${weekly.map(s => {
              const person = pmap[s.user_id];
              const initials = window.DS.getInitials(nameOf(person));
              const val = s.manual_override ?? s.weighted_total;
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-avatar">${esc(initials)}</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${esc(nameOf(person))}</span>
                        <span class="tag ok"><b>${val}/100</b></span>
                        ${s.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>'}
                      </div>
                      <div class="ds-list-sub">
                        <span>Period: <b>${esc(s.periods?.label || '—')}</b></span>
                        <span>·</span>
                        <span>Scored ${fmtDT(s.scored_at)}</span>
                      </div>
                      ${s.note ? `<div class="ds-list-snippet">Note: ${esc(s.note)}</div>` : ''}
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button type="button" class="btn sm" data-view-wscore="${s.id}">View</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : emptyState('No weekly scores yet', 'Scores appear here once you enter them above.')}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Monthly scores</h3>
            <p class="small muted" style="margin-top:2px">End of month cumulative evaluations</p>
          </div>
          <span class="tag muted-tag">${(monthly || []).length} recorded</span>
        </div>
        ${(monthly || []).length ? `
          <div class="ds-list">
            ${monthly.map(m => {
              const person = pmap[m.user_id];
              const initials = window.DS.getInitials(nameOf(person));
              const val = m.final_score ?? m.weekly_avg;
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-avatar">${esc(initials)}</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${esc(nameOf(person))}</span>
                        <span class="tag ok"><b>${val != null ? Math.round(val) + '/100' : '—'}</b></span>
                        ${m.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>'}
                      </div>
                      <div class="ds-list-sub">
                        <span>Period: <b>${esc(m.periods?.label || '—')}</b></span>
                        <span>·</span>
                        <span>Weekly avg: ${m.weekly_avg != null ? Math.round(m.weekly_avg) + '%' : '—'}</span>
                      </div>
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button type="button" class="btn sm" data-view-mscore="${m.id}">View</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : emptyState('No monthly scores yet', 'Monthly rollups appear when a month period is scored.')}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Audit log</h3>
            <p class="small muted" style="margin-top:2px">Activity record of administrative and system actions</p>
          </div>
          <span class="tag muted-tag">Last ${(auditRows || []).length} changes</span>
        </div>
        ${(auditRows || []).length ? `
          <div class="ds-list">
            ${auditRows.map(a => {
              const actNice = (a.action || 'action').replace(/_/g, ' ');
              const actTitle = actNice.charAt(0).toUpperCase() + actNice.slice(1);
              const hasDiff = a.old_value || a.new_value;
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-icon">🛡️</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${esc(actTitle)}</span>
                        <span class="tag muted-tag">${esc(a.action)}</span>
                      </div>
                      <div class="ds-list-sub">
                        <span>👤 <b>${esc(nameOf(a.profiles))}</b></span>
                        <span>·</span>
                        <span>🕒 ${fmtDT(a.created_at)}</span>
                        ${a.target ? `<span>·</span><span>Target: <code>${esc(a.target)}</code></span>` : ''}
                      </div>
                      ${hasDiff ? `
                        <div class="ds-list-snippet">
                          <b>Change:</b> ${a.old_value ? esc(a.old_value) : '<span class="muted">None</span>'} → ${a.new_value ? esc(a.new_value) : '<span class="muted">None</span>'}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button type="button" class="btn sm" data-view-audit="${a.id}">View</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : emptyState('No changes recorded yet', 'Score edits, locks and user changes are logged here.')}
      </div>`;

    $('#wt-save').addEventListener('click', async () => {
      const err = $('#wt-error');
      err.classList.remove('show');
      const vals = $$('[data-crit]', v).map(i => ({ key: i.dataset.crit, weight: Number(i.value) }));
      const total = vals.reduce((a, b) => a + (b.weight || 0), 0);
      if (total !== 100) { err.textContent = `Weights must total 100. Currently ${total}.`; err.classList.add('show'); return; }
      for (const c of vals) await sb.from('score_criteria').update({ weight: c.weight }).eq('key', c.key);
      await audit('weights_updated', 'score_criteria', null, total);
      toast('Weights saved.');
    });

    $('#new-period').addEventListener('click', () => {
      window.DS.modal.open(`
        <div class="modal-head">
          <h2>New period</h2>
          <p class="small muted" style="margin-top:4px">Create a weekly or monthly scoring period.</p>
        </div>
        <form id="np-form" novalidate>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="np-type">Type</label><select class="input" id="np-type"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
            <div class="field"><label class="label" for="np-label">Label</label><input class="input" id="np-label" required placeholder="2026-W48"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="np-start">Start date</label><input class="input" id="np-start" type="date" required></div>
            <div class="field"><label class="label" for="np-end">End date</label><input class="input" id="np-end" type="date" required></div>
          </div>
          <div class="modal-actions"><button class="btn primary" type="submit">Create period</button><button class="btn" type="button" id="np-cancel">Cancel</button></div>
        </form>`);
      $('#np-cancel').addEventListener('click', window.DS.modal.close);
      $('#np-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await sb.from('periods').insert({
          type: $('#np-type').value, label: $('#np-label').value.trim(),
          start_date: $('#np-start').value, end_date: $('#np-end').value,
        });
        if (error) return toast(error.message, true);
        await audit('period_created', 'periods:' + $('#np-label').value);
        window.DS.modal.close();
        toast('Period created.');
        window.DS.navigate('scores');
      });
    });

    $$('[data-lock]', v).forEach(b => b.addEventListener('click', async () => {
      const ok = await window.DS.confirmModal({
        title: `Lock ${b.dataset.label}`,
        message: 'Scores in this period become read-only until an admin reopens it. Lock this period now?',
        confirmLabel: 'Lock period',
      });
      if (!ok) return;
      const { error } = await sb.from('periods').update({ locked: true, locked_by: S.user.id, locked_at: new Date().toISOString() }).eq('id', b.dataset.lock);
      if (error) return toast(error.message, true);
      await audit('period_locked', 'periods:' + b.dataset.lock, 'open', 'locked');
      toast('Period locked.');
      window.DS.navigate('scores');
    }));

    $$('[data-unlock]', v).forEach(b => b.addEventListener('click', async () => {
      const { error } = await sb.from('periods').update({ locked: false, locked_by: null, locked_at: null }).eq('id', b.dataset.unlock);
      if (error) return toast(error.message, true);
      await audit('period_reopened', 'periods:' + b.dataset.unlock, 'locked', 'open');
      toast('Period reopened.');
      window.DS.navigate('scores');
    }));

    $('#ws-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#ws-error');
      err.classList.remove('show');
      const periodId = $('#ws-period').value;
      const userId = $('#ws-user').value;
      const crit = {};
      for (const c of (criteria || [])) {
        const raw = ($( `#ws-${c.key}` )?.value || '').trim();
        if (raw === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > c.max_points) {
          err.textContent = `${c.label} must be between 0 and ${c.max_points}.`;
          err.classList.add('show');
          return;
        }
        crit[c.key] = n;
      }
      if (!Object.keys(crit).length) { err.textContent = 'Enter at least one criterion score.'; err.classList.add('show'); return; }
      const { error } = await sb.from('weekly_scores').upsert({
        period_id: periodId, user_id: userId, criterion_scores: crit,
        note: $('#ws-note').value.trim() || null, scored_by: S.user.id, scored_at: new Date().toISOString(),
      }, { onConflict: 'period_id,user_id' });
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      await audit('weekly_score_saved', 'weekly_scores:' + periodId + ':' + userId, null, JSON.stringify(crit));
      await notifyUser(userId, 'score', 'New weekly score posted', 'Your score sheet has been updated.', 'scores');
      window.DS.loadNotifBadge();
      toast('Weekly score saved.');
      window.DS.navigate('scores');
    });

    $$('[data-view-audit]', v).forEach(b => b.addEventListener('click', () => {
      const a = (auditRows || []).find(x => x.id === b.dataset.viewAudit);
      if (!a) return;
      const actNice = (a.action || 'action').replace(/_/g, ' ');
      const actTitle = actNice.charAt(0).toUpperCase() + actNice.slice(1);
      window.DS.showDetailsModal({
        title: `Audit log · ${actTitle}`,
        subtitle: `Recorded on ${fmtDT(a.created_at)}`,
        badgeHtml: `<span class="tag muted-tag">${esc(a.action)}</span>`,
        rows: [
          { label: 'Action performed', value: a.action },
          { label: 'Actor name', value: nameOf(a.profiles) },
          { label: 'Actor ID', value: a.actor_id || '—' },
          { label: 'Date & time', value: fmtDT(a.created_at) },
          { label: 'Target entity', value: a.target || 'None specified' },
          { label: 'Previous value', value: a.old_value || 'None' },
          { label: 'New value', value: a.new_value || 'None' },
          { label: 'Audit record ID', value: a.id },
        ]
      });
    }));

    $$('[data-view-wscore]', v).forEach(b => b.addEventListener('click', () => {
      const s = (weekly || []).find(x => x.id === b.dataset.viewWscore);
      if (!s) return;
      const person = pmap[s.user_id];
      const val = s.manual_override ?? s.weighted_total;
      const rows = [
        { label: 'Member name', value: nameOf(person) },
        { label: 'Period label', value: s.periods?.label || '—' },
        { label: 'Weighted total score', value: `${val}/100` },
        { label: 'Period state', value: s.periods?.locked ? 'Locked' : 'Open' },
        { label: 'Scored at', value: fmtDT(s.scored_at) },
        { label: 'Admin evaluation note', value: s.note || 'No note added' },
      ];
      if (s.criterion_scores && Object.keys(s.criterion_scores).length) {
        rows.push({
          label: 'Criteria breakdown',
          isHtml: true,
          value: Object.entries(s.criterion_scores).map(([k, pts]) => `<div><b>${esc(k)}:</b> ${pts} pts</div>`).join('')
        });
      }
      window.DS.showDetailsModal({
        title: `Weekly score · ${nameOf(person)}`,
        subtitle: `Period ${s.periods?.label || ''}`,
        badgeHtml: `<span class="tag ok"><b>${val}/100</b></span>`,
        rows
      });
    }));

    $$('[data-view-mscore]', v).forEach(b => b.addEventListener('click', () => {
      const m = (monthly || []).find(x => x.id === b.dataset.viewMscore);
      if (!m) return;
      const person = pmap[m.user_id];
      const val = m.final_score ?? m.weekly_avg;
      window.DS.showDetailsModal({
        title: `Monthly score · ${nameOf(person)}`,
        subtitle: `Period ${m.periods?.label || ''}`,
        badgeHtml: `<span class="tag ok"><b>${val != null ? Math.round(val) + '/100' : '—'}</b></span>`,
        rows: [
          { label: 'Member name', value: nameOf(person) },
          { label: 'Month period', value: m.periods?.label || '—' },
          { label: 'Weekly average', value: m.weekly_avg != null ? `${Math.round(m.weekly_avg)}%` : '—' },
          { label: 'Final monthly score', value: m.final_score != null ? `${m.final_score}/100` : '—' },
          { label: 'Period state', value: m.periods?.locked ? 'Locked' : 'Open' },
          { label: 'Scored at', value: fmtDT(m.scored_at) },
        ]
      });
    }));
  };

  /* ============================================================
     CALENDAR & LEAVE (admin)
     ============================================================ */
  window.renderLeaveAdmin = async function (v) {
    const people = await loadPeople();
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const [{ data: leaves }, { data: events }, { data: settings }] = await Promise.all([
      sb.from('leave_requests').select('*').order('created_at', { ascending: false }),
      sb.from('calendar_events').select('*').order('start_at', { ascending: true }).limit(30),
      sb.from('org_settings').select('*').limit(1).maybeSingle(),
    ]);

    v.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Leave requests</h3>
            <p class="small muted" style="margin-top:2px">Time-off requests from team members</p>
          </div>
          <span class="tag muted-tag">${(leaves || []).length} total</span>
        </div>
        ${(leaves || []).length ? `
          <div class="ds-list">
            ${(leaves || []).map(l => {
              const person = pmap[l.user_id];
              const initials = window.DS.getInitials(nameOf(person));
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-avatar">${esc(initials)}</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${esc(nameOf(person))}</span>
                        ${statusTag(l.status)}
                      </div>
                      <div class="ds-list-sub">
                        <span>🌴 <b>${fmtD(l.start_date)} → ${fmtD(l.end_date)}</b></span>
                        <span>·</span>
                        <span>Submitted ${fmtDT(l.created_at)}</span>
                      </div>
                      ${l.reason ? `<div class="ds-list-snippet">Reason: ${esc(l.reason)}</div>` : ''}
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button type="button" class="btn sm" data-view-leave="${l.id}">View</button>
                    ${l.status === 'Pending' ? `
                      <button class="btn sm primary" data-lv="1" data-id="${l.id}" data-who="${l.user_id}">Approve</button>
                      <button class="btn sm alert" data-lv="0" data-id="${l.id}" data-who="${l.user_id}">Decline</button>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : emptyState('No leave requests', 'Requests from members appear here for approval.')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Calendar</h3><button class="btn sm primary" id="add-event">Add holiday or day off</button></div>
        <form id="ev-form" novalidate style="margin-bottom:18px;display:none">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 16px">
            <div class="field"><label class="label" for="ev-title">Title</label><input class="input" id="ev-title" required placeholder="Public holiday"></div>
            <div class="field"><label class="label" for="ev-type">Type</label><select class="input" id="ev-type"><option value="holiday">Holiday</option><option value="custom">Day off</option><option value="meeting">Meeting</option><option value="task_deadline">Task deadline</option></select></div>
            <div class="field"><label class="label" for="ev-start">Starts</label><input class="input" id="ev-start" type="date" required></div>
            <div class="field"><label class="label" for="ev-end">Ends</label><input class="input" id="ev-end" type="date" required></div>
          </div>
          <div style="display:flex;gap:10px"><button class="btn primary" type="submit">Add to calendar</button><button class="btn" type="button" id="ev-cancel">Cancel</button></div>
        </form>
        ${(events || []).length ? `
          <div class="ds-list">
            ${(events || []).map(e => `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">📅</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(e.title)}</span>
                      <span class="tag muted-tag">${esc(e.event_type)}</span>
                    </div>
                    <div class="ds-list-sub">
                      <span>${fmtD(e.start_at)} → ${fmtD(e.end_at)}</span>
                    </div>
                    ${e.description ? `<div class="ds-list-snippet">${esc(e.description)}</div>` : ''}
                  </div>
                </div>
                <div class="ds-list-actions">
                  <button type="button" class="btn sm" data-view-event="${e.id}">View</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : emptyState('No calendar events', 'Add holidays and days off so the team knows when reports are not expected.')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Daily report deadline</h3></div>
        <form id="dl-form" novalidate>
          <div class="field" style="max-width:260px"><label class="label" for="dl-time">Deadline (WAT)</label>
            <input class="input" id="dl-time" type="time" value="${esc((settings?.daily_report_deadline || '18:00:00').slice(0, 5))}"></div>
          <button class="btn primary" type="submit">Save deadline</button>
          <p class="tiny muted" style="margin-top:10px">Submissions after this time are flagged Late for the admin to judge — never penalised automatically.</p>
        </form>
      </div>`;

    const decideLeave = async (leaveId, userId, ok) => {
      const { error } = await sb.from('leave_requests').update({
        status: ok ? 'Approved' : 'Declined', reviewed_by: S.user.id,
      }).eq('id', leaveId);
      if (error) return toast(error.message, true);
      await audit('leave_' + (ok ? 'approved' : 'declined'), 'leave_requests:' + leaveId);
      await notifyUser(userId, 'leave', `Leave ${ok ? 'approved' : 'declined'}`, null, 'leave');
      toast(ok ? 'Leave approved.' : 'Leave declined.', !ok);
      window.DS.navigate('leave');
    };

    $$('[data-view-leave]', v).forEach(b => b.addEventListener('click', () => {
      const l = (leaves || []).find(x => x.id === b.dataset.viewLeave);
      if (!l) return;
      const person = pmap[l.user_id];
      window.DS.showDetailsModal({
        title: `Leave request · ${nameOf(person)}`,
        subtitle: `${fmtD(l.start_date)} → ${fmtD(l.end_date)}`,
        badgeHtml: statusTag(l.status),
        rows: [
          { label: 'Member name', value: nameOf(person) },
          { label: 'Member email', value: person?.email || '—' },
          { label: 'Start date', value: fmtD(l.start_date) },
          { label: 'End date', value: fmtD(l.end_date) },
          { label: 'Reason / note', value: l.reason || 'No reason provided' },
          { label: 'Status', value: l.status },
          { label: 'Submitted on', value: fmtDT(l.created_at) },
        ],
        actions: l.status === 'Pending' ? [
          { label: 'Approve', className: 'primary', onClick: () => decideLeave(l.id, l.user_id, true) },
          { label: 'Decline', className: 'alert', onClick: () => decideLeave(l.id, l.user_id, false) }
        ] : []
      });
    }));

    $$('[data-view-event]', v).forEach(b => b.addEventListener('click', () => {
      const e = (events || []).find(x => x.id === b.dataset.viewEvent);
      if (!e) return;
      window.DS.showDetailsModal({
        title: e.title,
        subtitle: `${fmtD(e.start_at)} → ${fmtD(e.end_at)}`,
        badgeHtml: `<span class="tag muted-tag">${esc(e.event_type || 'Event')}</span>`,
        rows: [
          { label: 'Event title', value: e.title },
          { label: 'Event type', value: e.event_type || 'Holiday' },
          { label: 'Starts', value: fmtD(e.start_at) },
          { label: 'Ends', value: fmtD(e.end_at) },
          { label: 'Description', value: e.description || 'No additional description' },
        ]
      });
    }));

    $$('[data-lv]', v).forEach(b => b.addEventListener('click', () => decideLeave(b.dataset.id, b.dataset.who, b.dataset.lv === '1')));

    $('#add-event').addEventListener('click', () => { $('#ev-form').style.display = 'block'; $('#ev-title').focus(); });
    $('#ev-cancel').addEventListener('click', () => { $('#ev-form').style.display = 'none'; });
    $('#ev-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.from('calendar_events').insert({
        title: $('#ev-title').value.trim(),
        event_type: $('#ev-type').value,
        start_at: new Date($('#ev-start').value + 'T00:00:00').toISOString(),
        end_at: new Date($('#ev-end').value + 'T23:59:00').toISOString(),
        created_by: S.user.id,
      });
      if (error) return toast(error.message, true);
      await audit('calendar_event_created', 'calendar_events:' + $('#ev-title').value);
      toast('Added to the calendar.');
      window.DS.navigate('leave');
    });

    $('#dl-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = $('#dl-time').value;
      if (settings?.id) await sb.from('org_settings').update({ daily_report_deadline: t }).eq('id', settings.id);
      else await sb.from('org_settings').insert({ daily_report_deadline: t });
      await audit('deadline_changed', 'org_settings', settings?.daily_report_deadline || null, t);
      toast('Deadline saved.');
      window.DS.navigate('leave');
    });
  };

  /* ============================================================
     LIBRARY (admin)
     ============================================================ */
  window.renderLibraryAdmin = async function (v) {
    const [people, units] = await Promise.all([loadPeople(), loadUnits()]);
    const { data: items } = await sb.from('library_items').select('*, profiles:added_by(full_name)').order('created_at', { ascending: false });
    const { data: grants } = await sb.from('library_grants').select('*');
    const { data: broken } = await sb.from('notifications').select('*').eq('type', 'broken_link').order('created_at', { ascending: false });
    const itemList = items || [];
    let libPage = 1;
    let libQuery = '';
    let libCat = '';

    const grantText = (id) => {
      const g = (grants || []).filter(x => x.item_id === id);
      if (!g.length) return '<span class="muted">No access granted</span>';
      return g.map(x => {
        if (x.scope === 'everyone') return '<span class="tag ok">Everyone</span>';
        if (x.scope.startsWith('member:')) {
          const p = people.find(pp => pp.id === x.scope.slice(7));
          return `<span class="tag">${esc(nameOf(p))}</span>`;
        }
        if (x.scope.startsWith('unit:')) {
          const u = units.find(uu => uu.id === x.scope.slice(5));
          return `<span class="tag">${esc(u?.name || 'Unit')}</span>`;
        }
        return `<span class="tag">${esc(x.scope)}</span>`;
      }).join(' ');
    };

    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Add a library entry</h3></div>
        <form id="li-form" novalidate>
          <div class="field"><label class="label" for="li-name">Name</label><input class="input" id="li-name" required placeholder="Pricing playbook 2026"></div>
          <div class="field"><label class="label" for="li-url">URL</label><input class="input" id="li-url" type="url" required placeholder="https://docs.google.com/…"></div>
          <div class="field"><label class="label" for="li-desc">Short description</label><input class="input" id="li-desc" placeholder="One line on what it covers"></div>
          <div class="field"><label class="label" for="li-cat">Category</label>
            <select class="input" id="li-cat"><option value="">No category</option>${SECTIONS.map(s => `<option>${s}</option>`).join('')}<option>Playbook</option><option>Template</option></select></div>
          <div class="field"><label class="label" for="li-scope">Grant access to</label>
            <select class="input" id="li-scope">
              <option value="everyone">Everyone</option>
              <optgroup label="Units">${units.map(u => `<option value="unit:${u.id}">${esc(u.name)}</option>`).join('')}</optgroup>
              <optgroup label="Members">${people.map(p => `<option value="member:${p.id}">${esc(nameOf(p))}</option>`).join('')}</optgroup>
            </select></div>
          <div class="error-box hidden" id="li-error" style="margin-bottom:14px"></div>
          <button class="btn primary" type="submit">Add entry</button>
          <p class="tiny muted" style="margin-top:10px">Documents are shared as links only — there is no file upload anywhere in the platform.</p>
        </form>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Library entries</h3>
            <p class="small muted" id="li-count-sub" style="margin-top:2px">${itemList.length} shared document${itemList.length === 1 ? '' : 's'}</p>
          </div>
          <div class="card-head-controls">
            <input class="input" id="li-q" placeholder="Search…" style="min-height:36px;flex:1 1 170px;min-width:140px;width:auto" aria-label="Search library entries">
            <select class="input" id="li-cat-filter" style="min-height:36px;width:auto" aria-label="Filter by category">
              <option value="">All categories</option>${[...new Set(itemList.map(i => i.category).filter(Boolean))].map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="li-body"></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Broken link reports</h3><span class="tag ${(broken || []).length ? 'alert' : 'muted-tag'}">${(broken || []).length} open</span></div>
        ${(broken || []).length ? (broken || []).map(b => `<div class="row">
          <div class="row-main"><div class="t">${esc(b.title)}</div><div class="s">${esc(b.body || '')} · ${fmtDT(b.created_at)}</div></div>
        </div>`).join('') : emptyState('No broken links reported', 'Members can report a dead link from their library view.')}
      </div>
    `;

    function renderLibBody() {
      const filtered = itemList.filter(i => {
        const hay = ((i.title || '') + ' ' + (i.description || '')).toLowerCase();
        return (!libQuery || hay.includes(libQuery)) && (!libCat || (i.category || '') === libCat);
      });
      const pg = window.DS.paginate(filtered, libPage, 25);
      const sub = $('#li-count-sub', v);
      if (sub) sub.textContent = (libQuery || libCat)
        ? `${filtered.length} matching document${filtered.length === 1 ? '' : 's'}`
        : `${itemList.length} shared document${itemList.length === 1 ? '' : 's'}`;

      const body = $('#li-body', v);
      if (!body) return;
      body.innerHTML = pg.items.length ? `
        <div class="ds-list" id="li-list">
          ${pg.items.map(i => {
            const actions = [
              { label: 'View details', icon: '📋', attrs: `data-view-lib="${i.id}"` },
              { label: 'Access permissions', icon: '👥', attrs: `data-grant="${i.id}"` },
              { label: 'Open link ↗', icon: '↗', attrs: `onclick="window.open('${esc(i.url)}', '_blank')"` },
              { divider: true },
              { label: 'Delete entry', icon: '🗑️', isAlert: true, attrs: `data-delitem="${i.id}"` },
            ];
            return `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">📄</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(i.title)}</span>
                      ${i.category ? `<span class="tag muted-tag">${esc(i.category)}</span>` : ''}
                      ${i.broken_link ? '<span class="tag alert">Broken link</span>' : ''}
                    </div>
                    <div class="ds-list-sub">
                      <span>👤 Added by ${esc(nameOf(i.profiles))}</span>
                      <span>·</span>
                      <span>${i.open_count || 0} opens</span>
                      <span>·</span>
                      <span>Access: ${grantText(i.id)}</span>
                    </div>
                    ${i.description ? `<div class="ds-list-snippet">${esc(i.description)}</div>` : ''}
                  </div>
                </div>
                <div class="ds-list-actions">
                  <button type="button" class="btn sm" data-view-lib="${i.id}">View</button>
                  <a class="btn sm ghost" href="${esc(i.url)}" target="_blank" rel="noopener">Open ↗</a>
                  ${window.DS.renderActionMenu(actions)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${pg.renderBar('lib')}
      ` : emptyState((libQuery || libCat) ? 'No matching documents' : 'The library is empty', (libQuery || libCat) ? 'Try clearing the search or category filter.' : 'Add a link above and grant access to the people who need it.');

      $$('[data-view-lib]', body).forEach(b => b.addEventListener('click', () => {
        const item = itemList.find(x => x.id === b.dataset.viewLib);
        if (!item) return;
        window.DS.showDetailsModal({
          title: item.title,
          subtitle: `Library document · ${item.category || 'General'}`,
          badgeHtml: item.broken_link ? '<span class="tag alert">Broken link</span>' : '<span class="tag ok">Active</span>',
          rows: [
            { label: 'Document title', value: item.title },
            { label: 'Category', value: item.category || 'None' },
            { label: 'Description', value: item.description || 'No description provided' },
            { label: 'Link URL', isHtml: true, value: `<a href="${esc(item.url)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(item.url)} ↗</a>` },
            { label: 'Access scope', isHtml: true, value: grantText(item.id) },
            { label: 'Added by', value: nameOf(item.profiles) },
            { label: 'Total opens', value: String(item.open_count || 0) },
            { label: 'Broken link reported', value: item.last_broken_report_at ? fmtDT(item.last_broken_report_at) : 'No broken reports' }
          ],
          actions: [
            { label: 'Open document ↗', className: 'primary', href: item.url },
            { label: 'Access permissions', onClick: () => grantModal(item.id, people, units, grants) }
          ]
        });
      }));
      $$('[data-grant]', body).forEach(b => b.addEventListener('click', () => grantModal(b.dataset.grant, people, units, grants)));
      $$('[data-delitem]', body).forEach(b => b.addEventListener('click', async () => {
        const ok = await window.DS.confirmModal({
          title: 'Delete library entry',
          message: 'Delete this library entry and revoke all access grants for it?',
          confirmLabel: 'Delete entry',
          isAlert: true,
        });
        if (!ok) return;
        await sb.from('library_grants').delete().eq('item_id', b.dataset.delitem);
        await sb.from('library_items').delete().eq('id', b.dataset.delitem);
        await audit('library_item_deleted', 'library_items:' + b.dataset.delitem);
        toast('✓ Entry deleted.', true);
        window.DS.navigate('library');
      }));
      window.DS.initActionMenus(body);
      window.DS.bindPagination(body, (p) => { libPage = p; renderLibBody(); });
    }

    function bindLib() {
      $('#li-q')?.addEventListener('input', (e) => { libQuery = e.target.value.toLowerCase().trim(); libPage = 1; renderLibBody(); });
      $('#li-cat-filter')?.addEventListener('change', (e) => { libCat = e.target.value; libPage = 1; renderLibBody(); });

      $('#li-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#li-error');
        err.classList.remove('show');
        const title = $('#li-name').value.trim();
        const url = $('#li-url').value.trim();
        if (!title || !url) { err.textContent = 'Name and URL are required.'; err.classList.add('show'); return; }
        const { data: created, error } = await sb.from('library_items').insert({
          title, url, description: $('#li-desc').value.trim() || null,
          category: $('#li-cat').value || null, added_by: S.user.id,
        }).select().single();
        if (error) { err.textContent = error.message; err.classList.add('show'); return; }
        await sb.from('library_grants').insert({ item_id: created.id, scope: $('#li-scope').value });
        await audit('library_item_created', 'library_items:' + created.id, null, title);
        toast('✓ Library entry added.');
        window.DS.navigate('library');
      });
    }

    renderLibBody();
    bindLib();
  };

  function grantModal(itemId, people, units, grants) {
    const mine = (grants || []).filter(g => g.item_id === itemId);
    window.DS.modal.open(`
      <h2 style="margin-bottom:6px">Who can open this link</h2>
      <p class="muted small" style="margin-bottom:16px">Grant to everyone, a unit, or individual members.</p>
      <form id="gr-form" novalidate>
        <div class="field"><label class="label" for="gr-scope">Add access</label>
          <select class="input" id="gr-scope">
            <option value="everyone">Everyone</option>
            <optgroup label="Units">${units.map(u => `<option value="unit:${u.id}">${esc(u.name)}</option>`).join('')}</optgroup>
            <optgroup label="Members">${people.map(p => `<option value="member:${p.id}">${esc(nameOf(p))}</option>`).join('')}</optgroup>
          </select></div>
        <button class="btn primary" type="submit" style="width:100%;margin-bottom:18px">Grant access</button>
        <span class="label">Current access</span>
        ${mine.length ? mine.map(g => `<div class="row" style="padding:8px 0"><div class="row-main"><div class="t" style="font-size:13px">${esc(g.scope)}</div></div>
          <button class="btn sm ghost" data-rmgrant="${g.id}" aria-label="Remove access">Remove</button></div>`).join('')
        : '<div class="small muted">No access granted yet.</div>'}
        <div style="display:flex;gap:10px;margin-top:16px"><button class="btn" style="flex:1" type="button" id="gr-done">Done</button></div>
      </form>`);
    $('#gr-done').addEventListener('click', window.DS.modal.close);
    $('#gr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.from('library_grants').insert({ item_id: itemId, scope: $('#gr-scope').value });
      if (error) return toast(error.message, true);
      await audit('library_grant_added', 'library_items:' + itemId, null, $('#gr-scope').value);
      window.DS.modal.close();
      toast('Access granted.');
      window.DS.navigate('library');
    });
    $$('[data-rmgrant]').forEach(b => b.addEventListener('click', async () => {
      await sb.from('library_grants').delete().eq('id', b.dataset.rmgrant);
      window.DS.modal.close();
      toast('Access removed.');
      window.DS.navigate('library');
    }));
  }

  /* ============================================================
     CHANNELS (admin) — announcements + channel creation
     ============================================================ */
  window.renderChannelsAdmin = async function (v) {
    if (window.DS && window.DS.renderChannelsWorkspace) {
      await window.DS.renderChannelsWorkspace(v, { isAdmin: true });
    }
  };

  /* ============================================================
     ADMIN-ONLY ROUTES
     Shared routes (tasks, units, meetings, ideas, scores, library,
     leave, channels, dashboard) are registered once in ds.member.js
     and dispatch on the active role, so the role switcher works
     on every screen. Only admin-exclusive routes live here.
     ============================================================ */
  window.DS.registerRoute('calendar', {
    title: 'Calendar & leave', sub: 'Months, weeks, holidays, days off, leave approvals',
    render: async (v) => { await window.renderLeaveAdmin(v); },
  });
})();
