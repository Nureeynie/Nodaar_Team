/* Nodaar DS — member screens + shared screens (notifications, profile) */
(function () {
  const { $, $$, esc, S, sb } = window.DS;
  const { todayLagos, fmtDT, fmtD } = window.DS.fmt;
  const { isAdmin } = window.DS.auth;
  const toast = window.DS.toast;

  const SECTIONS = ['Operations','Team','Reseller','Supplier','Customers','Social Media','Logistics','Finance','Mission and Vision','Research','Product/App','Others'];

  // small bordered status tag, matching the admin side
  function statusTagLocal(s) {
    const t = String(s || '');
    const cls = ['Rejected','Dismissed','Declined'].includes(t) ? 'alert'
      : ['Approved','Done','Implemented','Scored','Resolved'].includes(t) ? 'ok'
      : ['Submitted','Open','In progress','In Progress','In review','In Review'].includes(t) ? '' : 'muted-tag';
    return `<span class="tag ${cls}">${esc(t || '—')}</span>`;
  }

  async function myUnits() {
    const { data } = await sb.from('unit_members').select('*, units:unit_id(*), positions:position_id(*)').eq('user_id', S.user.id);
    return data || [];
  }

  // ── DASHBOARD ──
  window.DS.registerRoute('dashboard', {
    get title() { return isAdmin() ? 'Admin dashboard' : 'Dashboard'; },
    get sub() { return isAdmin() ? 'Team overview and what needs attention' : 'Your day at a glance'; },
    get action() {
      if (isAdmin()) return '';
      return `<button class="btn primary" data-goto="report">Write today's report</button>`;
    },
    render: async (v) => { isAdmin() ? await window.renderAdminDashboard(v) : await window.renderMemberDashboard(v); bindGoto(v); },
  });
  function bindGoto(v) {
    $('[data-goto]', v)?.addEventListener('click', () => window.DS.navigate('report'));
    $('#page-action [data-goto]')?.addEventListener('click', () => window.DS.navigate('report'));
  }

  window.renderMemberDashboard = async function (v) {
    const date = todayLagos();
    const draftKey = `nodaar_draft_report_${S.user.id}_${date}`;
    const rawDraft = localStorage.getItem(draftKey);
    const draft = rawDraft ? JSON.parse(rawDraft) : null;

    const [{ data: report }, { data: tasks }, units, { data: fb }, { data: scores }, { data: ann }, { data: pastReports }] = await Promise.all([
      sb.from('daily_reports').select('*').eq('user_id', S.user.id).eq('report_date', date).maybeSingle(),
      sb.from('tasks').select('*, task_assignees!inner(user_id)').eq('task_assignees.user_id', S.user.id).order('due_date'),
      myUnits(),
      sb.from('weekly_feedback').select('*, periods:period_id(label)').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(4),
      sb.from('weekly_scores').select('*, periods:period_id(label)').eq('user_id', S.user.id).order('scored_at', { ascending: false }).limit(4),
      sb.from('channels').select('id').eq('kind', 'announcements').maybeSingle(),
      sb.from('daily_reports').select('*').eq('user_id', S.user.id).order('report_date', { ascending: false }).limit(4),
    ]);
    const openTasks = (tasks || []).filter(t => t.status !== 'Done');
    const overdue = openTasks.filter(t => t.due_date && t.due_date < date);
    let annPosts = [];
    if (ann?.id) { const { data } = await sb.from('channel_updates').select('title, body, created_at, author_id').eq('channel_id', ann.id).in('status', ['published', 'Published']).order('created_at', { ascending: false }).limit(3); annPosts = data || []; }

    // headline score: weekly score when available, else the latest scored report
    const latestScoredReport = await sb.from('daily_reports').select('score').eq('user_id', S.user.id).not('score', 'is', null).order('report_date', { ascending: false }).limit(1).maybeSingle();
    const headlineScore = scores?.[0]
      ? (scores[0].manual_override ?? scores[0].weighted_total)
      : (latestScoredReport?.score != null ? latestScoredReport.score : null);

    // Format today's report status tag
    let reportTag = '<span class="tag muted-tag">Not submitted</span>';
    if (report) {
      if (report.status === 'Approved') {
        reportTag = `<span class="status-pill approved">✓ Approved${report.score != null ? ' · ' + report.score + '/100' : ''}</span>`;
      } else if (report.status === 'Rejected') {
        reportTag = `<span class="status-pill rejected">✕ Resubmission needed</span>`;
      } else if (report.status === 'Submitted') {
        reportTag = `<span class="status-pill submitted">⏳ Submitted (Under review)</span>`;
      } else {
        reportTag = `<span class="tag ok">${esc(report.status)}</span>`;
      }
    } else if (draft) {
      reportTag = `<span class="status-pill draft">📝 Draft saved (${esc(draft.savedAt || 'in progress')})</span>`;
    }

    v.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${report ? (report.status === 'Approved' ? 'Approved' : report.is_late ? 'Late' : 'Submitted') : (draft ? 'Draft' : '—')}</div><div class="cap">Today's report</div></div>
        <div class="stat"><div class="num">${openTasks.length}</div><div class="cap">Open tasks</div></div>
        <div class="stat"><div class="num ${overdue.length ? 'alert-text' : ''}">${overdue.length}</div><div class="cap">Overdue</div></div>
        <div class="stat"><div class="num">${headlineScore != null ? headlineScore + '%' : '—'}</div><div class="cap">Latest score</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Today's daily report — ${fmtD(date)}</h3>
            <p class="small muted" style="margin-top:2px">Daily scrum reflection & admin approval status</p>
          </div>
          <div>${reportTag}</div>
        </div>
        ${report ? `
          <div style="background:var(--bg);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:14px;margin-bottom:14px">
            <dl class="kv" style="margin:0">
              <dt>Status</dt><dd><b>${esc(report.status)}</b>${report.score != null ? ` · Score: <b style="color:var(--ok)">${report.score}/100</b>` : ''}${report.is_late ? ` · <span class="alert-text">Late by ${report.late_minutes}m</span>` : ' · <span style="color:var(--ok)">On time</span>'}</dd>
              <dt>Submitted</dt><dd>${fmtDT(report.submitted_at)}</dd>
              <dt>Yesterday</dt><dd>${esc(report.did_yesterday || '—')}</dd>
              <dt>Today</dt><dd>${esc(report.doing_today || '—')}</dd>
              ${report.blockers ? `<dt>Blockers</dt><dd><span class="alert-text">${esc(report.blockers)}</span></dd>` : ''}
              ${report.evidence_url ? `<dt>Evidence</dt><dd><a href="${esc(report.evidence_url)}" target="_blank" rel="noopener">Open link</a></dd>` : ''}
              ${report.review_note ? `<dt>Admin Note</dt><dd><b style="color:${report.status === 'Approved' ? 'var(--ok)' : 'var(--alert)'}">${esc(report.review_note)}</b></dd>` : ''}
            </dl>
          </div>
        ` : (draft ? `
          <div class="draft-card">
            <div>
              <div style="font-weight:700;font-size:13.5px">📝 You have an unsaved draft saved at ${esc(draft.savedAt || '')}</div>
              <div class="small muted" style="margin-top:3px">${esc(draft.doing_today || draft.did_yesterday || 'Draft contents ready to review and submit.')}</div>
            </div>
            <button class="btn primary sm" data-goto="report">Resume draft</button>
          </div>
        ` : `<p class="muted small" style="margin-bottom:12px">You have not submitted today's daily scrum report yet. The deadline is 18:00 WAT.</p>`)}
        <div><button class="btn ${report ? '' : 'primary'}" data-goto="report">${report ? 'Edit / resubmit report' : "Write today's report"}</button></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Recent submission records</h3>
            <p class="small muted" style="margin-top:2px">Your latest daily reports and scores</p>
          </div>
          <button class="btn sm ghost" data-goto="report">View all records</button>
        </div>
        ${(pastReports && pastReports.length) ? `
          <div class="ds-list">
            ${pastReports.map(r => `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">📅</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${fmtD(r.report_date)}${r.is_late ? ' <span class="tag alert">Late</span>' : ''}</span>
                      ${r.status === 'Approved' ? `<span class="status-pill approved">✓ Approved</span>` :
                        r.status === 'Rejected' ? `<span class="status-pill rejected">✕ Resubmit</span>` :
                        `<span class="status-pill submitted">⏳ ${esc(r.status)}</span>`}
                      ${r.score != null ? `<span class="tag ok"><b>${r.score}/100</b></span>` : '<span class="tag muted-tag">Pending</span>'}
                    </div>
                    <div class="ds-list-sub">
                      Submitted ${fmtDT(r.submitted_at)}${r.mood ? ` · Mood ${r.mood}/5` : ''}
                    </div>
                    ${(r.doing_today || r.review_note) ? `
                      <div class="ds-list-snippet">
                        ${r.doing_today ? `<b>Plan:</b> ${esc(r.doing_today.slice(0, 100))}${r.doing_today.length > 100 ? '…' : ''}` : ''}
                        ${r.review_note ? `${r.doing_today ? ' · ' : ''}<b>Feedback:</b> ${esc(r.review_note)}` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>
                <div class="ds-list-actions">
                  <button type="button" class="btn sm" data-dash-view-rep="${r.id}">View</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="empty" style="padding:20px"><div class="hint">No submission records yet. Submit your daily scrum to see records here.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>My tasks</h3><button class="btn sm ghost" data-goto="tasks">View all</button></div>
        ${openTasks.length ? openTasks.slice(0, 5).map(t => `
          <div class="row"><div class="row-main">
            <div class="t" style="word-break:normal;overflow-wrap:break-word">${esc(t.title)} ${t.due_date && t.due_date < date ? '<span class="tag alert">Overdue</span>' : ''}</div>
            <div class="s">${esc(t.status || 'To do')} · due ${fmtD(t.due_date)}${t.priority ? ' · ' + esc(t.priority) : ''}</div>
          </div>
          <button type="button" class="btn sm ghost" data-dash-view-task="${t.id}" style="padding:2px 8px;font-size:12px">View</button>
          </div>`).join('') : `<div class="empty" style="padding:20px"><div class="hint">No open tasks. Nice.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>This week — idea & problem</h3><button class="btn sm ghost" data-goto="ideas">Open</button></div>
        ${(fb && fb.length) ? fb.map(f => `<div class="row"><div class="row-main"><div class="t" style="word-break:normal;overflow-wrap:break-word">${f.type === 'idea' ? '💡 Idea' : '⚠️ Problem'} · ${esc(f.periods?.label || '')}</div><div class="s" style="word-break:normal;overflow-wrap:break-word">${esc(f.content).slice(0, 90)}…</div></div>
          <span class="tag ${f.status === 'Rejected' || f.status === 'Dismissed' ? 'alert' : f.status === 'Open' ? 'muted-tag' : 'ok'}" style="white-space:nowrap">${f.status}</span>
          <button type="button" class="btn sm ghost" data-dash-view-fb="${f.id}" style="padding:2px 8px;font-size:12px">View</button>
        </div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">Submit one idea and one problem this week.</div><button class="btn sm" data-goto="ideas">Add now</button></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>My units & OKRs</h3><button class="btn sm ghost" data-goto="units">View all</button></div>
        ${units.length ? units.map(u => `<div class="row"><div class="row-main"><div class="t" style="word-break:normal;overflow-wrap:break-word">${esc(u.units?.name || 'Unit')}</div><div class="s">Role: ${esc(u.positions?.title || 'Member')}</div></div></div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">You are not in a unit yet.</div></div>`}
      </div>

      ${annPosts.length ? `<div class="card"><div class="card-head"><h3>Announcements</h3></div>
        ${annPosts.map(a => `<div class="row"><div class="row-main"><div class="t" style="word-break:normal;overflow-wrap:break-word">${esc(a.title || 'Announcement')}</div><div class="s" style="word-break:normal;overflow-wrap:break-word">${esc((a.body || '').slice(0, 100))} · ${fmtDT(a.created_at)}</div></div></div>`).join('')}</div>` : ''}
    `;

    $$('[data-dash-view-rep]', v).forEach(b => b.addEventListener('click', () => {
      const r = (pastReports || []).find(x => x.id === b.dataset.dashViewRep);
      if (!r) return;
      window.DS.showDetailsModal({
        title: `Daily Scrum — ${fmtD(r.report_date)}`,
        subtitle: `Submitted ${fmtDT(r.submitted_at)}${r.is_late ? ` · Late by ${r.late_minutes}m` : ''}`,
        badgeHtml: r.status === 'Approved' ? '<span class="status-pill approved">✓ Approved</span>' :
                   r.status === 'Rejected' ? '<span class="status-pill rejected">✕ Resubmit</span>' :
                   `<span class="status-pill submitted">⏳ ${esc(r.status)}</span>`,
        rows: [
          { label: 'Date', value: fmtD(r.report_date) },
          { label: 'Status', value: r.status },
          { label: 'Score', isHtml: true, value: r.score != null ? `<b style="color:var(--ok);font-size:16px">${r.score}/100</b>` : '<span class="muted">Pending review</span>' },
          { label: 'Yesterday', value: r.did_yesterday || '—' },
          { label: 'Today', value: r.doing_today || '—' },
          { label: 'Blockers', value: r.blockers || 'None reported' },
          { label: 'Evidence link', isHtml: true, value: r.evidence_url ? `<a href="${esc(r.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost">Open drive link ↗</a>` : 'None' },
          { label: 'Admin feedback', isHtml: true, value: r.review_note ? `<b style="color:var(--ok)">${esc(r.review_note)}</b>` : 'None' },
        ],
        actions: [
          r.evidence_url ? `<a class="btn sm" href="${esc(r.evidence_url)}" target="_blank" rel="noopener">Open link ↗</a>` : ''
        ]
      });
    }));

    $$('[data-dash-view-task]', v).forEach(b => b.addEventListener('click', () => {
      const t = (openTasks || []).find(x => x.id === b.dataset.dashViewTask);
      if (!t) return;
      window.DS.showDetailsModal({
        title: t.title,
        subtitle: `Due ${t.due_date ? fmtD(t.due_date) : 'No due date'}`,
        badgeHtml: `<span class="tag ${t.status === 'Done' ? 'ok' : 'muted-tag'}">${esc(t.status || 'To do')}</span>`,
        rows: [
          { label: 'Title', value: t.title },
          { label: 'Description', value: t.description || 'No description' },
          { label: 'Status', value: t.status || 'To do' },
          { label: 'Priority', value: t.priority || 'Normal' },
          { label: 'Due date', isHtml: true, value: t.due_date ? fmtD(t.due_date) : '—' },
          { label: 'Evidence link', isHtml: true, value: t.evidence_url ? `<a href="${esc(t.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost">Open evidence ↗</a>` : 'None' }
        ],
        actions: [
          t.evidence_url ? `<a class="btn sm" href="${esc(t.evidence_url)}" target="_blank" rel="noopener">Open evidence ↗</a>` : ''
        ]
      });
    }));

    $$('[data-dash-view-fb]', v).forEach(b => b.addEventListener('click', () => {
      const f = (fb || []).find(x => x.id === b.dataset.dashViewFb);
      if (!f) return;
      window.DS.showDetailsModal({
        title: `${f.type === 'idea' ? '💡 Weekly Idea' : '⚠️ Weekly Problem'}`,
        subtitle: `Period: ${esc(f.periods?.label || 'General')}`,
        badgeHtml: `<span class="tag ${f.status === 'Approved' ? 'ok' : f.status === 'Rejected' ? 'alert' : 'muted-tag'}">${f.status}</span>`,
        rows: [
          { label: 'Type', value: f.type === 'idea' ? 'Idea' : 'Problem' },
          { label: 'Period', value: f.periods?.label || 'Weekly' },
          { label: 'Content', value: f.content || '—' },
          { label: 'Severity', value: f.severity || '—' },
          { label: 'Status', value: f.status },
          { label: 'Admin response', value: f.admin_note || 'No notes yet' }
        ]
      });
    }));
    $$('[data-goto]', v).forEach(b => b.addEventListener('click', () => window.DS.navigate(b.dataset.goto)));
  };

  // ── DAILY REPORT ──
  window.DS.registerRoute('report', {
    title: 'Daily report', sub: 'What you did yesterday, what you will do today, blockers',
    get action() { return `<span class="tag muted-tag">Deadline <span id="dl-tag">18:00</span> WAT</span>`; },
    render: async (v) => {
      const date = todayLagos();
      const draftKey = `nodaar_draft_report_${S.user.id}_${date}`;
      const rawDraft = localStorage.getItem(draftKey);
      const draft = rawDraft ? JSON.parse(rawDraft) : null;

      const [{ data: existing }, { data: settings }, { data: records }] = await Promise.all([
        sb.from('daily_reports').select('*').eq('user_id', S.user.id).eq('report_date', date).maybeSingle(),
        sb.from('org_settings').select('daily_report_deadline').limit(1).maybeSingle(),
        sb.from('daily_reports').select('*').eq('user_id', S.user.id).order('report_date', { ascending: false }),
      ]);
      const dl = (settings?.daily_report_deadline || '18:00:00').slice(0, 5);
      const editable = !existing || existing.status === 'Submitted' || existing.status === 'Rejected';
      let recordsPage = 1;
      const myRecords = records || [];

      function renderReportView() {
        const pg = window.DS.paginate(myRecords, recordsPage, 25);
        v.innerHTML = `
          ${(!existing && draft) ? `
            <div class="draft-card" id="dr-draft-notice">
              <div>
                <div style="font-weight:700">📝 You have an unsaved draft from ${esc(draft.savedAt || 'earlier')}</div>
                <div class="small muted">You can resume editing your draft or discard it.</div>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn sm" type="button" id="dr-restore-btn">Load draft</button>
                <button class="btn sm ghost alert" type="button" id="dr-discard-btn">Discard draft</button>
              </div>
            </div>
          ` : ''}

          <div class="card">
            <div class="card-head">
              <div>
                <h3>Daily scrum — ${fmtD(date)}</h3>
                <p class="small muted" style="margin-top:2px">Submit what you accomplished yesterday and your priorities for today.</p>
              </div>
              ${existing ? `
                <span class="status-pill ${existing.status === 'Approved' ? 'approved' : existing.status === 'Rejected' ? 'rejected' : 'submitted'}">
                  ${existing.status === 'Approved' ? '✓ Approved' : existing.status === 'Rejected' ? '✕ Resubmit' : '⏳ ' + existing.status}${existing.score != null ? ' · ' + existing.score + '/100' : ''}${existing.is_late ? ' · Late ' + existing.late_minutes + ' min' : ''}
                </span>` : (draft ? '<span class="status-pill draft">📝 Draft in progress</span>' : '<span class="tag muted-tag">Not submitted</span>')}
            </div>
            ${existing ? `
              <div style="background:var(--bg);padding:10px 14px;border-radius:var(--r-sm);border:1px solid var(--line-soft);margin-bottom:16px">
                <span class="small muted">Submitted ${fmtDT(existing.submitted_at)}</span>
                ${existing.review_note ? `<div style="margin-top:4px;font-size:13px;font-weight:600;color:${existing.status === 'Approved' ? 'var(--ok)' : 'var(--alert)'}">Admin feedback: ${esc(existing.review_note)}</div>` : ''}
                ${existing.score != null ? `<div style="margin-top:2px;font-size:13px;font-weight:700">Score awarded: <span style="color:var(--ok)">${existing.score}/100</span></div>` : ''}
              </div>
            ` : ''}
            <div class="error-box hidden" id="dr-error" style="margin-bottom:14px"></div>
            <form id="dr-form" novalidate>
              <div class="field">
                <label class="label" for="dr-done">What I did yesterday <span class="muted" style="text-transform:none;font-weight:normal">(bullet points or summary)</span></label>
                <textarea class="input" id="dr-done" required ${editable ? '' : 'disabled'} placeholder="• Completed feature X&#10;• Met with client Y">${esc(initDone)}</textarea>
              </div>
              <div class="field">
                <label class="label" for="dr-plan">What I will do today <span class="muted" style="text-transform:none;font-weight:normal">(main commitments)</span></label>
                <textarea class="input" id="dr-plan" required ${editable ? '' : 'disabled'} placeholder="• Deliver proposal draft&#10;• Fix UI bugs">${esc(initPlan)}</textarea>
              </div>
              <div class="field">
                <label class="label" for="dr-block">Blockers (optional)</label>
                <input class="input" id="dr-block" ${editable ? '' : 'disabled'} value="${esc(initBlock)}" placeholder="Anything preventing you from completing your work?">
              </div>
              <div class="field">
                <label class="label" for="dr-ev">Evidence link (URL)</label>
                <input class="input" id="dr-ev" type="url" ${editable ? '' : 'disabled'} value="${esc(initEv)}" placeholder="https://docs.google.com/…">
              </div>
              ${editable ? `
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
                  <button class="btn primary" type="submit" style="flex:2;min-width:180px">${existing && (existing.status === 'Rejected') ? 'Resubmit report' : existing ? 'Update report' : 'Submit report'}</button>
                  <button class="btn" type="button" id="dr-save-draft-btn" style="flex:1;min-width:140px">Save draft</button>
                </div>
              ` : `<p class="small muted" style="padding:10px 0">${existing ? 'Under review by admin — not editable until response.' : 'Already submitted.'}</p>`}
            </form>
          </div>

          <div class="card" style="margin-top:24px">
            <div class="card-head">
              <div>
                <h3>My submission records</h3>
                <p class="small muted" style="margin-top:2px">All historical daily scrum submissions, scores and admin feedback</p>
              </div>
              <span class="tag muted-tag">${pg.curPage} / ${pg.totalPages}</span>
            </div>
            ${pg.items.length ? `
              <div class="ds-list">
                ${pg.items.map(r => {
                  const actions = [
                    { label: 'View full report', icon: '📄', attrs: `data-view-rep="${r.id}"` },
                    { divider: true },
                    (r.status === 'Submitted' || r.status === 'Rejected')
                      ? { label: 'Edit in form', icon: '✏️', attrs: `data-fill-rep="${r.id}"` }
                      : null,
                    r.evidence_url ? { label: 'Open evidence link', icon: '↗', attrs: `onclick="window.open('${esc(r.evidence_url)}', '_blank')"` } : null,
                    isAdmin() ? { divider: true } : null,
                    isAdmin() ? { label: 'Delete record', icon: '🗑️', isAlert: true, attrs: `data-del-rep="${r.id}"` } : null,
                  ];
                  return `
                    <div class="ds-list-card">
                      <div class="ds-list-main">
                        <div class="ds-list-icon">📅</div>
                        <div class="ds-list-content">
                          <div class="ds-list-title-row">
                            <span class="ds-list-title">${fmtD(r.report_date)}${r.is_late ? ` <span class="tag alert" style="font-size:10px;padding:1px 6px">Late by ${r.late_minutes}m</span>` : ''}</span>
                            ${r.status === 'Approved' ? `<span class="status-pill approved">✓ Approved</span>` :
                              r.status === 'Rejected' ? `<span class="status-pill rejected">✕ Resubmit</span>` :
                              `<span class="status-pill submitted">⏳ ${esc(r.status)}</span>`}
                            ${r.score != null ? `<span class="tag ok"><b>Score: ${r.score}/100</b></span>` : '<span class="tag muted-tag">Pending score</span>'}
                            ${r.mood ? `<span class="tag muted-tag">Mood ${r.mood}/5</span>` : ''}
                          </div>
                          <div class="ds-list-sub">
                            Submitted ${fmtDT(r.submitted_at)}${r.evidence_url ? ` · <a href="${esc(r.evidence_url)}" target="_blank" rel="noopener">Evidence link ↗</a>` : ''}
                          </div>
                          ${(r.doing_today || r.review_note) ? `
                            <div class="ds-list-snippet">
                              ${r.doing_today ? `<b>Today:</b> ${esc(r.doing_today.slice(0, 110))}${r.doing_today.length > 110 ? '…' : ''}` : ''}
                              ${r.review_note ? `${r.doing_today ? ' · ' : ''}<b>Feedback:</b> ${esc(r.review_note)}` : ''}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                      <div class="ds-list-actions">
                        <button type="button" class="btn sm" data-view-rep="${r.id}">View</button>
                        ${window.DS.renderActionMenu(actions)}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              ${pg.renderBar('records')}
            ` : `<div class="empty"><div class="big">No submission records yet</div><div class="hint">Your daily scrum records will appear here as you submit them.</div></div>`}
          </div>
        `;

        $('#dl-tag') && ($('#dl-tag').textContent = dl);
        bindReportHandlers();
        window.DS.initActionMenus(v);
        window.DS.bindPagination(v, (p) => {
          recordsPage = p;
          renderReportView();
        });
      }

      function bindReportHandlers() {
        const saveDraftBtn = $('#dr-save-draft-btn');
        saveDraftBtn?.addEventListener('click', () => {
          const done = $('#dr-done').value.trim();
          const plan = $('#dr-plan').value.trim();
          const block = $('#dr-block').value.trim();
          const ev = $('#dr-ev').value.trim();
          if (!done && !plan) {
            toast('Please type something before saving as draft.', true);
            return;
          }
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          localStorage.setItem(draftKey, JSON.stringify({
            did_yesterday: done,
            doing_today: plan,
            blockers: block,
            evidence_url: ev,
            savedAt: timeStr,
          }));
          toast('✓ Draft saved');
          window.DS.navigate('report');
        });

        const restoreBtn = $('#dr-restore-btn');
        restoreBtn?.addEventListener('click', () => {
          if (!draft) return;
          $('#dr-done').value = draft.did_yesterday || '';
          $('#dr-plan').value = draft.doing_today || '';
          $('#dr-block').value = draft.blockers || '';
          $('#dr-ev').value = draft.evidence_url || '';
          toast('✓ Draft restored');
        });

        const discardBtn = $('#dr-discard-btn');
        discardBtn?.addEventListener('click', () => {
          if (!confirm('Discard this saved draft?')) return;
          localStorage.removeItem(draftKey);
          toast('Draft discarded');
          window.DS.navigate('report');
        });

        const openReportModal = (repId) => {
          const r = myRecords.find(item => item.id === repId);
          if (!r) return;
          window.DS.showDetailsModal({
            title: `Daily Scrum — ${fmtD(r.report_date)}`,
            subtitle: `Submitted ${fmtDT(r.submitted_at)}${r.is_late ? ` · Late by ${r.late_minutes}m` : ''}`,
            badgeHtml: r.status === 'Approved' ? '<span class="status-pill approved">✓ Approved</span>' :
                       r.status === 'Rejected' ? '<span class="status-pill rejected">✕ Resubmit</span>' :
                       `<span class="status-pill submitted">⏳ ${esc(r.status)}</span>`,
            rows: [
              { label: 'Report date', value: fmtD(r.report_date) },
              { label: 'Status', value: r.status },
              { label: 'Score', isHtml: true, value: r.score != null ? `<b style="color:var(--ok);font-size:16px">${r.score}/100</b>` : '<span class="muted">Pending review</span>' },
              { label: 'Mood / Morale', value: r.mood ? `${r.mood}/5` : '—' },
              { label: 'Yesterday', value: r.did_yesterday || '—' },
              { label: 'Today', value: r.doing_today || '—' },
              { label: 'Blockers', value: r.blockers || 'None reported' },
              { label: 'Evidence link', isHtml: true, value: r.evidence_url ? `<a href="${esc(r.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost" style="padding:2px 8px;font-size:12px">Open drive link ↗</a>` : '<span class="muted">None attached</span>' },
              { label: 'Admin feedback', isHtml: true, value: r.review_note ? `<b style="color:${r.status === 'Approved' ? 'var(--ok)' : r.status === 'Rejected' ? 'var(--alert)' : 'var(--ink)'}">${esc(r.review_note)}</b>` : '<span class="muted">No feedback yet</span>' },
            ],
            actions: [
              (r.status === 'Submitted' || r.status === 'Rejected')
                ? `<button class="btn sm primary" data-fill-rep="${r.id}" onclick="window.DS.modal.close()">Edit in form</button>`
                : '',
              r.evidence_url ? `<a class="btn sm" href="${esc(r.evidence_url)}" target="_blank" rel="noopener">Open drive link ↗</a>` : '',
              isAdmin() ? `<button class="btn sm alert" data-del-rep="${r.id}" onclick="window.DS.modal.close()">Delete report</button>` : ''
            ]
          });
          const m = document.getElementById('modal-box');
          if (m) {
            m.querySelector(`[data-fill-rep="${r.id}"]`)?.addEventListener('click', () => {
              $('#dr-done').value = r.did_yesterday || '';
              $('#dr-plan').value = r.doing_today || '';
              $('#dr-block').value = r.blockers || '';
              $('#dr-ev').value = r.evidence_url || '';
              $('#dr-done').focus();
              toast('Loaded report into form.');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            });
          }
        };

        $$('[data-view-rep]', v).forEach(b => b.addEventListener('click', () => openReportModal(b.dataset.viewRep)));

        // Edit past report handler
        $$('[data-fill-rep]', v).forEach(b => b.addEventListener('click', () => {
          const r = myRecords.find(item => item.id === b.dataset.fillRep);
          if (r) {
            $('#dr-done').value = r.did_yesterday || '';
            $('#dr-plan').value = r.doing_today || '';
            $('#dr-block').value = r.blockers || '';
            $('#dr-ev').value = r.evidence_url || '';
            $('#dr-done').focus();
            toast('Loaded report into form.');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }));

        // Admin delete report submission action
        $$('[data-del-rep]', v).forEach(b => b.addEventListener('click', async () => {
          if (!confirm('Are you sure you want to delete this daily report submission?')) return;
          b.disabled = true;
          const { error } = await sb.from('daily_reports').delete().eq('id', b.dataset.delRep);
          if (error) { toast(error.message, true); b.disabled = false; return; }
          toast('✓ Report deleted');
          window.DS.navigate('report');
        }));

        // Submit Form
        const form = $('#dr-form');
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const err = $('#dr-error');
          err.classList.remove('show');
          const doneVal = $('#dr-done').value.trim();
          const planVal = $('#dr-plan').value.trim();
          if (!doneVal || !planVal) {
            err.textContent = 'Both "What I did yesterday" and "What I will do today" are required.';
            err.classList.add('show');
            return;
          }
          const now = new Date();
          const lagos = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
          const [h, m] = dl.split(':').map(Number);
          const deadline = new Date(lagos); deadline.setHours(h, m, 0, 0);
          const isLate = lagos > deadline;
          const lateMinutes = isLate ? Math.round((lagos - deadline) / 60000) : 0;
          const { error } = await sb.from('daily_reports').upsert({
            user_id: S.user.id, report_date: date,
            did_yesterday: doneVal,
            doing_today: planVal,
            blockers: $('#dr-block').value.trim() || null,
            evidence_url: $('#dr-ev').value.trim() || null,
            submitted_at: now.toISOString(), is_late: isLate, late_minutes: lateMinutes, status: 'Submitted',
          }, { onConflict: 'user_id,report_date' });
          if (error) { err.textContent = error.message; err.classList.add('show'); return; }
          localStorage.removeItem(draftKey);
          toast(isLate ? `✓ Submitted — late by ${lateMinutes} min` : '✓ Report submitted', isLate);
          window.DS.navigate('report');
        });
      }

      renderReportView();
    },
  });

  // ── MY TASKS ──
  window.DS.registerRoute('tasks', {
    get title() { return isAdmin() ? 'Tasks & OKRs' : 'My tasks'; },
    get sub() { return isAdmin() ? 'Create, assign, link to key results' : 'Status, priority, due date, evidence'; },
    render: async (v) => { isAdmin() ? await window.renderTasksAdmin(v) : await window.renderMyTasks(v); },
  });

  window.renderMyTasks = async function (v) {
    const { data } = await sb.from('tasks').select('*, task_assignees!inner(user_id)').eq('task_assignees.user_id', S.user.id).order('due_date');
    const date = todayLagos();
    const list = data || [];
    let taskPage = 1;

    function renderTasksView() {
      const pg = window.DS.paginate(list, taskPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div>
              <h3>My tasks</h3>
              <p class="small muted" style="margin-top:2px">Assigned deliverables, deadlines, and progress</p>
            </div>
            <span class="tag muted-tag">${pg.curPage} / ${pg.totalPages}</span>
          </div>
          ${pg.items.length ? `
            <div class="ds-list">
              ${pg.items.map(t => {
                const overdue = t.due_date && t.due_date < date && t.status !== 'Done';
                const actions = [
                  { label: 'View task details', icon: '📋', attrs: `data-view-task="${t.id}"` },
                  { divider: true },
                  { label: 'Request extension', icon: '⏱️', attrs: `data-ext="${t.id}"` },
                  t.evidence_url ? { label: 'Open evidence link', icon: '↗', attrs: `onclick="window.open('${esc(t.evidence_url)}', '_blank')"` } : null,
                ];
                return `
                  <div class="ds-list-card">
                    <div class="ds-list-main">
                      <div class="ds-list-icon">📋</div>
                      <div class="ds-list-content">
                        <div class="ds-list-title-row">
                          <span class="ds-list-title">${esc(t.title)}${t.extension_requested ? ' <span class="tag muted-tag">Extension</span>' : ''}</span>
                          <span class="tag ${t.status === 'Done' ? 'ok' : t.status && t.status.toLowerCase().includes('review') ? '' : 'muted-tag'}">${esc(t.status || 'To do')}</span>
                          ${overdue ? '<span class="tag alert">Overdue</span>' : ''}
                        </div>
                        <div class="ds-list-sub">
                          Due ${t.due_date ? fmtD(t.due_date) : 'No due date'}${t.priority ? ' · ' + esc(t.priority) : ''}${t.evidence_url ? ` · <a href="${esc(t.evidence_url)}" target="_blank" rel="noopener">Evidence ↗</a>` : ''}
                        </div>
                        ${t.description ? `<div class="ds-list-snippet">${esc(t.description.slice(0, 110))}${t.description.length > 110 ? '…' : ''}</div>` : ''}
                      </div>
                    </div>
                    <div class="ds-list-actions">
                      <button type="button" class="btn sm" data-view-task="${t.id}">View</button>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${pg.renderBar('tasks')}
          ` : `<div class="empty"><div class="big">No tasks assigned</div><div class="hint">Tasks assigned to you will appear here.</div></div>`}
        </div>`;

      const openTaskModal = (taskId) => {
        const t = list.find(x => x.id === taskId);
        if (!t) return;
        const overdue = t.due_date && t.due_date < date && t.status !== 'Done';
        window.DS.showDetailsModal({
          title: t.title,
          subtitle: `Task · Due ${t.due_date ? fmtD(t.due_date) : 'No due date'}`,
          badgeHtml: `<span class="tag ${t.status === 'Done' ? 'ok' : t.status.includes('review') ? '' : 'muted-tag'}">${esc(t.status || 'To do')}</span>`,
          rows: [
            { label: 'Task title', value: t.title },
            { label: 'Description', value: t.description || 'No additional description provided' },
            { label: 'Current status', value: t.status || 'To do' },
            { label: 'Priority', value: t.priority || 'Normal' },
            { label: 'Due date', isHtml: true, value: overdue ? `<span class="tag alert">Overdue ${fmtD(t.due_date)}</span>` : (t.due_date ? fmtD(t.due_date) : '—') },
            { label: 'Extension requested', isHtml: true, value: t.extension_requested ? `<span class="tag alert">Yes (${esc(t.extension_note || 'Requested by you')})</span>` : 'No' },
            { label: 'Evidence link', isHtml: true, value: t.evidence_url ? `<a href="${esc(t.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost" style="padding:2px 8px;font-size:12px">Open evidence link ↗</a>` : '<span class="muted">None submitted</span>' },
            { label: 'Task ID', value: t.id }
          ],
          actions: [
            t.evidence_url ? `<a class="btn sm" href="${esc(t.evidence_url)}" target="_blank" rel="noopener">Open evidence ↗</a>` : '',
            `<button class="btn sm" data-ext="${t.id}" onclick="window.DS.modal.close()">Request extension</button>`
          ]
        });
      };

      $$('[data-view-task]', v).forEach(b => b.addEventListener('click', () => openTaskModal(b.dataset.viewTask)));

      $$('[data-ext]', v).forEach(b => b.addEventListener('click', async () => {
        const reason = prompt('Reason for the extension request:');
        if (reason === null) return;
        try {
          const { error: extErr } = await sb.from('task_updates').insert({
            task_id: b.dataset.ext, user_id: S.user.id,
            description: 'Extension requested: ' + reason,
            update_type: 'extension_request',
          });
          if (extErr) throw extErr;
        } catch (e) { toast('Could not send the request.', true); return; }
        await sb.from('tasks').update({ extension_requested: true, extension_note: reason }).eq('id', b.dataset.ext);
        toast('✓ Extension request sent to admin.');
      }));

      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (p) => {
        taskPage = p;
        renderTasksView();
      });
    }

    renderTasksView();
  };

  // ── MY UNITS & OKRs ──
  window.DS.registerRoute('units', {
    get title() { return isAdmin() ? 'Units & roles' : 'My units & OKRs'; },
    get sub() { return isAdmin() ? 'Create units, roles, assign members' : 'Your units, your role in each, shared OKRs'; },
    render: async (v) => { isAdmin() ? await window.renderUnitsAdmin(v) : await window.renderMyUnits(v); },
  });

  window.renderMyUnits = async function (v) {
    const units = await myUnits();
    const unitIds = units.map(u => u.unit_id);
    let okrs = [];
    if (unitIds.length) {
      const { data } = await sb.from('okrs').select('*, key_results:key_results(*)').or(`unit_id.is.null,unit_id.in.(${unitIds.join(',')})`);
      okrs = data || [];
    } else {
      const { data } = await sb.from('okrs').select('*, key_results:key_results(*)').is('unit_id', null);
      okrs = data || [];
    }
    v.innerHTML = `
      <div class="card"><div class="card-head"><h3>My units</h3></div>
        ${units.length ? units.map(u => `<div class="row"><div class="row-main"><div class="t">${esc(u.units?.name || 'Unit')}</div><div class="s">Your role: ${esc(u.positions?.title || 'Member')}</div></div></div>`).join('')
        : `<div class="empty"><div class="big">No units yet</div><div class="hint">An admin will assign you to a unit.</div></div>`}
      </div>
      <div class="card"><div class="card-head"><h3>OKRs shared with your units</h3></div>
        ${okrs.length ? okrs.map(o => `
          <div class="row" style="align-items:flex-start"><div class="row-main">
            <div class="t">${esc(o.title || o.objective || 'OKR')}</div>
            <div class="s">${esc(o.description || '')} · ${esc(o.units?.name || 'Company-wide')}</div>
            <div class="progress" style="margin-top:8px;max-width:320px"><div style="width:${o.progress || 0}%"></div></div>
            ${(o.key_results || []).length ? `<div class="small muted" style="margin-top:6px">${o.key_results.map(k => `${esc(k.title)} (${k.progress || 0}%)`).join(' · ')}</div>` : ''}
          </div><span class="tag ${o.status === 'Done' ? 'ok' : o.status === 'Off Track' ? 'alert' : 'muted-tag'}">${esc(o.status || 'On Track')}</span></div>`).join('')
        : `<div class="empty"><div class="big">No OKRs shared</div><div class="hint">OKRs for your units will appear here.</div></div>`}
      </div>`;
  };

  // ── MEETINGS (member: report attendance) ──
  window.DS.registerRoute('meetings', {
    get title() { return 'Meetings'; },
    get sub() { return isAdmin() ? 'Create meetings, invite units, notes' : 'Upcoming meetings and your meeting reports'; },
    render: async (v) => { isAdmin() ? await window.renderMeetingsAdmin(v) : await window.renderMeetingsMember(v); },
  });

  window.renderMeetingsMember = async function (v) {
    const { data } = await sb.from('meetings').select('*, units:unit_id(name)').gte('starts_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at');
    const list = data || [];
    let meetPage = 1;

    function renderView() {
      const pg = window.DS.paginate(list, meetPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Upcoming meetings</h3>
              <p class="small muted" style="margin-top:2px">${list.length} scheduled meeting${list.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          ${pg.items.length ? `
            <div class="ds-list">
              ${pg.items.map(raw => {
                const m = window.DS.meeting(raw);
                const actions = [
                  { label: 'View details', icon: '📋', attrs: `data-view-meeting="${m.id}"` },
                  { label: 'File meeting report', icon: '📝', attrs: `data-mr="${m.id}" data-title="${esc(m.title)}"` },
                  m.link ? { label: 'Join meeting', icon: '↗', attrs: `onclick="window.open('${esc(m.link)}', '_blank')"` } : null,
                  m.minutes ? { label: 'Notes link', icon: '📄', attrs: `onclick="window.open('${esc(m.minutes)}', '_blank')"` } : null,
                ];
                return `
                  <div class="ds-list-card">
                    <div class="ds-list-main">
                      <div class="ds-list-icon">👥</div>
                      <div class="ds-list-content">
                        <div class="ds-list-title-row">
                          <span class="ds-list-title">${esc(m.title)}</span>
                          <span class="tag muted-tag">${esc(m.units?.name || 'Everyone')}</span>
                        </div>
                        <div class="ds-list-sub">
                          ${fmtDT(m.starts_at)}${m.link ? ` · <a href="${esc(m.link)}" target="_blank" rel="noopener">Join link ↗</a>` : ''}
                        </div>
                        ${(m.description || m.agenda) ? `<div class="ds-list-snippet">${esc((m.description || m.agenda).slice(0, 110))}${(m.description || m.agenda).length > 110 ? '…' : ''}</div>` : ''}
                      </div>
                    </div>
                    <div class="ds-list-actions">
                      <button type="button" class="btn sm ghost" data-view-meeting="${m.id}">View</button>
                      <button type="button" class="btn sm" data-mr="${m.id}" data-title="${esc(m.title)}">Report</button>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${pg.renderBar('meetings')}
          ` : `<div class="empty"><div class="big">No meetings</div><div class="hint">Upcoming meetings will appear here.</div></div>`}
        </div>
      `;

      bindEvents();
      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (p) => {
        meetPage = p;
        renderView();
      });
    }

    function bindEvents() {
      $$('[data-mr]', v).forEach(b => b.addEventListener('click', () => meetingReportModal(b.dataset.mr, b.dataset.title)));
      $$('[data-view-meeting]', v).forEach(b => b.addEventListener('click', () => {
        const raw = list.find(x => x.id === b.dataset.viewMeeting);
        if (!raw) return;
        const m = window.DS.meeting(raw);
        window.DS.showDetailsModal({
          title: m.title,
          subtitle: `Meeting · ${fmtDT(m.starts_at)}`,
          badgeHtml: `<span class="tag muted-tag">${esc(m.units?.name || 'Everyone')}</span>`,
          rows: [
            { label: 'Title', value: m.title },
            { label: 'Starts', value: fmtDT(m.starts_at) },
            { label: 'Ends', value: m.ends_at ? fmtDT(m.ends_at) : '—' },
            { label: 'Target unit', value: m.units?.name || 'Everyone' },
            { label: 'Join link', isHtml: true, value: m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(m.link)} ↗</a>` : '<span class="muted">No video link specified</span>' },
            { label: 'Agenda / description', value: m.description || m.agenda || 'No agenda specified' },
            { label: 'Drive notes link', isHtml: true, value: m.minutes ? `<a href="${esc(m.minutes)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(m.minutes)} ↗</a>` : '<span class="muted">No notes link posted yet</span>' },
          ],
          actions: [
            m.link ? `<a class="btn sm" href="${esc(m.link)}" target="_blank" rel="noopener">Join meeting ↗</a>` : '',
            `<button class="btn sm primary" data-mr="${m.id}" data-title="${esc(m.title)}" onclick="window.DS.modal.close()">File report</button>`
          ]
        });
      }));
    }

    renderView();
  };

  function meetingReportModal(meetingId, title) {
    window.DS.modal.open(`
      <h2 style="margin-bottom:4px">Meeting report</h2>
      <p class="muted small" style="margin-bottom:18px">${esc(title)}</p>
      <form id="mr-form" novalidate>
        <div class="field"><label class="label" for="mr-att">Did you attend?</label>
          <select class="input" id="mr-att"><option value="yes">Yes, attended</option><option value="no">No</option></select></div>
        <div class="field"><label class="label" for="mr-contrib">What did you contribute?</label><textarea class="input" id="mr-contrib" required></textarea></div>
        <div class="field"><label class="label" for="mr-fb">Feedback on the meeting</label><textarea class="input" id="mr-fb"></textarea></div>
        <div style="display:flex;gap:10px"><button class="btn primary" style="flex:1" type="submit">Submit</button>
        <button class="btn" type="button" id="mr-cancel">Cancel</button></div>
      </form>`);
    $('#mr-cancel').addEventListener('click', window.DS.modal.close);
    $('#mr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await sb.from('meeting_attendance').upsert({
        meeting_id: meetingId, user_id: S.user.id,
        attended: $('#mr-att').value === 'yes',
        note: `Contribution: ${$('#mr-contrib').value.trim()} · Feedback: ${$('#mr-fb').value.trim()}`,
      }, { onConflict: 'meeting_id,user_id' });
      window.DS.modal.close();
      toast('Meeting report submitted.');
    });
  }

  // ── WEEKLY IDEA & PROBLEM ──
  window.DS.registerRoute('ideas', {
    get title() { return isAdmin() ? 'Ideas & problems' : 'Weekly idea & problem'; },
    get sub() { return isAdmin() ? 'Review submissions, set status' : 'One idea + one problem per week'; },
    render: async (v) => { isAdmin() ? await window.renderIdeasAdmin(v) : await window.renderIdeasMember(v); },
  });

  function weekLabel() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const wk = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
  }

  window.renderIdeasMember = async function (v) {
    const label = weekLabel();
    const { data: period } = await sb.from('periods').select('id,label').eq('type', 'weekly').eq('label', label).maybeSingle();
    const { data } = await sb.from('weekly_feedback').select('*, periods:period_id(label)').eq('user_id', S.user.id).order('created_at');
    const idea = (data || []).find(f => f.type === 'idea');
    const problem = (data || []).find(f => f.type === 'problem');
    const card = (type, f) => {
      const editable = !f || f.status === 'Open' || f.status === 'Rejected' || f.status === 'Dismissed';
      const st = f ? f.status : '';
      const stTag = !f ? '<span class="tag muted-tag">Not submitted</span>'
        : `<span class="tag ${st === 'Rejected' || st === 'Dismissed' ? 'alert' : st === 'Approved' || st === 'Implemented' ? 'ok' : st === 'Submitted' ? '' : 'muted-tag'}">${esc(st)}</span>`;
      return `<div class="card">
        <div class="card-head"><h3>${type === 'idea' ? 'My weekly idea' : 'My weekly problem'} — ${esc(label)}</h3>${stTag}</div>
        ${f && f.admin_note ? `<div class="error-box" style="margin-bottom:14px">${esc(f.admin_note)}</div>` : ''}
        <form data-fb="${type}" novalidate>
          <div class="field"><label class="label" for="fb-sec-${type}">Section</label>
            <select class="input" id="fb-sec-${type}" ${editable ? '' : 'disabled'}>${SECTIONS.map(s => `<option ${f?.section === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label class="label" for="fb-title-${type}">Title</label><input class="input" id="fb-title-${type}" required ${editable ? '' : 'disabled'} value="${esc(f?.title || '')}"></div>
          <div class="field"><label class="label" for="fb-desc-${type}">Description</label><textarea class="input" id="fb-desc-${type}" required ${editable ? '' : 'disabled'}>${esc(f?.content || '')}</textarea></div>
          ${type === 'problem' ? `<div class="field"><label class="label" for="fb-sev-${type}">Severity</label>
            <select class="input" id="fb-sev-${type}" ${editable ? '' : 'disabled'}>${['Low','Medium','High','Critical'].map(s => `<option ${f?.severity === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>` : ''}
          ${editable ? `<button class="btn primary" style="width:100%" type="submit">${f && (f.status === 'Rejected' || f.status === 'Dismissed') ? 'Resubmit' : f ? 'Update' : 'Submit'} ${type}</button>`
            : `<p class="small muted">${st === 'Rejected' || st === 'Dismissed' ? 'You can edit and resubmit this.' : 'Submitted — waiting for an admin decision.'}</p>`}
        </form>
      </div>`;
    };
    v.innerHTML = card('idea', idea) + card('problem', problem) +
      (period ? '' : `<div class="error-box" style="margin-top:12px">No weekly period "${esc(label)}" exists yet — an admin must create it in Scores & periods.</div>`);
    $$('form[data-fb]', v).forEach(form => form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = form.dataset.fb;
      const title = $(`#fb-title-${type}`).value.trim();
      const content = $(`#fb-desc-${type}`).value.trim();
      if (!title || !content) return toast('Title and description are required.', true);
      if (!period) return toast('This week has no period yet — ask an admin to create it.', true);
      const payload = { user_id: S.user.id, period_id: period.id, type, title, content, status: 'Submitted' };
      if (type === 'problem') payload.severity = $(`#fb-sev-${type}`).value;
      const { error } = await sb.from('weekly_feedback').upsert(payload, { onConflict: 'user_id,period_id,type' });
      if (error) return toast(error.message, true);
      toast(`${type === 'idea' ? 'Idea' : 'Problem'} submitted.`);
      window.DS.navigate('ideas');
    }));
  };

  // ── SCORE SHEET (private) ──
  window.DS.registerRoute('scores', {
    get title() { return isAdmin() ? 'Scores & periods' : 'My score sheet'; },
    get sub() { return isAdmin() ? 'Weekly/monthly scores, weights, lock periods, audit' : 'Private — only you and admins see this'; },
    render: async (v) => { isAdmin() ? await window.renderScoresAdmin(v) : await window.renderMyScores(v); },
  });

  window.renderMyScores = async function (v) {
    const [{ data: weekly }, { data: monthly }, { data: criteria }, repRes, mtgRes, tskRes, fbRes] = await Promise.all([
      sb.from('weekly_scores').select('*, periods:period_id(label,type,locked)').eq('user_id', S.user.id).order('scored_at', { ascending: false }).limit(12),
      sb.from('monthly_scores').select('*, periods:period_id(label,type,locked)').eq('user_id', S.user.id).order('scored_at', { ascending: false }).limit(6),
      sb.from('score_criteria').select('*').eq('active', true).order('weight', { ascending: false }),
      sb.from('daily_reports').select('id,report_date,status,score,review_note,is_late,late_minutes').eq('user_id', S.user.id).limit(500),
      sb.from('meeting_attendance').select('id,attended,score').eq('user_id', S.user.id).limit(500),
      sb.from('tasks').select('id,status,evidence_url,task_assignees!inner(user_id)').eq('task_assignees.user_id', S.user.id).limit(500),
      sb.from('weekly_feedback').select('id,type,status,score').eq('user_id', S.user.id).limit(500),
    ]);
    const list = weekly || [];
    const latestMonthly = monthly?.[0];
    const latest = list[0];
    const crits = criteria || [];

    // weekly chart — most recent 8, oldest first
    const chart = list.slice(0, 8).reverse();
    const maxH = 150;
    const chartHtml = chart.length ? `<div class="chart">${chart.map(s => {
      const val = Number(s.manual_override ?? s.weighted_total ?? 0);
      const h = Math.max(3, Math.round((val / 100) * maxH));
      return `<div class="chart-col" title="${esc(s.periods?.label || '')}: ${val}/100">
        <div class="chart-val">${Math.round(val)}</div>
        <div class="chart-bar ${s.periods?.locked ? 'locked' : ''}" style="height:${h}px"></div>
        <div class="chart-lbl">${esc((s.periods?.label || '').replace(/^\d{4}-/, ''))}</div>
      </div>`;
    }).join('')}</div>` : '';

    // breakdown by criterion (latest weekly), weighted contribution
    const breakdown = latest && crits.length ? crits.map(c => {
      const raw = latest.criterion_scores?.[c.key];
      const pct = raw == null ? 0 : Math.round((Number(raw) / (c.max_points || 10)) * 100);
      const contrib = Math.round(((Number(raw) || 0) / (c.max_points || 10)) * c.weight);
      return `<div class="brk">
        <div class="brk-top"><span class="brk-name">${esc(c.label)}</span><span class="brk-val">${raw ?? '—'}/${c.max_points} · ${contrib}/${c.weight} pts</span></div>
        <div class="brk-track"><div class="brk-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('') : '';

    // activity breakdown: daily reports, meetings, tasks, ideas & problems
    const asList = (r) => (Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []));
    const repList = asList(repRes);
    const mtgList = asList(mtgRes);
    const tskList = asList(tskRes);
    const fbList = asList(fbRes);
    const activity = [
      { label: 'Daily reports', value: repList.length, note: `${repList.filter(r => r.status === 'Approved').length} approved` },
      { label: 'Meetings', value: mtgList.filter(m => m.attended).length, note: `${mtgList.length} reported` },
      { label: 'Tasks', value: tskList.filter(t => t.status === 'Done').length, note: `${tskList.length} assigned` },
      { label: 'Ideas & problems', value: fbList.filter(f => f.status === 'Approved' || f.status === 'Implemented').length, note: `${fbList.length} submitted` },
    ];

    // scored submissions (daily reports the admin has scored)
    const scored = repList
      .filter(r => r.score != null)
      .sort((a, b) => String(b.report_date || '').localeCompare(String(a.report_date || '')));
    const scoredHtml = scored.length ? `
      <div class="ds-list">
        ${scored.slice(0, 10).map(r => `
          <div class="ds-list-card">
            <div class="ds-list-main">
              <div class="ds-list-icon">📅</div>
              <div class="ds-list-content">
                <div class="ds-list-title-row">
                  <span class="ds-list-title">${fmtD(r.report_date)}${r.is_late ? ' <span class="tag alert">Late</span>' : ''}</span>
                  <span class="tag ok"><b>${r.score}/100</b></span>
                  ${statusTagLocal(r.status)}
                </div>
                <div class="ds-list-sub">Scored daily report</div>
                ${r.review_note ? `<div class="ds-list-snippet"><b>Feedback:</b> ${esc(r.review_note)}</div>` : ''}
              </div>
            </div>
            <div class="ds-list-actions">
              <button type="button" class="btn sm" data-view-scored-rep="${r.id}">View</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // The headline figure is the weekly score when there is one; otherwise the
    // most recent scored submission, so a member always sees their latest mark.
    const latestReportScore = scored[0] ? scored[0].score : null;
    const headline = latest ? Math.round(latest.manual_override ?? latest.weighted_total) : latestReportScore;
    const headlineLabel = latest ? 'Latest weekly' : (latestReportScore != null ? 'Latest report score' : 'Latest weekly');

    v.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${latestMonthly ? Math.round(latestMonthly.final_score ?? latestMonthly.weekly_avg) + '%' : '—'}</div><div class="cap">Latest monthly</div></div>
        <div class="stat"><div class="num">${headline != null ? headline + '%' : '—'}</div><div class="cap">${headlineLabel}</div></div>
        <div class="stat"><div class="num">${list.length}</div><div class="cap">Weeks scored</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Weekly score trend</h3>${latest?.periods?.locked ? '<span class="tag muted-tag">Latest period locked</span>' : ''}</div>
        ${chartHtml || `<div class="empty"><div class="big">No weekly scores yet</div><div class="hint">Your first score appears after an admin reviews your reports.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Breakdown by category</h3>${latest ? `<span class="tag muted-tag">${esc(latest.periods?.label || '')}</span>` : ''}</div>
        ${breakdown ? `<div class="brk" style="gap:14px">${breakdown}</div>`
          : `<div class="empty"><div class="big">Nothing to break down yet</div><div class="hint">Your category scores appear here once a week is scored.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Activity breakdown</h3></div>
        <div class="brk" style="gap:14px">
          ${activity.map(a => `<div class="brk">
            <div class="brk-top"><span class="brk-name">${esc(a.label)}</span><span class="brk-val">${a.value} · ${esc(a.note)}</span></div>
          </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Scored daily reports</h3>${scored.length ? `<span class="tag muted-tag">${scored.length}</span>` : ''}</div>
        ${scoredHtml || `<div class="empty" style="padding:20px"><div class="hint">Reports you submit are scored by an admin. Each score appears here as soon as it is saved.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Weekly score sheet</h3></div>
        ${list.length ? `
          <div class="ds-list">
            ${list.map(s => `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">📊</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(s.periods?.label || 'Weekly score')} ${s.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : ''}</span>
                      <span class="tag ok"><b>${s.manual_override ?? s.weighted_total}/100</b></span>
                    </div>
                    <div class="ds-list-sub">Weighted score breakdown</div>
                    <div class="ds-list-snippet">
                      ${crits.map(c => `${esc(c.label)}: <b>${s.criterion_scores?.[c.key] ?? '—'}</b>`).join(' · ')}
                    </div>
                  </div>
                </div>
                <div class="ds-list-actions">
                  <button type="button" class="btn sm ghost" data-view-wsheet="${s.id}">View</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="empty"><div class="big">No scores yet</div><div class="hint">Your weekly scores appear here after admin review.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Monthly</h3></div>
        ${monthly && monthly.length ? monthly.map(m => `<div class="row"><div class="row-main"><div class="t">${esc(m.periods?.label || '')}</div><div class="s">Weekly average ${m.weekly_avg ?? '—'}</div></div><b>${Math.round(m.final_score ?? m.weekly_avg ?? 0)}%</b></div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">Monthly rollup appears at month end.</div></div>`}
      </div>
      <p class="tiny muted">Private: no rankings, no other members' data.</p>`;

    $$('[data-view-scored-rep]', v).forEach(b => b.addEventListener('click', () => {
      const r = repList.find(x => x.id === b.dataset.viewScoredRep);
      if (!r) return;
      window.DS.showDetailsModal({
        title: `Daily report · ${fmtD(r.report_date)}`,
        subtitle: `Scored by Admin`,
        badgeHtml: `<span class="tag ok"><b>${r.score}/100</b></span>`,
        rows: [
          { label: 'Report date', value: fmtD(r.report_date) },
          { label: 'Admin score', value: `${r.score}/100` },
          { label: 'Status', value: r.status },
          { label: 'Admin review note', value: r.review_note || 'No specific note added' },
          { label: 'Late submission', isHtml: true, value: r.is_late ? `<span class="tag alert">Yes (Late by ${lateBy(r.late_minutes)})</span>` : 'No (On time)' },
        ]
      });
    }));

    $$('[data-view-wsheet]', v).forEach(b => b.addEventListener('click', () => {
      const s = list.find(x => x.id === b.dataset.viewWsheet);
      if (!s) return;
      window.DS.showDetailsModal({
        title: s.periods?.label || 'Weekly score',
        subtitle: `Score sheet ${s.periods?.locked ? '· Locked' : ''}`,
        badgeHtml: `<span class="tag ok"><b>${s.manual_override ?? s.weighted_total}/100</b></span>`,
        rows: [
          { label: 'Period', value: s.periods?.label || '—' },
          { label: 'Total score', isHtml: true, value: `<b style="font-size:16px;color:var(--ok)">${s.manual_override ?? s.weighted_total}/100</b>` },
          { label: 'Status', value: s.periods?.locked ? 'Locked (Final)' : 'Open' },
          ...crits.map(c => ({
            label: c.label,
            value: s.criterion_scores?.[c.key] != null ? `${s.criterion_scores[c.key]} points` : '—'
          }))
        ]
      });
    }));
  };

  // ── LIBRARY ──
  window.DS.registerRoute('library', {
    get title() { return isAdmin() ? 'Library admin' : 'Library'; },
    get sub() { return isAdmin() ? 'Add URL entries, grant access, see open counts' : 'Links shared with you — search and filter'; },
    render: async (v) => { isAdmin() ? await window.renderLibraryAdmin(v) : await window.renderLibrary(v); },
  });

  window.renderLibrary = async function (v) {
    // RLS already limits this to items granted to the member (or their units).
    const { data: items } = await sb.from('library_items').select('*, library_grants(scope), profiles:added_by(full_name)').order('created_at', { ascending: false });
    const list = items || [];
    const cats = [...new Set(list.map(i => i.category).filter(Boolean))];
    let libPage = 1;

    function renderView() {
      const pg = window.DS.paginate(list, libPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Library</h3>
              <p class="small muted" style="margin-top:2px">${list.length} resource${list.length === 1 ? '' : 's'} available to you</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input class="input" id="lib-q" placeholder="Search…" style="min-height:36px;width:170px" aria-label="Search library">
              <select class="input" id="lib-cat" style="min-height:36px;width:auto" aria-label="Filter by category">
                <option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}
              </select>
            </div>
          </div>
          ${pg.items.length ? `
            <div id="lib-list" class="ds-list">
              ${pg.items.map(i => {
                const actions = [
                  { label: 'View details', icon: '📋', attrs: `data-view-lib="${i.id}"` },
                  { label: 'Open link ↗', icon: '↗', attrs: `onclick="window.open('${esc(i.url)}', '_blank')"` },
                  { divider: true },
                  { label: 'Report broken link', icon: '⚠️', isAlert: true, attrs: `data-broken="${i.id}"` },
                ];
                return `
                  <div class="ds-list-card" data-name="${esc(((i.title || '') + ' ' + (i.description || '')).toLowerCase())}" data-cat="${esc(i.category || '')}">
                    <div class="ds-list-main">
                      <div class="ds-list-icon">📄</div>
                      <div class="ds-list-content">
                        <div class="ds-list-title-row">
                          <span class="ds-list-title">${esc(i.title)}${i.broken_link ? ' <span class="tag alert">Broken</span>' : ''}</span>
                          ${i.category ? `<span class="tag muted-tag">${esc(i.category)}</span>` : ''}
                        </div>
                        <div class="ds-list-sub">
                          ${i.category ? esc(i.category) + ' · ' : ''}Added by ${esc(nameOf(i.profiles))}
                        </div>
                        ${i.description ? `<div class="ds-list-snippet">${esc(i.description)}</div>` : ''}
                      </div>
                    </div>
                    <div class="ds-list-actions">
                      <button type="button" class="btn sm ghost" data-view-lib="${i.id}">View</button>
                      <a class="btn sm primary" href="${esc(i.url)}" target="_blank" rel="noopener">Open ↗</a>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${pg.renderBar('lib')}
          ` : `<div class="empty"><div class="big">Nothing shared with you yet</div><div class="hint">Library links granted to you or your units appear here.</div></div>`}
        </div>`;

      bindEvents();
      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (p) => {
        libPage = p;
        renderView();
      });
    }

    function bindEvents() {
      const apply = () => {
        const q = $('#lib-q').value.toLowerCase(), c = $('#lib-cat').value;
        $$('#lib-list .ds-list-card').forEach(r => {
          r.style.display = (r.dataset.name.includes(q) && (!c || r.dataset.cat === c)) ? '' : 'none';
        });
      };
      $('#lib-q')?.addEventListener('input', apply);
      $('#lib-cat')?.addEventListener('change', apply);

      $$('[data-view-lib]', v).forEach(b => b.addEventListener('click', () => {
        const item = list.find(x => x.id === b.dataset.viewLib);
        if (!item) return;
        window.DS.showDetailsModal({
          title: item.title,
          subtitle: `Library document · ${item.category || 'General'}`,
          badgeHtml: item.broken_link ? '<span class="tag alert">Reported broken</span>' : '<span class="tag ok">Available</span>',
          rows: [
            { label: 'Title', value: item.title },
            { label: 'Category', value: item.category || 'None' },
            { label: 'Description', value: item.description || 'No description provided' },
            { label: 'URL', isHtml: true, value: `<a href="${esc(item.url)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(item.url)} ↗</a>` },
            { label: 'Added by', value: nameOf(item.profiles) }
          ],
          actions: [
            `<a class="btn sm primary" href="${esc(item.url)}" target="_blank" rel="noopener">Open document ↗</a>`,
            `<button class="btn sm ghost" data-broken="${item.id}" onclick="window.DS.modal.close()">Report broken</button>`
          ]
        });
      }));

      $$('[data-broken]', v).forEach(b => b.addEventListener('click', async () => {
        await sb.from('library_items').update({ broken_link: true, last_broken_report_at: new Date().toISOString() }).eq('id', b.dataset.broken);
        await sb.from('notifications').insert({ user_id: S.user.id, type: 'broken_link', title: 'Broken link reported', body: 'library_items:' + b.dataset.broken, link_tab: 'library' });
        await sb.from('audit_log').insert({ actor_id: S.user.id, action: 'broken_link_reported', target: 'library_items:' + b.dataset.broken });
        const { data: admins } = await sb.from('profiles').select('id').eq('access_level', 'Admin');
        for (const a of (admins || [])) {
          await sb.from('notifications').insert({ user_id: a.id, type: 'broken_link', title: 'Broken library link reported', body: 'library_items:' + b.dataset.broken, link_tab: 'library' });
        }
        toast('Reported. Admins were notified.');
        window.DS.navigate('library');
      }));
    }

    renderView();
  };

  // ── LEAVE ──
  window.DS.registerRoute('leave', {
    get title() { return 'Leave'; },
    get sub() { return isAdmin() ? 'Approve or decline leave requests' : 'Request leave and track it'; },
    render: async (v) => { isAdmin() ? await window.renderLeaveAdmin(v) : await window.renderLeave(v); },
  });

  window.renderLeave = async function (v) {
    const { data: mine } = await sb.from('leave_requests').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false });
    const list = mine || [];
    v.innerHTML = `
      <div class="card"><div class="card-head"><h3>Request leave</h3></div>
        <form id="lv-form" novalidate>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
            <div class="field"><label class="label" for="lv-s">Start date</label><input class="input" id="lv-s" type="date" required></div>
            <div class="field"><label class="label" for="lv-e">End date</label><input class="input" id="lv-e" type="date" required></div>
          </div>
          <div class="field"><label class="label" for="lv-r">Reason</label><input class="input" id="lv-r" placeholder="Reason for time off"></div>
          <button class="btn primary" style="width:100%" type="submit">Submit request</button>
        </form>
      </div>

      <div class="card"><div class="card-head"><h3>My leave requests</h3></div>
        ${list.length ? `
          <div class="ds-list">
            ${list.map(l => {
              const actions = [
                { label: 'View details', icon: '📋', attrs: `data-view-leave="${l.id}"` }
              ];
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-icon">🌴</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${fmtD(l.start_date)} → ${fmtD(l.end_date)}</span>
                        <span class="tag ${l.status === 'Approved' ? 'ok' : l.status === 'Declined' ? 'alert' : 'muted-tag'}">${l.status}</span>
                      </div>
                      <div class="ds-list-sub">Submitted ${fmtDT(l.created_at)}</div>
                      ${l.reason ? `<div class="ds-list-snippet">${esc(l.reason)}</div>` : ''}
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button type="button" class="btn sm" data-view-leave="${l.id}">View</button>
                    ${window.DS.renderActionMenu(actions)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `<div class="empty" style="padding:20px"><div class="hint">No leave requests yet.</div></div>`}
      </div>`;

    $$('[data-view-leave]', v).forEach(b => b.addEventListener('click', () => {
      const l = list.find(x => x.id === b.dataset.viewLeave);
      if (!l) return;
      window.DS.showDetailsModal({
        title: 'Leave request',
        subtitle: `${fmtD(l.start_date)} → ${fmtD(l.end_date)}`,
        badgeHtml: `<span class="tag ${l.status === 'Approved' ? 'ok' : l.status === 'Declined' ? 'alert' : 'muted-tag'}">${l.status}</span>`,
        rows: [
          { label: 'Start date', value: fmtD(l.start_date) },
          { label: 'End date', value: fmtD(l.end_date) },
          { label: 'Reason', value: l.reason || 'None specified' },
          { label: 'Status', value: l.status },
          { label: 'Submitted on', value: fmtDT(l.created_at) }
        ]
      });
    }));

    $('#lv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const s = $('#lv-s').value, end = $('#lv-e').value;
      if (!s || !end) return toast('Please select start and end dates.', true);
      const { error } = await sb.from('leave_requests').insert({ user_id: S.user.id, start_date: s, end_date: end, reason: $('#lv-r').value.trim() || null });
      if (error) return toast(error.message, true);
      toast('Leave request submitted.');
      window.DS.navigate('leave');
    });
  };

  // ── CHANNELS & RICH CHATTING WORKSPACE ──
  function formatChatMessage(text, people) {
    if (!text) return '';
    let s = esc(text);
    // URLs to links
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="text-decoration:underline;color:inherit;font-weight:600">$1</a>');
    // Mention tags
    s = s.replace(/@([A-Za-z0-9_\s]{2,25})(?=[.,!?\s]|$)/g, '<span class="mention-pill">@$1</span>');
    // Priority and custom hashtags
    s = s.replace(/#(urgent|URGENT)\b/g, '<span class="urgent-pill">🚨 #URGENT</span>');
    s = s.replace(/#(important|IMPORTANT)\b/g, '<span class="important-pill">⚡ #IMPORTANT</span>');
    s = s.replace(/#(announcement|ANNOUNCEMENT)\b/g, '<span class="announcement-pill">📢 #ANNOUNCEMENT</span>');
    s = s.replace(/#([a-zA-Z0-9_\-]+)/g, '<span class="tag muted-tag" style="font-size:11px">#$1</span>');
    // Word-style formatting
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');
    s = s.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>');
    s = s.replace(/__(.+?)__/g, '<u>$1</u>');
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    s = s.replace(/`([^`]+?)`/g, '<code>$1</code>');
    // Blockquotes (> text)
    s = s.replace(/(^|\n)&gt;\s?(.*)/g, '$1<blockquote>$2</blockquote>');
    // Bullet points (• text or - text)
    s = s.replace(/(^|\n)[•\-]\s+(.*)/g, '$1<div style="display:flex;gap:6px;margin:3px 0"><span style="color:var(--ink-60)">•</span><span>$2</span></div>');
    // Newlines to breaks
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function getMessagePriority(text, updateType) {
    const t = (text || '').toLowerCase();
    if (t.includes('#urgent') || updateType === 'priority') return 'urgent';
    if (t.includes('#important')) return 'important';
    if (t.includes('#announcement') || updateType === 'announcement') return 'announcement';
    return 'general';
  }

  function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function insertFormatting(textarea, before, after = '') {
    textarea.focus();
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selected = textarea.value.substring(start, end);
    const replacement = before + selected + after;
    textarea.setRangeText(replacement, start, end, 'end');
    if (start === end && after) {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length;
    }
  }

  window.DS.renderChannelsWorkspace = async function (v, options = {}) {
    const adminMode = options.isAdmin ?? isAdmin();
    const [{ data: channels }, { data: people }] = await Promise.all([
      sb.from('channels').select('*').order('created_at'),
      sb.from('profiles').select('id, full_name, email, access_level').eq('active', true).order('full_name'),
    ]);
    const channelList = channels || [];
    const memberList = people || [];

    // Categorize channels into Announcements, General Workspaces, and Units
    const annChannels = channelList.filter(c => c.kind === 'announcements');
    const generalChannels = channelList.filter(c => c.kind === 'general' || (!c.kind && !c.unit_id));
    const unitChannels = channelList.filter(c => c.kind === 'unit' || c.unit_id);

    // Initial selected channel
    let currentChannel = channelList.find(c => c.name === 'general') || channelList[0];

    v.innerHTML = `
      <div class="chat-container">
        <!-- LEFT SUB-NAVIGATION PANE -->
        <div class="chat-channels-pane">
          <div class="chat-pane-head">
            <div style="font-weight:900;font-size:14px;letter-spacing:-0.02em">CHANNELS &amp; TEAMS</div>
            ${adminMode ? `<button class="btn sm ghost" id="ch-new-btn" style="padding:2px 8px;font-size:12px;font-weight:800" title="Create channel">+ Channel</button>` : ''}
          </div>
          <input class="chat-search-input" id="ch-search-box" placeholder="Filter channels…" aria-label="Filter channels">

          <div id="channels-tree" style="display:flex;flex-direction:column;gap:12px">
            <!-- Announcements -->
            <div>
              <div class="nav-group-label" style="margin-left:4px">Official Broadcasts</div>
              ${annChannels.map(c => `
                <button class="channel-btn ${c.id === currentChannel?.id ? 'active' : ''}" data-chid="${c.id}" data-name="${esc(c.display_name || c.name)}" data-kind="${esc(c.kind || '')}">
                  <span style="font-size:14px">📢</span>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.display_name || c.name)}</span>
                  <span class="channel-badge ok">Info</span>
                </button>
              `).join('')}
            </div>

            <!-- General -->
            <div>
              <div class="nav-group-label" style="margin-left:4px">Workspace Channels</div>
              ${generalChannels.map(c => `
                <button class="channel-btn ${c.id === currentChannel?.id ? 'active' : ''}" data-chid="${c.id}" data-name="${esc(c.display_name || c.name)}" data-kind="${esc(c.kind || '')}">
                  <span style="font-weight:800;color:var(--ink-60)">#</span>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.display_name || c.name)}</span>
                  ${c.is_private ? '<span class="small muted" title="Private">🔒</span>' : ''}
                </button>
              `).join('')}
            </div>

            <!-- Units -->
            ${unitChannels.length ? `
              <div>
                <div class="nav-group-label" style="margin-left:4px">Unit Channels</div>
                ${unitChannels.map(c => `
                  <button class="channel-btn ${c.id === currentChannel?.id ? 'active' : ''}" data-chid="${c.id}" data-name="${esc(c.display_name || c.name)}" data-kind="${esc(c.kind || '')}">
                    <span>🏢</span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.display_name || c.name)}</span>
                    <span class="channel-badge muted-tag">Unit</span>
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- RIGHT CHAT ROOM PANE -->
        <div class="chat-room-pane" id="chat-room-pane">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:400px">
            <div class="loading">Loading channel…</div>
          </div>
        </div>
      </div>
    `;

    // Channel search filter
    const searchBox = $('#ch-search-box');
    searchBox?.addEventListener('input', () => {
      const q = searchBox.value.toLowerCase().trim();
      $$('.channel-btn', v).forEach(btn => {
        const text = btn.textContent.toLowerCase();
        btn.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });

    // Admin create channel modal
    if (adminMode) {
      $('#ch-new-btn')?.addEventListener('click', () => {
        window.DS.modal.open(`
          <h2 style="margin-bottom:6px">Create a new channel</h2>
          <p class="muted small" style="margin-bottom:16px">Organize team conversations, unit initiatives, or company announcements.</p>
          <form id="new-ch-form" novalidate>
            <div class="field">
              <label class="label" for="nch-name">Channel identifier</label>
              <input class="input" id="nch-name" required placeholder="e.g. mobile-app, client-pitch">
              <span class="small muted">Lowercase letters, numbers, and dashes.</span>
            </div>
            <div class="field">
              <label class="label" for="nch-disp">Display name</label>
              <input class="input" id="nch-disp" placeholder="e.g. Mobile App Team">
            </div>
            <div class="field">
              <label class="label" for="nch-desc">Topic / Description</label>
              <input class="input" id="nch-desc" placeholder="What is this channel for?">
            </div>
            <div class="field">
              <label class="label" for="nch-kind">Type</label>
              <select class="input" id="nch-kind">
                <option value="general">Workspace Channel (open to everyone)</option>
                <option value="unit">Unit Private Channel</option>
                <option value="announcements">Official Announcements (admins only post)</option>
              </select>
            </div>
            <div class="error-box hidden" id="nch-error" style="margin-bottom:14px"></div>
            <div style="display:flex;gap:10px">
              <button class="btn primary" type="submit" style="flex:1">Create channel</button>
              <button class="btn" type="button" id="nch-cancel">Cancel</button>
            </div>
          </form>
        `);
        $('#nch-cancel')?.addEventListener('click', window.DS.modal.close);
        $('#new-ch-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const err = $('#nch-error');
          err.classList.remove('show');
          const rawName = $('#nch-name').value.trim();
          if (!rawName) { err.textContent = 'Channel identifier is required.'; err.classList.add('show'); return; }
          const name = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          const disp = $('#nch-disp').value.trim() || name.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
          const desc = $('#nch-desc').value.trim() || null;
          const kind = $('#nch-kind').value;
          const { data: newCh, error } = await sb.from('channels').insert({
            name, display_name: disp, description: desc, kind,
            is_private: kind !== 'general', created_by: S.user.id,
          }).select().single();
          if (error) { err.textContent = error.message; err.classList.add('show'); return; }
          toast('✓ Channel created');
          window.DS.modal.close();
          window.DS.navigate('channels');
        });
      });
    }

    // Switch channels
    async function selectChannel(ch) {
      currentChannel = ch;
      const container = $('.chat-container', v);
      container?.classList.add('view-room');
      $$('.channel-btn', v).forEach(b => {
        b.classList.toggle('active', b.dataset.chid === ch.id);
      });
      await renderChannelRoom(ch);
    }

    $$('.channel-btn', v).forEach(b => {
      b.addEventListener('click', () => {
        const target = channelList.find(c => c.id === b.dataset.chid);
        if (target) selectChannel(target);
      });
    });

    // Render the chat room
    async function renderChannelRoom(ch) {
      const room = $('#chat-room-pane');
      if (!room) return;
      const canPost = ch.kind !== 'announcements' || adminMode;

      // Load channel messages
      const { data: messages } = await sb.from('channel_updates')
        .select('*, profiles:author_id(full_name, email, access_level)')
        .eq('channel_id', ch.id)
        .order('created_at', { ascending: true })
        .limit(60);

      const msgList = messages || [];

      room.innerHTML = `
        <!-- CHANNEL HEADER -->
        <div class="chat-room-head">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="btn sm ghost" id="chat-mobile-back" style="display:none;padding:4px 8px;font-size:12.5px" title="Back to channels">← Channels</button>
            <div>
              <div class="chat-room-title">
                <span>${ch.kind === 'announcements' ? '📢' : ch.kind === 'unit' ? '🏢' : '#'}</span>
                <span>${esc(ch.display_name || ch.name)}</span>
                ${ch.kind === 'announcements' ? '<span class="announcement-pill">Broadcast</span>' : ''}
                ${ch.is_private ? '<span class="status-pill draft">🔒 Private</span>' : ''}
              </div>
              <div class="chat-room-sub">${esc(ch.description || 'General team collaboration and updates.')}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn sm ghost" id="chat-refresh-btn" title="Refresh messages">↻ Refresh</button>
          </div>
        </div>

        <!-- MESSAGES STREAM -->
        <div class="chat-messages" id="chat-stream">
          ${msgList.length ? msgList.map(m => {
            const author = m.profiles?.full_name || m.profiles?.email || 'Team member';
            const authorAccess = m.profiles?.access_level || 'Member';
            const priority = getMessagePriority(m.body, m.update_type);
            const canDelete = adminMode || m.author_id === S.user.id;
            const msgActions = [
              canDelete ? { label: 'Delete message', icon: '🗑️', isAlert: true, attrs: `data-del-chat="${m.id}"` } : null,
            ];
            return `
              <div class="chat-msg-row" data-msg-id="${m.id}">
                <div class="chat-avatar ${authorAccess === 'Admin' ? 'admin' : ''}" title="${esc(author)} (${esc(authorAccess)})">
                  ${esc(getInitials(author))}
                </div>
                <div class="chat-msg-body ${priority}">
                  <div class="chat-meta">
                    <span class="chat-author">${esc(author)}</span>
                    <span class="tag muted-tag" style="font-size:10px;padding:0 6px">${esc(authorAccess)}</span>
                    <span class="chat-time">${fmtDT(m.created_at)}</span>
                    ${priority === 'urgent' ? '<span class="urgent-pill">🚨 URGENT</span>' : ''}
                    ${priority === 'important' ? '<span class="important-pill">⚡ IMPORTANT</span>' : ''}
                    ${priority === 'announcement' ? '<span class="announcement-pill">📢 ANNOUNCEMENT</span>' : ''}
                    ${canDelete ? `<div style="margin-left:auto">${window.DS.renderActionMenu(msgActions)}</div>` : ''}
                  </div>
                  <div class="chat-text">${formatChatMessage(m.body, memberList)}</div>
                  ${m.drive_link ? `<div style="margin-top:6px"><a href="${esc(m.drive_link)}" target="_blank" rel="noopener" class="btn sm ghost" style="padding:2px 8px;font-size:12px">🔗 Attached resource</a></div>` : ''}
                </div>
              </div>
            `;
          }).join('') : `
            <div class="empty" style="padding:40px 20px">
              <div class="big">No messages in #${esc(ch.display_name || ch.name)} yet</div>
              <div class="hint">Be the first to post! Format with toolbar, use @mentions, or mark #urgent / #important.</div>
            </div>
          `}
        </div>

        <!-- COMPOSER -->
        <div class="chat-composer-box">
          ${canPost ? `
            <!-- Word-Style Formatting Toolbar -->
            <div class="chat-toolbar">
              <button type="button" class="toolbar-btn" data-fmt="bold" title="Bold (**text**)"><b>B</b></button>
              <button type="button" class="toolbar-btn" data-fmt="italic" title="Italic (*text*)"><i>I</i></button>
              <button type="button" class="toolbar-btn" data-fmt="underline" title="Underline (<u>text</u>)"><u>U</u></button>
              <button type="button" class="toolbar-btn" data-fmt="strike" title="Strikethrough (~~text~~)"><s>S</s></button>
              <button type="button" class="toolbar-btn" data-fmt="code" title="Code block (\`code\`)">&lt;/&gt;</button>
              <button type="button" class="toolbar-btn" data-fmt="bullet" title="Bullet item">• List</button>
              <button type="button" class="toolbar-btn" data-fmt="quote" title="Quote block">&gt; Quote</button>
              <span style="border-left:1px solid var(--line-soft);height:18px;margin:0 4px"></span>
              <button type="button" class="toolbar-btn toolbar-tag-btn urgent" data-tag="#urgent" title="Mark urgent">🚨 #urgent</button>
              <button type="button" class="toolbar-btn toolbar-tag-btn important" data-tag="#important" title="Mark important">⚡ #important</button>
              <button type="button" class="toolbar-btn toolbar-tag-btn announce" data-tag="#announcement" title="Mark announcement">📢 #announcement</button>
              <span style="border-left:1px solid var(--line-soft);height:18px;margin:0 4px"></span>
              <div style="position:relative;display:inline-block">
                <button type="button" class="toolbar-btn" id="mention-toggle-btn" title="Mention team member">@ Mention</button>
                <div class="hidden" id="mention-dropdown" style="position:absolute;bottom:calc(100% + 4px);left:0;background:var(--card);border:1px solid var(--line);border-radius:var(--r-sm);box-shadow:0 8px 24px rgba(20,19,15,.12);min-width:200px;max-height:200px;overflow-y:auto;z-index:30;padding:4px">
                  ${memberList.map(p => `
                    <div class="mention-item" data-mention-name="${esc(p.full_name || p.email)}">
                      <span>@${esc(p.full_name || p.email)}</span>
                      <span class="muted tiny">(${p.access_level})</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Input Textarea -->
            <textarea class="chat-input-area" id="chat-body-input" placeholder="Message #${esc(ch.display_name || ch.name)}… (Press Enter to send, Shift+Enter for new line)" rows="3"></textarea>

            <!-- Actions Bar -->
            <div class="chat-actions-bar">
              <span class="tiny muted">Press <b>Enter</b> to send · <b>Shift+Enter</b> for new line · Style with <b>#urgent</b> or <b>@mentions</b></span>
              <button class="btn primary sm" id="chat-send-btn" type="button" style="padding:6px 18px;display:flex;align-items:center;gap:6px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                <span>Send</span>
              </button>
            </div>
          ` : `
            <div style="padding:16px;text-align:center;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--line-soft)">
              <span class="small muted">📢 This is an official announcements channel. Broadcast posting is restricted to administrators.</span>
            </div>
          `}
        </div>
      `;

      // Auto-scroll messages to bottom
      const stream = $('#chat-stream');
      if (stream) stream.scrollTop = stream.scrollHeight;

      // Mobile back to channels button
      $('#chat-mobile-back')?.addEventListener('click', () => {
        $('.chat-container', v)?.classList.remove('view-room');
      });

      // Refresh button
      $('#chat-refresh-btn')?.addEventListener('click', () => renderChannelRoom(ch));

      // Initialize action dropdowns inside room
      window.DS.initActionMenus(room);

      // Delete message handler
      $$('[data-del-chat]', room).forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this message?')) return;
        b.disabled = true;
        const { error } = await sb.from('channel_updates').delete().eq('id', b.dataset.delChat);
        if (error) { toast(error.message, true); b.disabled = false; return; }
        toast('✓ Message deleted');
        renderChannelRoom(ch);
      }));

      if (!canPost) return;

      const textarea = $('#chat-body-input');
      const sendBtn = $('#chat-send-btn');
      const mentionBtn = $('#mention-toggle-btn');
      const mentionMenu = $('#mention-dropdown');

      // Toolbar formatting handlers
      $$('[data-fmt]', room).forEach(btn => btn.addEventListener('click', () => {
        const fmt = btn.dataset.fmt;
        if (fmt === 'bold') insertFormatting(textarea, '**', '**');
        else if (fmt === 'italic') insertFormatting(textarea, '*', '*');
        else if (fmt === 'underline') insertFormatting(textarea, '<u>', '</u>');
        else if (fmt === 'strike') insertFormatting(textarea, '~~', '~~');
        else if (fmt === 'code') insertFormatting(textarea, '`', '`');
        else if (fmt === 'bullet') insertFormatting(textarea, '• ');
        else if (fmt === 'quote') insertFormatting(textarea, '> ');
      }));

      // Toolbar priority tag handlers
      $$('[data-tag]', room).forEach(btn => btn.addEventListener('click', () => {
        insertFormatting(textarea, btn.dataset.tag + ' ');
      }));

      // Mention toggle and insert
      mentionBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        mentionMenu?.classList.toggle('hidden');
      });
      document.addEventListener('click', () => mentionMenu?.classList.add('hidden'), { once: true });
      $$('.mention-item', room).forEach(item => item.addEventListener('click', () => {
        const name = item.dataset.mentionName;
        insertFormatting(textarea, `@${name} `);
        mentionMenu?.classList.add('hidden');
      }));

      // Send message function
      async function sendMessage() {
        const text = textarea.value.trim();
        if (!text) return;
        sendBtn.disabled = true;

        const isUrgent = text.toLowerCase().includes('#urgent');
        const isAnnounce = text.toLowerCase().includes('#announcement') || ch.kind === 'announcements';
        const updateType = isUrgent ? 'priority' : isAnnounce ? 'announcement' : 'general';

        const { error } = await sb.from('channel_updates').insert({
          channel_id: ch.id,
          author_id: S.user.id,
          title: text.slice(0, 60),
          body: text,
          update_type: updateType,
          status: 'published',
        });

        if (error) {
          toast(error.message, true);
          sendBtn.disabled = false;
          return;
        }

        toast('✓ Message sent');
        textarea.value = '';
        sendBtn.disabled = false;
        await renderChannelRoom(ch);
      }

      sendBtn?.addEventListener('click', sendMessage);

      // Keyboard handler: Enter to send, Shift+Enter for newline
      textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    // Initialize with current channel
    if (currentChannel) {
      await renderChannelRoom(currentChannel);
    }
  };

  // Shared routes
  window.DS.registerRoute('channels', {
    get title() { return 'Channels & Workspace Chat'; },
    get sub() { return isAdmin() ? 'Team channels, official announcements and live discussions' : 'General workspace, unit channels and announcements'; },
    render: async (v) => {
      await window.DS.renderChannelsWorkspace(v, { isAdmin: isAdmin() });
    },
  });

  window.renderChannelsView = async function (v) {
    await window.DS.renderChannelsWorkspace(v, { isAdmin: false });
  };

  // ── NOTIFICATIONS ──
  window.renderNotifications = async function (v) {
    const { data } = await sb.from('notifications').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(40);
    v.innerHTML = `<div class="card">
      <div class="card-head"><h3>All notifications</h3><button class="btn sm ghost" id="mark-read">Mark all read</button></div>
      ${(data && data.length) ? data.map(n => `<div class="row">
        <div class="row-main"><div class="t">${esc(n.title)}</div>${n.body ? `<div class="s">${esc(n.body)}</div>` : ''}<div class="tiny muted">${fmtDT(n.created_at)}</div></div>
        ${n.read ? '<span class="tag muted-tag">Read</span>' : '<span class="tag">New</span>'}
        ${n.link_tab ? `<button class="btn sm" data-ntab="${n.link_tab}" data-nid="${n.id}">Open</button>` : ''}
      </div>`).join('') : `<div class="empty"><div class="big">No notifications</div><div class="hint">Scores, reports, meetings and announcements land here.</div></div>`}
    </div>`;
    $('#mark-read').addEventListener('click', async () => {
      await sb.from('notifications').update({ read: true }).eq('user_id', S.user.id).eq('read', false);
      window.DS.loadNotifBadge(); window.DS.navigate('notifications');
    });
    $$('[data-ntab]', v).forEach(b => b.addEventListener('click', async () => {
      await sb.from('notifications').update({ read: true }).eq('id', b.dataset.nid);
      window.DS.loadNotifBadge();
      window.DS.navigate(b.dataset.ntab);
    }));
  };

  // ── PROFILE ──
  window.renderProfilePage = async function (v) {
    const p = S.profile || {};
    v.innerHTML = `<div class="card">
      <div class="card-head">
        <div>
          <h3>Profile</h3>
          <p class="small muted" style="margin-top:2px">Your account details</p>
        </div>
        <button type="button" class="btn sm" id="profile-signout-btn" style="color:var(--alert);border-color:var(--alert)">Sign out</button>
      </div>
      <dl class="kv">
        <dt>Name</dt><dd>${esc(p.full_name || '—')}</dd>
        <dt>Email</dt><dd>${esc(p.email || '—')}</dd>
        <dt>Role</dt><dd>${esc(p.access_level || 'Member')}</dd>
        <dt>Status</dt><dd>${p.active === false ? '<span class="tag alert">Deactivated</span>' : '<span class="tag ok">Active</span>'}</dd>
      </dl></div>
      <div class="card"><div class="card-head"><h3>Change password</h3></div>
        <form id="cp-form" novalidate>
          <div class="field"><label class="label" for="cp1">New password</label><input class="input" id="cp1" type="password" minlength="6" required autocomplete="new-password"></div>
          <button class="btn" type="submit">Update password</button>
        </form></div>`;
    $('#cp-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: $('#cp1').value });
      if (error) return toast(error.message, true);
      toast('Password updated.');
    });
    $('#profile-signout-btn')?.addEventListener('click', () => {
      if (window.DS?.auth?.signOut) {
        window.DS.auth.signOut();
      }
    });
  };
})();
