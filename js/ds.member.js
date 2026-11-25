/* Nodaar DS — member screens + shared screens (notifications, profile) */
(function () {
  const { $, $$, esc, S, sb, nameOf, lateBy } = window.DS;
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
      return `<button class="btn accent" data-goto="report">Write today's report</button>`;
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
    const { data: latestScoredReport } = await sb.from('daily_reports').select('score').eq('user_id', S.user.id).not('score', 'is', null).order('report_date', { ascending: false }).limit(1).maybeSingle();
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
        <div class="stat ${report ? (report.status === 'Approved' ? 'ok' : report.is_late ? 'alert' : 'accent') : 'accent'}"><div class="num">${report ? (report.status === 'Approved' ? 'Approved' : report.is_late ? 'Late' : 'Submitted') : (draft ? 'Draft' : '—')}</div><div class="cap">Today's report</div></div>
        <div class="stat"><div class="num">${openTasks.length}</div><div class="cap">Open tasks</div></div>
        <div class="stat ${overdue.length ? 'alert' : ''}"><div class="num ${overdue.length ? 'alert-text' : ''}">${overdue.length}</div><div class="cap">Overdue</div></div>
        <div class="stat ${headlineScore != null ? 'ok' : ''}"><div class="num">${headlineScore != null ? headlineScore + '%' : '—'}</div><div class="cap">Latest score</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Today's daily report — ${fmtD(date)}</h3>
            <p class="small muted" style="margin-top:2px">Daily scrum reflection &amp; admin approval status</p>
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
            <button class="btn accent sm" data-goto="report">Resume draft</button>
          </div>
        ` : `<p class="muted small" style="margin-bottom:12px">You have not submitted today's daily scrum report yet. The deadline is 18:00 WAT.</p>`)}
        <div><button class="btn ${report ? '' : 'accent'}" data-goto="report">${report ? 'Edit / resubmit report' : "Write today's report"}</button></div>
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
        <div class="card-head">
          <div>
            <h3>My tasks</h3>
            <p class="small muted" style="margin-top:2px">${openTasks.length} active · ${(tasks || []).filter(t => t.status === 'Done').length} completed</p>
          </div>
          <button class="btn sm ghost" data-goto="tasks">View all</button>
        </div>
        ${openTasks.length ? openTasks.slice(0, 5).map(t => `
          <div class="row"><div class="row-main">
            <div class="t" style="word-break:normal;overflow-wrap:break-word">${esc(t.title)} ${t.due_date && t.due_date < date ? '<span class="tag alert">Overdue</span>' : ''}</div>
            <div class="s">${esc(t.status || 'To do')} · due ${fmtD(t.due_date)}${t.priority ? ' · ' + esc(t.priority) : ''}</div>
          </div>
          <button type="button" class="btn sm ghost" data-dash-view-task="${t.id}" style="padding:2px 8px;font-size:12px">View</button>
          </div>`).join('') : `<div class="empty" style="padding:20px"><div class="hint">${(tasks || []).length ? `All ${(tasks || []).length} assigned tasks completed ✓` : 'No open tasks. Nice.'}</div></div>`}
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
        <div class="card-head"><h3>My units &amp; OKRs</h3><button class="btn sm ghost" data-goto="units">View all</button></div>
        ${units.length ? units.map(u => `<div class="row"><div class="row-main"><div class="t" style="word-break:normal;overflow-wrap:break-word">${esc(u.units?.name || 'Unit')}</div><div class="s">${u.units?.description ? esc(u.units.description) + ' · ' : ''}Role: ${esc(u.positions?.title || 'Member')}</div></div><span class="tag brand">${esc(u.positions?.title || 'Member')}</span></div>`).join('')
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
        const initDone = existing?.did_yesterday || (draft ? draft.did_yesterday : '') || '';
        const initPlan = existing?.doing_today || (draft ? draft.doing_today : '') || '';
        const initBlock = existing?.blockers || (draft ? draft.blockers : '') || '';
        const initEv = existing?.evidence_url || (draft ? draft.evidence_url : '') || '';
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
        discardBtn?.addEventListener('click', async () => {
          const ok = await window.DS.confirmModal({
            title: 'Discard draft',
            message: 'Discard this saved daily report draft? Unsaved changes will be lost.',
            confirmLabel: 'Discard draft',
            isAlert: true,
          });
          if (!ok) return;
          localStorage.removeItem(draftKey);
          toast('Draft discarded');
          window.DS.navigate('report');
        });

        const fillReportForm = (r) => {
          $('#dr-done').value = r.did_yesterday || '';
          $('#dr-plan').value = r.doing_today || '';
          $('#dr-block').value = r.blockers || '';
          $('#dr-ev').value = r.evidence_url || '';
          $('#dr-done').focus();
          toast('Loaded report into form.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        const deleteReportById = async (repId, btnEl) => {
          const ok = await window.DS.confirmModal({
            title: 'Delete daily report',
            message: 'Are you sure you want to permanently delete this daily report submission?',
            confirmLabel: 'Delete report',
            isAlert: true,
          });
          if (!ok) return;
          if (btnEl) btnEl.disabled = true;
          const { error } = await sb.from('daily_reports').delete().eq('id', repId);
          if (error) { toast(error.message, true); if (btnEl) btnEl.disabled = false; return; }
          toast('✓ Report deleted');
          window.DS.navigate('report');
        };

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
                ? { label: 'Edit in form', className: 'primary', onClick: () => fillReportForm(r) }
                : null,
              r.evidence_url ? { label: 'Open drive link ↗', href: r.evidence_url } : null,
              isAdmin() ? { label: 'Delete report', className: 'alert', onClick: () => deleteReportById(r.id) } : null
            ]
          });
        };

        $$('[data-view-rep]', v).forEach(b => b.addEventListener('click', () => openReportModal(b.dataset.viewRep)));

        // Edit past report handler
        $$('[data-fill-rep]', v).forEach(b => b.addEventListener('click', () => {
          const r = myRecords.find(item => item.id === b.dataset.fillRep);
          if (r) fillReportForm(r);
        }));

        // Admin delete report submission action
        $$('[data-del-rep]', v).forEach(b => b.addEventListener('click', () => deleteReportById(b.dataset.delRep, b)));

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
    const [{ data }, { data: myUpdates }] = await Promise.all([
      sb.from('tasks').select('*, task_assignees!inner(user_id)').eq('task_assignees.user_id', S.user.id).order('due_date'),
      sb.from('task_updates').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }),
    ]);
    const date = todayLagos();
    const list = data || [];
    const updates = myUpdates || [];
    let taskFilter = 'all';
    let taskPage = 1;

    const isDoneTask = (t) => String(t?.status || '').toLowerCase() === 'done';
    const isReviewTask = (t) => String(t?.status || '').toLowerCase().includes('review');

    function renderTasksView() {
      const doneList = list.filter(isDoneTask);
      const reviewList = list.filter(t => !isDoneTask(t) && isReviewTask(t));
      const activeList = list.filter(t => !isDoneTask(t) && !isReviewTask(t));
      const overdueCount = list.filter(t => t.due_date && t.due_date < date && !isDoneTask(t)).length;

      const filtered = list.filter(t => {
        if (taskFilter === 'done') return isDoneTask(t);
        if (taskFilter === 'review') return !isDoneTask(t) && isReviewTask(t);
        if (taskFilter === 'active') return !isDoneTask(t) && !isReviewTask(t);
        return true;
      });

      const pg = window.DS.paginate(filtered, taskPage, 25);
      v.innerHTML = `
        <div class="stat-grid">
          <div class="stat"><div class="num">${activeList.length}</div><div class="cap">Active</div></div>
          <div class="stat accent"><div class="num">${reviewList.length}</div><div class="cap">In review</div></div>
          <div class="stat ok"><div class="num">${doneList.length}</div><div class="cap">Completed ✓</div></div>
          <div class="stat ${overdueCount ? 'alert' : ''}"><div class="num ${overdueCount ? 'alert-text' : ''}">${overdueCount}</div><div class="cap">Overdue</div></div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h3>My tasks</h3>
              <p class="small muted" style="margin-top:2px">Track deliverables, update status, attach evidence, or mark completed</p>
            </div>
            <span class="tag muted-tag">${pg.curPage} / ${pg.totalPages}</span>
          </div>

          <div class="rq-toolbar">
            <div class="filter-chips" role="tablist" aria-label="Filter tasks by completion">
              <button type="button" class="filter-chip ${taskFilter === 'all' ? 'active' : ''}" data-tfilter="all">All <span class="chip-count">${list.length}</span></button>
              <button type="button" class="filter-chip ${taskFilter === 'active' ? 'active' : ''}" data-tfilter="active">Active <span class="chip-count">${activeList.length}</span></button>
              <button type="button" class="filter-chip ${taskFilter === 'review' ? 'active' : ''}" data-tfilter="review">In Review <span class="chip-count">${reviewList.length}</span></button>
              <button type="button" class="filter-chip ${taskFilter === 'done' ? 'active' : ''}" data-tfilter="done">Completed ✓ <span class="chip-count">${doneList.length}</span></button>
            </div>
          </div>

          ${pg.items.length ? `
            <div class="ds-list">
              ${pg.items.map(t => {
                const isDone = isDoneTask(t);
                const isReview = isReviewTask(t);
                const overdue = t.due_date && t.due_date < date && !isDone;
                const latestUpd = updates.find(u => u.task_id === t.id);
                const actions = [
                  { label: 'View task details', icon: '📋', attrs: `data-view-task="${t.id}"` },
                  !isDone ? { label: 'Update status / evidence', icon: '✏️', attrs: `data-update-task="${t.id}"` } : null,
                  !isDone ? { label: 'Mark Completed ✓', icon: '✅', attrs: `data-quick-done="${t.id}"` } : null,
                  (!isDone && !isReview) ? { label: 'Submit for Review', icon: '⏳', attrs: `data-quick-review="${t.id}"` } : null,
                  { divider: true },
                  !isDone ? { label: 'Request extension', icon: '⏱️', attrs: `data-ext="${t.id}"` } : null,
                  t.evidence_url ? { label: 'Open evidence link', icon: '↗', attrs: `onclick="window.open('${esc(t.evidence_url)}', '_blank')"` } : null,
                ];
                return `
                  <div class="ds-list-card ${isDone ? 'task-done' : ''}">
                    <div class="ds-list-main">
                      <div class="ds-list-icon">${isDone ? '✅' : isReview ? '⏳' : '📋'}</div>
                      <div class="ds-list-content">
                        <div class="ds-list-title-row">
                          <span class="ds-list-title">${esc(t.title)}${t.extension_requested && !isDone ? ' <span class="tag muted-tag">Extension</span>' : ''}</span>
                          <span class="tag ${isDone ? 'ok' : isReview ? 'brand' : (t.status === 'In Progress' || t.status === 'In progress') ? '' : 'muted-tag'}">${isDone ? '✓ Completed' : esc(t.status || 'To do')}</span>
                          ${overdue ? '<span class="tag alert">Overdue</span>' : ''}
                        </div>
                        <div class="ds-list-sub">
                          Due ${t.due_date ? fmtD(t.due_date) : 'No due date'}${t.priority ? ' · ' + esc(t.priority) : ''}${t.evidence_url ? ` · <a href="${esc(t.evidence_url)}" target="_blank" rel="noopener">Evidence ↗</a>` : ''}
                        </div>
                        ${t.description ? `<div class="ds-list-snippet">${esc(t.description.slice(0, 140))}${t.description.length > 140 ? '…' : ''}</div>` : ''}
                        ${latestUpd ? `<div class="ds-list-sub" style="margin-top:4px"><span>Latest note (${fmtD(latestUpd.update_date)}): ${esc((latestUpd.description || '').slice(0, 90))}</span></div>` : ''}
                      </div>
                    </div>
                    <div class="ds-list-actions">
                      ${!isDone ? `<button type="button" class="btn sm ${isReview ? '' : 'primary'}" data-update-task="${t.id}">${isReview ? 'Update' : 'Complete'}</button>` : ''}
                      <button type="button" class="btn sm" data-view-task="${t.id}">View</button>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${pg.renderBar('tasks')}
          ` : `<div class="empty"><div class="big">${taskFilter === 'all' ? 'No tasks assigned' : 'No matching tasks'}</div><div class="hint">${taskFilter === 'all' ? 'Tasks assigned to you will appear here.' : 'Switch filter tabs above to view other deliverables.'}</div></div>`}
        </div>`;

      const saveTaskProgress = async (taskId, { status, evidenceUrl, note }) => {
        const t = list.find(x => x.id === taskId);
        if (!t) return false;
        const patch = { status };
        if (evidenceUrl !== undefined) patch.evidence_url = evidenceUrl || null;

        let updatedTaskRow = false;
        try {
          const { data: rows, error: tErr } = await sb.from('tasks').update(patch).eq('id', taskId).select('id');
          if (!tErr && rows && rows.length) {
            updatedTaskRow = true;
            t.status = status;
            if (evidenceUrl !== undefined) t.evidence_url = evidenceUrl || null;
          }
        } catch {}

        const pctMap = { 'To Do': 0, 'In Progress': 50, 'In Review': 90, 'Done': 100 };
        const updPayload = {
          task_id: taskId,
          user_id: S.user.id,
          update_date: date,
          progress_pct: pctMap[status] ?? 0,
          description: (note || '').trim() || `Marked status as ${status}`,
          drive_link: (evidenceUrl !== undefined ? evidenceUrl : t.evidence_url) || null,
          update_type: status === 'Done' ? 'completion' : 'progress',
        };
        const { error: updErr } = await sb.from('task_updates').upsert(updPayload, { onConflict: 'task_id,user_id,update_date' });
        if (updErr && !updatedTaskRow) {
          toast('Could not update task right now.', true);
          return false;
        }

        if (status === 'Done' || status === 'In Review') {
          try {
            const { data: admins } = await sb.from('profiles').select('id').eq('access_level', 'Admin');
            const who = S.profile?.full_name || S.user?.email || 'Team member';
            const nTitle = status === 'Done' ? `✅ Task completed: ${t.title}` : `⏳ Task ready for review: ${t.title}`;
            const nBody = `${who} marked "${t.title}" as ${status}.${note ? ' Note: ' + note : ''}`;
            await Promise.allSettled((admins || []).map(a =>
              sb.from('notifications').insert({ user_id: a.id, type: 'task', title: nTitle, body: nBody, link_tab: 'tasks' })
            ));
          } catch {}
        }

        if (updatedTaskRow) {
          toast(status === 'Done' ? '✓ Task marked Completed!' : `✓ Task moved to ${status}`);
        } else {
          toast('✓ Completion note logged. Admin notified to confirm status.');
        }
        window.DS.navigate('tasks');
        return true;
      };

      const openUpdateTaskModal = (taskId, presetStatus) => {
        const t = list.find(x => x.id === taskId);
        if (!t) return;
        const initialStatus = presetStatus || (t.status === 'To Do' || t.status === 'To do' ? 'Done' : (t.status || 'Done'));
        const norm = (s) => {
          const low = String(s || '').toLowerCase();
          if (low === 'in progress') return 'In Progress';
          if (low === 'in review') return 'In Review';
          if (low === 'done') return 'Done';
          return 'To Do';
        };
        const selVal = norm(initialStatus);
        window.DS.modal.open(`
          <div class="modal-head">
            <div>
              <h2>Update task progress</h2>
              <p class="small muted" style="margin-top:4px">${esc(t.title)}</p>
            </div>
          </div>
          <form id="tu-form" novalidate>
            <div class="field">
              <label class="label" for="tu-status">Task status</label>
              <select class="input" id="tu-status">
                <option value="To Do" ${selVal === 'To Do' ? 'selected' : ''}>To Do</option>
                <option value="In Progress" ${selVal === 'In Progress' ? 'selected' : ''}>In Progress</option>
                <option value="In Review" ${selVal === 'In Review' ? 'selected' : ''}>In Review (Submit for Admin check)</option>
                <option value="Done" ${selVal === 'Done' ? 'selected' : ''}>Completed (Done ✓)</option>
              </select>
            </div>
            <div class="field">
              <label class="label" for="tu-ev">Evidence link (optional)</label>
              <input class="input" id="tu-ev" type="url" value="${esc(t.evidence_url || '')}" placeholder="https://drive.google.com/…">
            </div>
            <div class="field">
              <label class="label" for="tu-note">Completion / progress note (optional)</label>
              <textarea class="input" id="tu-note" placeholder="Summarize what you finished or link any deliverable notes…"></textarea>
            </div>
            <div class="modal-actions">
              <button class="btn primary" id="tu-submit" type="submit">Save task status</button>
              <button class="btn" type="button" id="tu-cancel">Cancel</button>
            </div>
          </form>
        `);
        $('#tu-cancel')?.addEventListener('click', window.DS.modal.close);
        $('#tu-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = $('#tu-submit');
          if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
          const ok = await saveTaskProgress(t.id, {
            status: $('#tu-status').value,
            evidenceUrl: $('#tu-ev').value.trim(),
            note: $('#tu-note').value.trim(),
          });
          if (ok) window.DS.modal.close();
          else if (btn) { btn.disabled = false; btn.textContent = 'Save task status'; }
        });
      };

      const requestExtension = async (taskId) => {
        const t = list.find(x => x.id === taskId);
        const reason = await window.DS.promptModal({
          title: 'Request deadline extension',
          subtitle: t ? `Task: ${t.title}` : '',
          label: 'Reason for extension',
          placeholder: 'Briefly explain why you need more time and the expected completion date…',
          multiline: true,
          confirmLabel: 'Send request',
        });
        if (!reason) return;
        try {
          const { error: extErr } = await sb.from('task_updates').upsert({
            task_id: taskId, user_id: S.user.id,
            update_date: date,
            description: 'Extension requested: ' + reason,
            update_type: 'extension_request',
          }, { onConflict: 'task_id,user_id,update_date' });
          if (extErr) throw extErr;
        } catch (e) { toast('Could not send the request.', true); return; }
        await sb.from('tasks').update({ extension_requested: true, extension_note: reason }).eq('id', taskId);
        toast('✓ Extension request sent to admin.');
        window.DS.navigate('tasks');
      };

      const openTaskModal = (taskId) => {
        const t = list.find(x => x.id === taskId);
        if (!t) return;
        const isDone = isDoneTask(t);
        const isReview = isReviewTask(t);
        const overdue = t.due_date && t.due_date < date && !isDone;
        const taskLogs = updates.filter(u => u.task_id === t.id);
        window.DS.showDetailsModal({
          title: t.title,
          subtitle: `Task · Due ${t.due_date ? fmtD(t.due_date) : 'No due date'}`,
          badgeHtml: `<span class="tag ${isDone ? 'ok' : isReview ? 'brand' : 'muted-tag'}">${isDone ? '✓ Completed' : esc(t.status || 'To do')}</span>`,
          rows: [
            { label: 'Task title', value: t.title },
            { label: 'Description', value: t.description || 'No additional description provided' },
            { label: 'Current status', isHtml: true, value: isDone ? '<span class="tag ok">✓ Completed (Done)</span>' : esc(t.status || 'To do') },
            { label: 'Priority', value: t.priority || 'Normal' },
            { label: 'Due date', isHtml: true, value: overdue ? `<span class="tag alert">Overdue ${fmtD(t.due_date)}</span>` : (t.due_date ? fmtD(t.due_date) : '—') },
            { label: 'Extension requested', isHtml: true, value: t.extension_requested ? `<span class="tag alert">Yes (${esc(t.extension_note || 'Requested by you')})</span>` : 'No' },
            { label: 'Evidence link', isHtml: true, value: t.evidence_url ? `<a href="${esc(t.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost" style="padding:2px 8px;font-size:12px">Open evidence link ↗</a>` : '<span class="muted">None submitted</span>' },
            taskLogs.length ? { label: 'My updates', isHtml: true, value: taskLogs.slice(0, 4).map(u => `<div class="small" style="margin-bottom:4px"><b>${fmtD(u.update_date)}</b>: ${esc(u.description)}</div>`).join('') } : null,
            { label: 'Task ID', value: t.id }
          ].filter(Boolean),
          actions: [
            t.evidence_url ? { label: 'Open evidence ↗', href: t.evidence_url } : null,
            !isDone ? { label: 'Complete / Update ✓', className: 'primary', onClick: () => openUpdateTaskModal(t.id, 'Done') } : null,
            !isDone ? { label: 'Request extension', onClick: () => requestExtension(t.id) } : null,
          ]
        });
      };

      $$('[data-tfilter]', v).forEach(b => b.addEventListener('click', () => {
        taskFilter = b.dataset.tfilter;
        taskPage = 1;
        renderTasksView();
      }));

      $$('[data-view-task]', v).forEach(b => b.addEventListener('click', () => openTaskModal(b.dataset.viewTask)));
      $$('[data-update-task]', v).forEach(b => b.addEventListener('click', () => openUpdateTaskModal(b.dataset.updateTask)));
      $$('[data-quick-done]', v).forEach(b => b.addEventListener('click', () => openUpdateTaskModal(b.dataset.quickDone, 'Done')));
      $$('[data-quick-review]', v).forEach(b => b.addEventListener('click', () => openUpdateTaskModal(b.dataset.quickReview, 'In Review')));
      $$('[data-ext]', v).forEach(b => b.addEventListener('click', () => requestExtension(b.dataset.ext)));

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
    const unitIds = units.map(u => u.unit_id).filter(Boolean);
    const [okrRes, matesRes, leadsRes] = await Promise.all([
      unitIds.length
        ? sb.from('okrs').select('*, units:unit_id(name), key_results:key_results(*)').or(`unit_id.is.null,unit_id.in.(${unitIds.join(',')})`)
        : sb.from('okrs').select('*, units:unit_id(name), key_results:key_results(*)').is('unit_id', null),
      unitIds.length
        ? sb.from('unit_members').select('unit_id, user_id, profiles:user_id(id,full_name,email), positions:position_id(title)').in('unit_id', unitIds)
        : Promise.resolve({ data: [] }),
      sb.from('profiles').select('id,full_name,email').eq('active', true),
    ]);
    const okrs = okrRes.data || [];
    const mates = matesRes.data || [];
    const leadMap = Object.fromEntries((leadsRes.data || []).map(p => [p.id, p]));
    const doneOkrs = okrs.filter(o => o.status === 'Done' || (o.progress || 0) >= 100).length;

    v.innerHTML = `
      <div class="stat-grid">
        <div class="stat accent"><div class="num">${units.length}</div><div class="cap">My units</div></div>
        <div class="stat"><div class="num">${okrs.length}</div><div class="cap">Shared OKRs</div></div>
        <div class="stat ok"><div class="num">${doneOkrs}</div><div class="cap">Completed OKRs</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>My units</h3>
            <p class="small muted" style="margin-top:2px">Teams you belong to, your role, and unit teammates</p>
          </div>
          <span class="tag muted-tag">${units.length} unit${units.length === 1 ? '' : 's'}</span>
        </div>
        ${units.length ? units.map(u => {
          const unitObj = u.units || {};
          const unitMates = mates.filter(m => m.unit_id === u.unit_id);
          const lead = unitObj.lead_id ? leadMap[unitObj.lead_id] : null;
          return `
            <div class="unit-card">
              <div class="unit-card-head">
                <div class="ds-list-main">
                  <div class="ds-list-icon">🏢</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(unitObj.name || 'Unit')}</span>
                      <span class="tag brand">${esc(u.positions?.title || 'Member')}</span>
                      <span class="tag muted-tag">${unitMates.length} member${unitMates.length === 1 ? '' : 's'}</span>
                    </div>
                    <div class="ds-list-sub">
                      ${lead ? `<span>Lead: <b>${esc(nameOf(lead))}</b></span>` : '<span>No lead assigned</span>'}
                      ${unitObj.description ? `<span>·</span><span>${esc(unitObj.description)}</span>` : ''}
                    </div>
                  </div>
                </div>
                <button type="button" class="btn sm" data-view-unit="${u.unit_id}">View team</button>
              </div>
              ${unitMates.length ? `
                <div class="unit-card-body">
                  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    ${unitMates.slice(0, 6).map(m => {
                      const nm = nameOf(m.profiles);
                      return `<span class="tag muted-tag" title="${esc(nm)} (${esc(m.positions?.title || 'Member')})">${esc(nm)}${m.positions?.title ? ' · ' + esc(m.positions.title) : ''}</span>`;
                    }).join('')}
                    ${unitMates.length > 6 ? `<span class="tiny muted">+${unitMates.length - 6} more</span>` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')
        : `<div class="empty"><div class="big">No units yet</div><div class="hint">An admin will assign you to a unit.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>OKRs shared with your units</h3>
            <p class="small muted" style="margin-top:2px">Objectives and key results aligned with your team</p>
          </div>
          <span class="tag muted-tag">${okrs.length} total</span>
        </div>
        ${okrs.length ? `
          <div class="ds-list">
            ${okrs.map(o => {
              const krs = o.key_results || [];
              const prog = Math.max(0, Math.min(100, Number(o.progress || 0)));
              return `
                <div class="ds-list-card">
                  <div class="ds-list-main">
                    <div class="ds-list-icon">🎯</div>
                    <div class="ds-list-content">
                      <div class="ds-list-title-row">
                        <span class="ds-list-title">${esc(o.title || o.objective || 'OKR')}</span>
                        <span class="tag ${o.status === 'Done' ? 'ok' : o.status === 'Off Track' ? 'alert' : o.status === 'At Risk' ? 'brand' : 'muted-tag'}">${esc(o.status || 'On Track')}</span>
                        <span class="tag muted-tag">${esc(o.units?.name || 'Company-wide')}</span>
                      </div>
                      ${o.description ? `<div class="ds-list-sub">${esc(o.description)}</div>` : ''}
                      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;max-width:380px">
                        <div class="progress" style="flex:1"><div style="width:${prog}%"></div></div>
                        <span class="small" style="font-weight:800;font-variant-numeric:tabular-nums">${prog}%</span>
                      </div>
                      ${krs.length ? `<div class="ds-list-snippet">${krs.map(k => `${esc(k.title)} (<b>${k.progress || 0}%</b>)`).join(' · ')}</div>` : ''}
                    </div>
                  </div>
                  <div class="ds-list-actions">
                    <button type="button" class="btn sm" data-view-okr="${o.id}">View</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `<div class="empty"><div class="big">No OKRs shared</div><div class="hint">OKRs for your units will appear here.</div></div>`}
      </div>`;

    $$('[data-view-unit]', v).forEach(b => b.addEventListener('click', () => {
      const u = units.find(x => x.unit_id === b.dataset.viewUnit);
      if (!u) return;
      const unitObj = u.units || {};
      const unitMates = mates.filter(m => m.unit_id === u.unit_id);
      const lead = unitObj.lead_id ? leadMap[unitObj.lead_id] : null;
      window.DS.showDetailsModal({
        title: unitObj.name || 'Unit',
        subtitle: unitObj.description || 'Unit roster and your role',
        badgeHtml: `<span class="tag brand">${esc(u.positions?.title || 'Member')}</span>`,
        rows: [
          { label: 'Unit name', value: unitObj.name || '—' },
          { label: 'Your role', value: u.positions?.title || 'Member' },
          { label: 'Unit lead', value: lead ? nameOf(lead) : 'No lead assigned' },
          {
            label: `Members (${unitMates.length})`,
            isHtml: true,
            value: unitMates.length
              ? unitMates.map(m => `<div><b>${esc(nameOf(m.profiles))}</b> · <span class="muted">${esc(m.positions?.title || 'Member')}</span></div>`).join('')
              : 'No members listed'
          }
        ]
      });
    }));

    $$('[data-view-okr]', v).forEach(b => b.addEventListener('click', () => {
      const o = okrs.find(x => x.id === b.dataset.viewOkr);
      if (!o) return;
      const krs = o.key_results || [];
      window.DS.showDetailsModal({
        title: o.title || o.objective || 'OKR',
        subtitle: o.units?.name || 'Company-wide',
        badgeHtml: `<span class="tag ${o.status === 'Done' ? 'ok' : o.status === 'Off Track' ? 'alert' : 'brand'}">${esc(o.status || 'On Track')} · ${o.progress || 0}%</span>`,
        rows: [
          { label: 'Objective', value: o.title || o.objective || '—' },
          { label: 'Description', value: o.description || 'No description' },
          { label: 'Scope', value: o.units?.name || 'Company-wide' },
          { label: 'Overall progress', value: `${o.progress || 0}%` },
          {
            label: `Key results (${krs.length})`,
            isHtml: true,
            value: krs.length
              ? krs.map(k => `<div style="margin-bottom:6px"><b>${esc(k.title)}</b> — ${k.progress || 0}%${k.target ? ` (Target: ${esc(k.target)}${k.current ? `, Current: ${esc(k.current)}` : ''})` : ''}</div>`).join('')
              : '<span class="muted">No key results attached yet</span>'
          }
        ]
      });
    }));
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
                  m.notes_link ? { label: 'Notes link', icon: '📄', attrs: `onclick="window.open('${esc(m.notes_link)}', '_blank')"` } : null,
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
            { label: 'Drive notes link', isHtml: true, value: m.notes_link ? `<a href="${esc(m.notes_link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(m.notes_link)} ↗</a>` : '<span class="muted">No notes link posted yet</span>' },
          ],
          actions: [
            m.link ? { label: 'Join meeting ↗', href: m.link } : null,
            { label: 'File report', className: 'primary', onClick: () => meetingReportModal(m.id, m.title) }
          ]
        });
      }));
    }

    renderView();
  };

  function meetingReportModal(meetingId, title) {
    window.DS.modal.open(`
      <div class="modal-head">
        <div>
          <h2 style="margin:0 0 4px">Meeting report</h2>
          <p class="muted small" style="margin:0">${esc(title)}</p>
        </div>
        <button type="button" class="btn sm ghost" id="mr-close" aria-label="Close" style="padding:4px 8px">✕</button>
      </div>
      <form id="mr-form" novalidate>
        <div class="field"><label class="label" for="mr-att">Did you attend?</label>
          <select class="input" id="mr-att"><option value="yes">Yes, attended</option><option value="no">No</option></select></div>
        <div class="field"><label class="label" for="mr-contrib">What did you contribute?</label><textarea class="input" id="mr-contrib" required placeholder="Key points, updates, or action items you took…"></textarea></div>
        <div class="field"><label class="label" for="mr-fb">Feedback on the meeting</label><textarea class="input" id="mr-fb" placeholder="Optional feedback"></textarea></div>
        <div class="modal-actions"><button class="btn" type="button" id="mr-cancel">Cancel</button><button class="btn primary" type="submit" id="mr-submit">Submit</button></div>
      </form>`);
    $('#mr-close')?.addEventListener('click', window.DS.modal.close);
    $('#mr-cancel')?.addEventListener('click', window.DS.modal.close);
    $('#mr-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const contrib = $('#mr-contrib').value.trim();
      if (!contrib) { $('#mr-contrib')?.focus(); return toast('Please describe what you contributed.', true); }
      const btn = $('#mr-submit');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
      await sb.from('meeting_attendance').upsert({
        meeting_id: meetingId, user_id: S.user.id,
        attended: $('#mr-att').value === 'yes',
        note: `Contribution: ${contrib} · Feedback: ${$('#mr-fb').value.trim()}`,
      }, { onConflict: 'meeting_id,user_id' });
      window.DS.modal.close();
      toast('✓ Meeting report submitted.');
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
    const maxH = 140;
    const chartHtml = chart.length ? `<div class="chart">${chart.map((s, idx) => {
      const val = Number(s.manual_override ?? s.weighted_total ?? 0);
      const h = Math.max(4, Math.round((val / 100) * maxH));
      const isLatest = idx === chart.length - 1;
      return `<div class="chart-col" title="${esc(s.periods?.label || '')}: ${val}/100">
        <div class="chart-val">${Math.round(val)}</div>
        <div class="chart-bar ${s.periods?.locked ? 'locked' : (isLatest ? 'latest' : '')}" style="height:${h}px"></div>
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
        <div class="brk-track"><div class="brk-fill ${pct >= 80 ? 'brand' : ''}" style="width:${pct}%"></div></div>
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
        <div class="stat ok"><div class="num">${latestMonthly ? Math.round(latestMonthly.final_score ?? latestMonthly.weekly_avg) + '%' : '—'}</div><div class="cap">Latest monthly</div></div>
        <div class="stat accent"><div class="num">${headline != null ? headline + '%' : '—'}</div><div class="cap">${headlineLabel}</div></div>
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
    let libQuery = '';
    let libCat = '';

    v.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Library</h3>
            <p class="small muted" id="lib-sub" style="margin-top:2px">${list.length} resource${list.length === 1 ? '' : 's'} available to you</p>
          </div>
          <div class="card-head-controls">
            <input class="input" id="lib-q" placeholder="Search…" style="min-height:36px;flex:1 1 170px;min-width:140px;width:auto" aria-label="Search library">
            <select class="input" id="lib-cat" style="min-height:36px;width:auto" aria-label="Filter by category">
              <option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="lib-body"></div>
      </div>`;

    const reportBrokenLink = async (itemId) => {
      await sb.from('library_items').update({ broken_link: true, last_broken_report_at: new Date().toISOString() }).eq('id', itemId);
      await sb.from('notifications').insert({ user_id: S.user.id, type: 'broken_link', title: 'Broken link reported', body: 'library_items:' + itemId, link_tab: 'library' });
      await sb.from('audit_log').insert({ actor_id: S.user.id, action: 'broken_link_reported', target: 'library_items:' + itemId });
      const { data: admins } = await sb.from('profiles').select('id').eq('access_level', 'Admin');
      for (const a of (admins || [])) {
        await sb.from('notifications').insert({ user_id: a.id, type: 'broken_link', title: 'Broken library link reported', body: 'library_items:' + itemId, link_tab: 'library' });
      }
      toast('Reported. Admins were notified.');
      window.DS.navigate('library');
    };

    function renderList() {
      const filtered = list.filter(i => {
        const hay = ((i.title || '') + ' ' + (i.description || '')).toLowerCase();
        return (!libQuery || hay.includes(libQuery)) && (!libCat || (i.category || '') === libCat);
      });
      const pg = window.DS.paginate(filtered, libPage, 25);
      const sub = $('#lib-sub', v);
      if (sub) sub.textContent = (libQuery || libCat)
        ? `${filtered.length} matching resource${filtered.length === 1 ? '' : 's'}`
        : `${list.length} resource${list.length === 1 ? '' : 's'} available to you`;

      const body = $('#lib-body', v);
      if (!body) return;
      body.innerHTML = pg.items.length ? `
        <div id="lib-list" class="ds-list">
          ${pg.items.map(i => {
            const actions = [
              { label: 'View details', icon: '📋', attrs: `data-view-lib="${i.id}"` },
              { label: 'Open link ↗', icon: '↗', attrs: `onclick="window.open('${esc(i.url)}', '_blank')"` },
              { divider: true },
              { label: 'Report broken link', icon: '⚠️', isAlert: true, attrs: `data-broken="${i.id}"` },
            ];
            return `
              <div class="ds-list-card">
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
      ` : `<div class="empty"><div class="big">${(libQuery || libCat) ? 'No matching resources' : 'Nothing shared with you yet'}</div><div class="hint">${(libQuery || libCat) ? 'Try clearing the search or category filter.' : 'Library links granted to you or your units appear here.'}</div></div>`;

      $$('[data-view-lib]', body).forEach(b => b.addEventListener('click', () => {
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
            { label: 'Open document ↗', className: 'primary', href: item.url },
            { label: 'Report broken', className: 'ghost alert', onClick: () => reportBrokenLink(item.id) }
          ]
        });
      }));
      $$('[data-broken]', body).forEach(b => b.addEventListener('click', () => reportBrokenLink(b.dataset.broken)));
      window.DS.initActionMenus(body);
      window.DS.bindPagination(body, (p) => { libPage = p; renderList(); });
    }

    $('#lib-q')?.addEventListener('input', (e) => { libQuery = e.target.value.toLowerCase().trim(); libPage = 1; renderList(); });
    $('#lib-cat')?.addEventListener('change', (e) => { libCat = e.target.value; libPage = 1; renderList(); });
    renderList();
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

  let activeChatRt = null;
  let activeChatVvHandler = null;
  let activeTypingGc = null;

  window.DS.cleanupChannelsRealtime = function () {
    if (activeTypingGc) { clearInterval(activeTypingGc); activeTypingGc = null; }
    if (activeChatVvHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', activeChatVvHandler);
      window.visualViewport.removeEventListener('scroll', activeChatVvHandler);
      activeChatVvHandler = null;
    }
    document.documentElement.style.removeProperty('--chat-room-h');
    document.documentElement.style.removeProperty('--mob-bar-h');
    if (activeChatRt) {
      try { sb.removeChannel(activeChatRt); } catch {}
      activeChatRt = null;
    }
  };

  function formatChatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatChatDay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, now)) return 'Today';
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (sameDay(d, yest)) return 'Yesterday';
    return d.toLocaleDateString([], { dateStyle: 'medium' });
  }

  window.DS.renderChannelsWorkspace = async function (v, options = {}) {
    window.DS.cleanupChannelsRealtime();
    document.body.classList.remove('chat-room-open');

    const adminMode = options.isAdmin ?? isAdmin();
    const [{ data: channels }, { data: people }] = await Promise.all([
      sb.from('channels').select('*').order('created_at'),
      sb.from('profiles').select('id, full_name, email, access_level').eq('active', true).order('full_name'),
    ]);
    const channelList = channels || [];
    const memberList = people || [];
    const memberMap = Object.fromEntries(memberList.map(p => [p.id, p]));

    // Categorize channels into Announcements, General Workspaces, and Units
    const annChannels = channelList.filter(c => c.kind === 'announcements');
    const generalChannels = channelList.filter(c => c.kind === 'general' || (!c.kind && !c.unit_id));
    const unitChannels = channelList.filter(c => c.kind === 'unit' || c.unit_id);

    // Initial selected channel
    let currentChannel = channelList.find(c => c.name === 'general') || channelList[0];

    const renderChannelBtn = (c, icon, badgeHtml) => `
      <button class="channel-btn ${c.id === currentChannel?.id ? 'active' : ''}" data-chid="${c.id}" data-name="${esc(c.display_name || c.name)}" data-kind="${esc(c.kind || '')}">
        <span class="ch-icon" aria-hidden="true">${icon}</span>
        <span class="ch-meta">
          <span class="ch-label">${esc(c.display_name || c.name)}</span>
          <span class="ch-preview">${esc(c.description || 'Team conversation')}</span>
        </span>
        ${badgeHtml || ''}
      </button>
    `;

    v.innerHTML = `
      <div class="chat-container">
        <!-- LEFT CHATS THREAD LIST -->
        <div class="chat-channels-pane">
          <div class="chat-pane-head">
            <div style="font-weight:900;font-size:13px;letter-spacing:.03em;text-transform:uppercase;color:var(--navy-900)">Chats &amp; Channels</div>
            ${adminMode ? `<button class="btn sm ghost" id="ch-new-btn" style="padding:2px 8px;font-size:12px;font-weight:800" title="Create channel">+ New</button>` : ''}
          </div>
          <input class="chat-search-input" id="ch-search-box" placeholder="Search channels…" aria-label="Search channels">

          <div id="channels-tree" style="display:flex;flex-direction:column;gap:10px">
            ${annChannels.length ? `
              <div class="ch-group">
                <div class="nav-group-label" style="margin-left:4px">Official Broadcasts</div>
                ${annChannels.map(c => renderChannelBtn(c, '📢', '<span class="channel-badge ok">Info</span>')).join('')}
              </div>
            ` : ''}

            ${generalChannels.length ? `
              <div class="ch-group">
                <div class="nav-group-label" style="margin-left:4px">Workspace Channels</div>
                ${generalChannels.map(c => renderChannelBtn(c, '#', c.is_private ? '<span class="small muted" title="Private" style="flex-shrink:0">🔒</span>' : '')).join('')}
              </div>
            ` : ''}

            ${unitChannels.length ? `
              <div class="ch-group">
                <div class="nav-group-label" style="margin-left:4px">Unit Channels</div>
                ${unitChannels.map(c => renderChannelBtn(c, '🏢', '<span class="channel-badge muted-tag">Unit</span>')).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- RIGHT CHAT ROOM PANE -->
        <div class="chat-room-pane" id="chat-room-pane">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:320px">
            <div class="loading">Loading chat…</div>
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
      $$('.ch-group', v).forEach(grp => {
        const hasVisible = $$('.channel-btn', grp).some(btn => btn.style.display !== 'none');
        grp.style.display = hasVisible ? 'block' : 'none';
      });
    });

    // Admin create channel modal
    if (adminMode) {
      $('#ch-new-btn')?.addEventListener('click', () => {
        window.DS.modal.open(`
          <div class="modal-head">
            <h2>Create a new channel</h2>
            <p class="muted small" style="margin-top:4px">Organize team conversations, unit initiatives, or company announcements.</p>
          </div>
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
            <div class="modal-actions">
              <button class="btn primary" type="submit">Create channel</button>
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
          const { error } = await sb.from('channels').insert({
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
      document.body.classList.add('chat-room-open');
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

    // Render WhatsApp / Telegram style chat room
    async function renderChannelRoom(ch) {
      window.DS.cleanupChannelsRealtime();
      const room = $('#chat-room-pane');
      if (!room) return;
      const canPost = ch.kind !== 'announcements' || adminMode;
      const chIcon = ch.kind === 'announcements' ? '📢' : ch.kind === 'unit' ? '🏢' : '#';

      const { data: messages } = await sb.from('channel_updates')
        .select('*, profiles:author_id(full_name, email, access_level)')
        .eq('channel_id', ch.id)
        .order('created_at', { ascending: true })
        .limit(80);

      let msgList = messages || [];

      const formatAttachmentHtml = (url) => {
        if (!url) return '';
        const clean = String(url).trim();
        const isImg = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(clean);
        const rawName = clean.split('?')[0].split('/').pop() || '';
        let niceName = rawName;
        try { niceName = decodeURIComponent(rawName).replace(/^\d{10,14}_/, ''); } catch {}
        if (isImg) {
          return `<div class="chat-attach-wrap"><a href="${esc(clean)}" target="_blank" rel="noopener"><img class="chat-img-preview" src="${esc(clean)}" alt="${esc(niceName || 'Shared image')}" loading="lazy"></a></div>`;
        }
        const isUpload = clean.includes('channel-uploads/');
        const label = (isUpload && niceName) ? niceName : 'Open attached link';
        return `<div class="chat-attach-wrap"><a href="${esc(clean)}" target="_blank" rel="noopener" class="chat-file-chip">${isUpload ? '📎' : '🔗'} <span>${esc(label)}</span> ↗</a></div>`;
      };

      const buildMsgHtml = (m, prevMsg) => {
        const prof = m.profiles || memberMap[m.author_id] || {};
        const author = prof.full_name || prof.email || 'Team member';
        const authorAccess = prof.access_level || 'Member';
        const isOwn = m.author_id === S.user.id;
        const priority = getMessagePriority(m.body, m.update_type);
        const canDelete = adminMode || isOwn;
        const rt = m.reactions && typeof m.reactions === 'object' ? m.reactions.reply_to : null;
        const prevSameSender = prevMsg && prevMsg.author_id === m.author_id
          && (new Date(m.created_at) - new Date(prevMsg.created_at)) < 4 * 60 * 1000
          && formatChatDay(m.created_at) === formatChatDay(prevMsg.created_at);

        const dayDivider = (!prevMsg || formatChatDay(m.created_at) !== formatChatDay(prevMsg.created_at))
          ? `<div class="chat-date-divider" data-day="${esc(formatChatDay(m.created_at))}">${esc(formatChatDay(m.created_at))}</div>`
          : '';

        const showSenderHeader = !isOwn && !prevSameSender;

        return `
          ${dayDivider}
          <div class="chat-msg-row ${isOwn ? 'is-own' : 'is-other'} ${prevSameSender ? 'is-grouped' : 'is-group-start'}" data-msg-id="${m.id}">
            ${!isOwn ? `<div class="chat-avatar ${authorAccess === 'Admin' ? 'admin' : ''}" title="${esc(author)} (${esc(authorAccess)})">${esc(getInitials(author))}</div>` : ''}
            <div class="chat-bubble ${priority}" data-bubble-msg="${m.id}" ${canDelete ? 'data-can-del="1"' : ''}>
              <div class="chat-hover-tools" aria-hidden="true">
                <button type="button" class="chat-hover-btn" data-quick-reply="${m.id}" title="Reply">↩</button>
                <button type="button" class="chat-hover-btn" data-open-sheet="${m.id}" title="More actions">⋯</button>
              </div>
              ${showSenderHeader ? `
                <div class="chat-bubble-top">
                  <div class="chat-bubble-sender">
                    <span class="chat-author ${authorAccess === 'Admin' ? 'admin' : ''}">${esc(author)}</span>
                    ${authorAccess === 'Admin' ? '<span class="tag brand" style="font-size:9.5px;padding:0 5px;line-height:1.4">Admin</span>' : ''}
                  </div>
                </div>
              ` : ''}
              ${rt && rt.id ? `
                <button type="button" class="chat-reply-quote" data-jump-msg="${esc(rt.id)}" title="Go to original message">
                  <span class="chat-reply-author">${esc(rt.author || 'Message')}</span>
                  <span class="chat-reply-snippet">${esc(rt.text || 'Original message')}</span>
                </button>
              ` : ''}
              ${priority !== 'general' ? `
                <div class="chat-bubble-flags">
                  ${priority === 'urgent' ? '<span class="urgent-pill">🚨 URGENT</span>' : ''}
                  ${priority === 'important' ? '<span class="important-pill">⚡ IMPORTANT</span>' : ''}
                  ${priority === 'announcement' ? '<span class="announcement-pill">📢 ANNOUNCEMENT</span>' : ''}
                </div>
              ` : ''}
              <div class="chat-text">${formatChatMessage(m.body, memberList)}</div>
              ${m.drive_link ? formatAttachmentHtml(m.drive_link) : ''}
              <div class="chat-bubble-foot">
                <span class="chat-time">${esc(formatChatTime(m.created_at))}</span>
                ${isOwn ? '<span class="chat-tick" title="Delivered">✓✓</span>' : ''}
              </div>
            </div>
          </div>
        `;
      };

      const renderStreamHtml = (items) => {
        if (!items.length) {
          return `
            <div class="empty" id="chat-empty-state" style="margin:auto;max-width:360px;padding:28px 20px">
              <div class="big">No messages yet</div>
              <div class="hint">Say hello in ${esc(ch.display_name || ch.name)}, or tap + to share a file or link.</div>
            </div>
          `;
        }
        return items.map((m, idx) => buildMsgHtml(m, idx > 0 ? items[idx - 1] : null)).join('');
      };

      const defaultSub = ch.description || (ch.kind === 'announcements' ? 'Official team broadcasts' : 'Share updates, links, and chat');

      room.innerHTML = `
        <!-- CLEAN CHANNEL HEADER -->
        <div class="chat-room-head">
          <div class="chat-room-head-left">
            <button class="btn ghost chat-back-btn" id="chat-mobile-back" type="button" title="Back to channels" aria-label="Back to channels">←</button>
            <div class="chat-room-avatar" aria-hidden="true">${chIcon}</div>
            <div class="chat-room-head-meta">
              <div class="chat-room-title">
                <span class="chat-room-title-text">${esc(ch.display_name || ch.name)}</span>
                ${ch.kind === 'announcements' ? '<span class="announcement-pill">Broadcast</span>' : ''}
                ${ch.is_private ? '<span class="tiny muted" title="Private">🔒</span>' : ''}
              </div>
              <div class="chat-room-sub" id="chat-room-subtitle">${esc(defaultSub)}</div>
            </div>
          </div>
          <div class="chat-room-head-actions">
            <button class="chat-icon-btn" id="chat-refresh-btn" type="button" title="Refresh messages" aria-label="Refresh messages">↻</button>
          </div>
        </div>

        <!-- MESSAGES STREAM -->
        <div class="chat-messages" id="chat-stream">
          ${renderStreamHtml(msgList)}
          <div class="chat-msg-row is-other chat-typing-row hidden" id="chat-typing-row">
            <div class="chat-typing-bubble">
              <span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>
              <span id="chat-typing-label">Someone is typing…</span>
            </div>
          </div>
        </div>

        <!-- LONG-PRESS / MESSAGE ACTION SHEET -->
        <div class="chat-sheet-backdrop hidden" id="chat-msg-sheet-backdrop" role="dialog" aria-modal="true">
          <div class="chat-msg-sheet" id="chat-msg-sheet"></div>
        </div>

        <!-- CLEAN SHARE & CHAT COMPOSER -->
        <div class="chat-composer-box">
          ${canPost ? `
            <div class="mention-dropdown hidden" id="mention-dropdown">
              ${memberList.map(p => `
                <div class="mention-item" data-mention-name="${esc(p.full_name || p.email)}">
                  <span>@${esc(p.full_name || p.email)}</span>
                  <span class="muted tiny">(${esc(p.access_level)})</span>
                </div>
              `).join('')}
            </div>

            <div class="chat-plus-menu hidden" id="chat-plus-menu">
              <button type="button" class="chat-plus-item" id="chat-pick-link">
                <span class="chat-plus-ico">🔗</span>
                <span>Add link / URL</span>
              </button>
              <button type="button" class="chat-plus-item" id="chat-pick-file">
                <span class="chat-plus-ico">📎</span>
                <span>Attach file or photo</span>
              </button>
            </div>
            <input type="file" id="chat-file-input" class="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip">

            <div class="chat-replying-bar hidden" id="chat-replying-bar">
              <div class="chat-replying-info">
                <div class="chat-reply-author" id="chat-replying-who"></div>
                <div class="chat-reply-snippet" id="chat-replying-text"></div>
              </div>
              <button type="button" class="btn sm ghost" id="chat-reply-cancel" title="Cancel reply" aria-label="Cancel reply">✕</button>
            </div>

            <div class="chat-attach-bar hidden" id="chat-attach-bar">
              <span id="chat-attach-label" class="small" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
              <button type="button" class="btn sm ghost" id="chat-attach-clear" title="Remove attachment" aria-label="Remove attachment">✕</button>
            </div>

            <div class="chat-link-drawer hidden" id="chat-link-drawer">
              <input class="chat-link-input" id="chat-link-input" type="url" placeholder="Paste URL (Google Drive, Figma, Docs…)">
              <button type="button" class="btn sm ghost" id="chat-link-clear" title="Remove link" aria-label="Remove link">✕</button>
            </div>

            <div class="chat-composer-bar">
              <button type="button" class="chat-icon-btn" id="chat-plus-btn" title="Add URL or file" aria-label="Add URL or file" aria-expanded="false">+</button>
              <div class="chat-input-pill">
                <textarea class="chat-input-area" id="chat-body-input" placeholder="Message…" rows="1" aria-label="Message"></textarea>
                <button type="button" class="chat-mention-inline" id="mention-toggle-btn" title="Mention teammate" aria-label="Mention teammate">@</button>
              </div>
              <button class="chat-send-circle" id="chat-send-btn" type="button" title="Send message" aria-label="Send message">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          ` : `
            <div style="padding:10px 14px;text-align:center;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--line-soft)">
              <span class="small muted">📢 Official broadcast channel — only admins can post announcements.</span>
            </div>
          `}
        </div>
      `;

      const stream = $('#chat-stream');
      const typingRow = $('#chat-typing-row');
      const typingLabel = $('#chat-typing-label');
      const subtitleEl = $('#chat-room-subtitle');

      const scrollToBottom = (force) => {
        if (!stream) return;
        const nearBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 120;
        if (force || nearBottom) {
          stream.scrollTop = stream.scrollHeight;
        }
      };

      const syncMobileMetrics = () => {
        const mobBar = $('#ds-mobile-bar');
        const barH = mobBar && mobBar.offsetHeight ? mobBar.offsetHeight : 59;
        document.documentElement.style.setProperty('--mob-bar-h', barH + 'px');
        const vvH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--chat-room-h', Math.max(220, Math.round(vvH - barH)) + 'px');
        if (document.body.classList.contains('chat-room-open') && window.innerWidth <= 900) {
          window.scrollTo(0, 0);
          scrollToBottom(true);
        }
      };

      syncMobileMetrics();
      if (window.visualViewport) {
        activeChatVvHandler = () => syncMobileMetrics();
        window.visualViewport.addEventListener('resize', activeChatVvHandler);
        window.visualViewport.addEventListener('scroll', activeChatVvHandler);
      }

      scrollToBottom(true);

      // Mobile back to channels button
      $('#chat-mobile-back')?.addEventListener('click', () => {
        $('.chat-container', v)?.classList.remove('view-room');
        document.body.classList.remove('chat-room-open');
      });

      // Refresh button
      $('#chat-refresh-btn')?.addEventListener('click', () => renderChannelRoom(ch));

      const sheetBackdrop = $('#chat-msg-sheet-backdrop');
      const sheetEl = $('#chat-msg-sheet');
      let replyTarget = null;
      let attachedFile = null;

      const setReplyTarget = (msg) => {
        replyTarget = msg || null;
        const bar = $('#chat-replying-bar');
        if (!bar) return;
        if (!msg) {
          bar.classList.add('hidden');
          return;
        }
        const prof = msg.profiles || memberMap[msg.author_id] || {};
        const who = prof.full_name || prof.email || 'Team member';
        $('#chat-replying-who').textContent = `Replying to ${who}`;
        $('#chat-replying-text').textContent = (msg.body || '').slice(0, 120) || (msg.drive_link ? 'Attached file/link' : '');
        bar.classList.remove('hidden');
        $('#chat-body-input')?.focus();
      };

      const jumpToMessage = (targetId) => {
        if (!stream || !targetId) return;
        const row = stream.querySelector(`[data-msg-id="${targetId}"]`);
        if (!row) {
          toast('Original message is outside the recent view.', true);
          return;
        }
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const bubble = row.querySelector('.chat-bubble');
        if (bubble) {
          bubble.classList.remove('is-highlighted');
          void bubble.offsetWidth;
          bubble.classList.add('is-highlighted');
          setTimeout(() => bubble.classList.remove('is-highlighted'), 1900);
        }
      };

      const deleteMessageById = async (msgId) => {
        const ok = await window.DS.confirmModal({
          title: 'Delete message',
          message: 'Are you sure you want to permanently delete this message from the channel?',
          confirmLabel: 'Delete message',
          isAlert: true,
        });
        if (!ok) return;
        const { error } = await sb.from('channel_updates').delete().eq('id', msgId);
        if (error) { toast(error.message, true); return; }
        msgList = msgList.filter(x => x.id !== msgId);
        stream?.querySelector(`[data-msg-id="${msgId}"]`)?.remove();
        toast('✓ Message deleted');
      };

      const closeMsgSheet = () => {
        sheetBackdrop?.classList.add('hidden');
        $$('.chat-bubble.is-pressed', room).forEach(el => el.classList.remove('is-pressed'));
      };
      sheetBackdrop?.addEventListener('click', (e) => {
        if (e.target === sheetBackdrop) closeMsgSheet();
      });

      const openMsgActionSheet = (msg) => {
        if (!msg || !sheetEl || !sheetBackdrop) return;
        const prof = msg.profiles || memberMap[msg.author_id] || {};
        const author = prof.full_name || prof.email || 'Team member';
        const canDelete = adminMode || msg.author_id === S.user.id;
        const bubble = stream?.querySelector(`[data-bubble-msg="${msg.id}"]`);
        bubble?.classList.add('is-pressed');

        sheetEl.innerHTML = `
          <div class="chat-sheet-preview">
            <div class="chat-sheet-author">${esc(author)}</div>
            <div class="chat-sheet-snippet">${esc((msg.body || '').slice(0, 120) || 'Attachment')}</div>
          </div>
          <div class="chat-sheet-actions">
            ${canPost ? `<button type="button" class="chat-sheet-btn" id="sheet-reply"><span>↩</span><span>Reply to message</span></button>` : ''}
            <button type="button" class="chat-sheet-btn" id="sheet-copy"><span>📋</span><span>Copy message</span></button>
            ${msg.drive_link ? `<a class="chat-sheet-btn" href="${esc(msg.drive_link)}" target="_blank" rel="noopener" id="sheet-link"><span>↗</span><span>Open attachment</span></a>` : ''}
            ${canDelete ? `<button type="button" class="chat-sheet-btn alert" id="sheet-delete"><span>🗑️</span><span>Delete message</span></button>` : ''}
            <button type="button" class="chat-sheet-btn cancel" id="sheet-cancel">Cancel</button>
          </div>
        `;
        sheetBackdrop.classList.remove('hidden');

        $('#sheet-reply')?.addEventListener('click', () => { closeMsgSheet(); setReplyTarget(msg); });
        $('#sheet-copy')?.addEventListener('click', async () => {
          closeMsgSheet();
          try { await navigator.clipboard.writeText(msg.body || ''); toast('✓ Message copied'); } catch { toast('Could not copy message', true); }
        });
        $('#sheet-link')?.addEventListener('click', () => closeMsgSheet());
        $('#sheet-delete')?.addEventListener('click', () => { closeMsgSheet(); deleteMessageById(msg.id); });
        $('#sheet-cancel')?.addEventListener('click', closeMsgSheet);
      };

      // Bind long-press, right-click, desktop quick reply/menu hover buttons, and reply-quote jump
      const bindRoomMessageActions = (scope) => {
        $$('[data-jump-msg]', scope).forEach(btn => {
          if (btn._boundJump) return;
          btn._boundJump = true;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            jumpToMessage(btn.dataset.jumpMsg);
          });
        });

        $$('[data-quick-reply]', scope).forEach(btn => {
          if (btn._boundQReply) return;
          btn._boundQReply = true;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = msgList.find(x => x.id === btn.dataset.quickReply);
            if (target) setReplyTarget(target);
          });
        });

        $$('[data-open-sheet]', scope).forEach(btn => {
          if (btn._boundSheet) return;
          btn._boundSheet = true;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = msgList.find(x => x.id === btn.dataset.openSheet);
            if (target) openMsgActionSheet(target);
          });
        });

        $$('[data-bubble-msg]', scope).forEach(bubble => {
          if (bubble._boundHold) return;
          bubble._boundHold = true;
          const msgId = bubble.dataset.bubbleMsg;
          let holdTimer = null;
          let startX = 0;
          let startY = 0;

          const clearHold = () => {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
          };

          bubble.addEventListener('touchstart', (e) => {
            if (e.target.closest('a, button')) return;
            const touch = e.touches && e.touches[0];
            startX = touch ? touch.clientX : 0;
            startY = touch ? touch.clientY : 0;
            clearHold();
            holdTimer = setTimeout(() => {
              holdTimer = null;
              try { navigator.vibrate?.(12); } catch {}
              const target = msgList.find(x => x.id === msgId);
              if (target) openMsgActionSheet(target);
            }, 420);
          }, { passive: true });

          bubble.addEventListener('touchmove', (e) => {
            if (!holdTimer) return;
            const touch = e.touches && e.touches[0];
            if (!touch) return;
            if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
              clearHold();
            }
          }, { passive: true });

          bubble.addEventListener('touchend', clearHold);
          bubble.addEventListener('touchcancel', clearHold);

          bubble.addEventListener('contextmenu', (e) => {
            if (e.target.closest('a')) return;
            e.preventDefault();
            const target = msgList.find(x => x.id === msgId);
            if (target) openMsgActionSheet(target);
          });
        });
      };
      bindRoomMessageActions(room);

      // Live typing indicator state + Realtime subscription
      const typingUsers = new Map();
      const refreshTypingBanner = () => {
        const now = Date.now();
        for (const [uid, info] of typingUsers.entries()) {
          if (info.expiresAt <= now) typingUsers.delete(uid);
        }
        const names = [...typingUsers.values()].map(x => x.name);
        if (names.length) {
          const text = names.length === 1
            ? `${names[0]} is typing…`
            : names.length === 2
              ? `${names[0]} and ${names[1]} are typing…`
              : `${names[0]} and ${names.length - 1} others are typing…`;
          if (subtitleEl) {
            subtitleEl.innerHTML = `<span class="chat-typing-status">${esc(text)}</span>`;
          }
          if (typingLabel && typingRow) {
            typingLabel.textContent = text;
            typingRow.classList.remove('hidden');
            scrollToBottom(false);
          }
        } else {
          if (subtitleEl) subtitleEl.textContent = defaultSub;
          typingRow?.classList.add('hidden');
        }
      };

      const appendIncomingMessage = (msg) => {
        if (!stream || !msg || !msg.id) return;
        if (stream.querySelector(`[data-msg-id="${msg.id}"]`)) return;
        $('#chat-empty-state')?.remove();
        const prevMsg = msgList.length ? msgList[msgList.length - 1] : null;
        msgList.push(msg);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildMsgHtml(msg, prevMsg);
        const nodes = [...wrapper.children];
        nodes.forEach(node => {
          stream.insertBefore(node, typingRow || null);
          bindRoomMessageActions(node);
        });
        scrollToBottom(msg.author_id === S.user.id);
      };

      activeTypingGc = setInterval(() => {
        if (typingUsers.size) refreshTypingBanner();
      }, 1000);

      try {
        activeChatRt = sb.channel(`nodaar-room-${ch.id}`)
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (!payload || !payload.userId || payload.userId === S.user.id) return;
            if (payload.typing) {
              typingUsers.set(payload.userId, {
                name: String(payload.name || 'Someone').split(/\s+/)[0],
                expiresAt: Date.now() + 3500,
              });
            } else {
              typingUsers.delete(payload.userId);
            }
            refreshTypingBanner();
          })
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'channel_updates',
            filter: `channel_id=eq.${ch.id}`,
          }, (payload) => {
            const row = payload.new;
            if (!row || !row.id) return;
            typingUsers.delete(row.author_id);
            refreshTypingBanner();
            appendIncomingMessage(row);
          })
          .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'channel_updates',
            filter: `channel_id=eq.${ch.id}`,
          }, (payload) => {
            const oldId = payload.old?.id;
            if (!oldId) return;
            msgList = msgList.filter(x => x.id !== oldId);
            stream?.querySelector(`[data-msg-id="${oldId}"]`)?.remove();
          })
          .subscribe();
      } catch {}

      if (!canPost) return;

      const textarea = $('#chat-body-input');
      const sendBtn = $('#chat-send-btn');
      const plusBtn = $('#chat-plus-btn');
      const plusMenu = $('#chat-plus-menu');
      const fileInput = $('#chat-file-input');
      const attachBar = $('#chat-attach-bar');
      const attachLabel = $('#chat-attach-label');
      const linkDrawer = $('#chat-link-drawer');
      const linkInput = $('#chat-link-input');
      const linkClearBtn = $('#chat-link-clear');
      const mentionBtn = $('#mention-toggle-btn');
      const mentionMenu = $('#mention-dropdown');

      const autoResizeInput = () => {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(112, Math.max(30, textarea.scrollHeight)) + 'px';
      };

      $('#chat-reply-cancel')?.addEventListener('click', () => setReplyTarget(null));

      const closePlusMenu = () => {
        plusMenu?.classList.add('hidden');
        plusBtn?.classList.remove('active');
        plusBtn?.setAttribute('aria-expanded', 'false');
      };

      plusBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = plusMenu?.classList.toggle('hidden');
        plusBtn.classList.toggle('active', !isHidden);
        plusBtn.setAttribute('aria-expanded', String(!isHidden));
      });

      $('#chat-pick-link')?.addEventListener('click', () => {
        closePlusMenu();
        linkDrawer?.classList.remove('hidden');
        linkInput?.focus();
      });

      linkClearBtn?.addEventListener('click', () => {
        if (linkInput) linkInput.value = '';
        linkDrawer?.classList.add('hidden');
      });

      $('#chat-pick-file')?.addEventListener('click', () => {
        closePlusMenu();
        fileInput?.click();
      });

      $('#chat-attach-clear')?.addEventListener('click', () => {
        attachedFile = null;
        if (fileInput) fileInput.value = '';
        attachBar?.classList.add('hidden');
      });

      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) {
          toast('File must be under 15 MB.', true);
          fileInput.value = '';
          return;
        }
        if (attachLabel && attachBar) {
          attachLabel.textContent = `Uploading ${file.name}…`;
          attachBar.classList.remove('hidden');
        }
        try {
          const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `channel-uploads/${S.user.id}/${ch.id}/${Date.now()}_${safeName}`;
          let bucket = 'channel-files';
          let up = await sb.storage.from(bucket).upload(path, file, { upsert: true });
          if (up.error) {
            bucket = 'avatars';
            up = await sb.storage.from(bucket).upload(path, file, { upsert: true });
          }
          if (up.error) throw up.error;
          const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
          attachedFile = { url: pub?.publicUrl || '', name: file.name || safeName };
          if (attachLabel) attachLabel.textContent = `📎 ${attachedFile.name}`;
          toast('✓ File ready to send');
        } catch (err) {
          attachedFile = null;
          attachBar?.classList.add('hidden');
          toast(err?.message || 'File upload failed.', true);
        } finally {
          fileInput.value = '';
        }
      });

      // Mention toggle and inline @ typing filter
      const filterMentions = (query) => {
        if (!mentionMenu) return;
        const q = (query || '').toLowerCase();
        let anyVisible = false;
        $$('.mention-item', mentionMenu).forEach(item => {
          const match = !q || (item.dataset.mentionName || '').toLowerCase().includes(q);
          item.style.display = match ? 'flex' : 'none';
          if (match) anyVisible = true;
        });
        if (!anyVisible) mentionMenu.classList.add('hidden');
      };

      mentionBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        filterMentions('');
        mentionMenu?.classList.toggle('hidden');
      });
      if (!window._dsMentionDocBound) {
        window._dsMentionDocBound = true;
        document.addEventListener('click', (e) => {
          if (!e.target.closest('#mention-dropdown') && !e.target.closest('#mention-toggle-btn')) {
            $('#mention-dropdown')?.classList.add('hidden');
          }
          if (!e.target.closest('#chat-plus-menu') && !e.target.closest('#chat-plus-btn')) {
            $('#chat-plus-menu')?.classList.add('hidden');
            $('#chat-plus-btn')?.classList.remove('active');
            $('#chat-plus-btn')?.setAttribute('aria-expanded', 'false');
          }
        });
      }
      $$('.mention-item', room).forEach(item => item.addEventListener('click', () => {
        const name = item.dataset.mentionName;
        const before = textarea.value.slice(0, textarea.selectionStart || 0);
        const match = before.match(/(^|\s)@([A-Za-z0-9_ ]{0,20})$/);
        if (match) {
          const replaceStart = before.length - match[0].length + match[1].length;
          textarea.setRangeText(`@${name} `, replaceStart, textarea.selectionEnd || before.length, 'end');
          textarea.focus();
        } else {
          insertFormatting(textarea, `@${name} `);
        }
        mentionMenu?.classList.add('hidden');
        autoResizeInput();
      }));

      // Broadcast typing indicator + auto-resize + @mention trigger
      let lastTypingSent = 0;
      let stopTypingTimer = null;
      const myName = S.profile?.full_name || S.user?.email || 'Member';
      const sendTypingSignal = (typing) => {
        if (!activeChatRt) return;
        try {
          activeChatRt.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: S.user.id, name: myName, typing },
          });
        } catch {}
      };

      textarea?.addEventListener('input', () => {
        autoResizeInput();
        const cursor = textarea.selectionStart || 0;
        const before = textarea.value.slice(0, cursor);
        const atMatch = before.match(/(^|\s)@([A-Za-z0-9_ ]{0,20})$/);
        if (atMatch && mentionMenu) {
          mentionMenu.classList.remove('hidden');
          filterMentions(atMatch[2]);
        } else if (mentionMenu) {
          mentionMenu.classList.add('hidden');
        }

        if (textarea.value.trim()) {
          const now = Date.now();
          if (now - lastTypingSent > 1400) {
            lastTypingSent = now;
            sendTypingSignal(true);
          }
          clearTimeout(stopTypingTimer);
          stopTypingTimer = setTimeout(() => sendTypingSignal(false), 2400);
        } else {
          clearTimeout(stopTypingTimer);
          sendTypingSignal(false);
        }
      });

      // Send message (text, link/file, optional reply reference) without losing focus
      async function sendMessage() {
        const rawText = textarea.value.trim();
        const manualLink = (linkInput?.value || '').trim() || null;
        const driveLink = attachedFile?.url || manualLink;
        if (!rawText && !driveLink) return;

        const text = rawText || (attachedFile ? `Shared ${attachedFile.name}` : 'Shared a link');
        sendBtn.disabled = true;
        clearTimeout(stopTypingTimer);
        sendTypingSignal(false);

        const isUrgent = text.toLowerCase().includes('#urgent');
        const isAnnounce = text.toLowerCase().includes('#announcement') || ch.kind === 'announcements';
        const updateType = isUrgent ? 'priority' : isAnnounce ? 'announcement' : 'general';

        const rtProf = replyTarget ? (replyTarget.profiles || memberMap[replyTarget.author_id] || {}) : null;
        const replyMeta = replyTarget ? {
          id: replyTarget.id,
          author: rtProf?.full_name || rtProf?.email || 'Team member',
          text: (replyTarget.body || '').slice(0, 120) || (replyTarget.drive_link ? 'Shared attachment' : ''),
        } : null;

        const basePayload = {
          channel_id: ch.id,
          author_id: S.user.id,
          title: text.slice(0, 60),
          body: text,
          drive_link: driveLink,
          update_type: updateType,
          status: 'published',
        };
        if (replyMeta) basePayload.reactions = { reply_to: replyMeta };

        let { data: inserted, error } = await sb.from('channel_updates')
          .insert(basePayload)
          .select('*, profiles:author_id(full_name, email, access_level)')
          .single();

        if (error && replyMeta) {
          const fallbackPayload = {
            ...basePayload,
            body: `> ${replyMeta.author}: ${replyMeta.text}\n\n${text}`,
          };
          delete fallbackPayload.reactions;
          const retry = await sb.from('channel_updates')
            .insert(fallbackPayload)
            .select('*, profiles:author_id(full_name, email, access_level)')
            .single();
          inserted = retry.data;
          error = retry.error;
        }

        if (error) {
          toast(error.message, true);
          sendBtn.disabled = false;
          return;
        }

        textarea.value = '';
        attachedFile = null;
        attachBar?.classList.add('hidden');
        if (linkInput) linkInput.value = '';
        linkDrawer?.classList.add('hidden');
        setReplyTarget(null);
        closePlusMenu();
        autoResizeInput();
        mentionMenu?.classList.add('hidden');
        sendBtn.disabled = false;
        if (inserted) appendIncomingMessage(inserted);
        else await renderChannelRoom(ch);
      }

      sendBtn?.addEventListener('click', sendMessage);

      // Desktop Enter sends; mobile touch Return adds newline cleanly
      const isCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isCoarsePointer) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    // Initialize desktop view cleanly; mobile starts on channel list until user picks a channel
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
    const list = data || [];
    const unread = list.filter(n => !n.read).length;
    const formatNotifBody = (raw) => {
      if (!raw) return '';
      if (/^library_items:[a-z0-9-]+$/i.test(raw.trim())) {
        return 'A shared library resource link was flagged as broken and needs review.';
      }
      return raw;
    };
    v.innerHTML = `<div class="card">
      <div class="card-head">
        <div>
          <h3>All notifications</h3>
          <p class="small muted" style="margin-top:2px">${unread ? `${unread} unread update${unread === 1 ? '' : 's'}` : 'All caught up'}</p>
        </div>
        <div class="card-head-controls">
          <button class="btn sm ghost" id="mark-read" ${unread ? '' : 'disabled'}>Mark all read</button>
        </div>
      </div>
      ${list.length ? `
        <div class="ds-list notif-list">
          ${list.map(n => {
            const bodyText = formatNotifBody(n.body);
            return `
              <div class="ds-list-card notif-card ${n.read ? 'is-read' : 'is-unread'}">
                <div class="ds-list-main">
                  <div class="ds-list-icon">${n.read ? '🔔' : '⚡'}</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(n.title)}</span>
                      ${n.read ? '<span class="tag muted-tag">Read</span>' : '<span class="tag brand">New</span>'}
                    </div>
                    <div class="ds-list-sub">${fmtDT(n.created_at)}</div>
                    ${bodyText ? `<div class="notif-body">${esc(bodyText)}</div>` : ''}
                  </div>
                </div>
                <div class="ds-list-actions notif-actions">
                  ${!n.read ? `<button class="btn sm ghost" type="button" data-nread="${n.id}">Mark read</button>` : ''}
                  ${n.link_tab
                    ? `<button class="btn sm ${n.read ? '' : 'primary'}" type="button" data-ntab="${esc(n.link_tab)}" data-nid="${n.id}">Open →</button>`
                    : (n.read ? '<span class="small muted">Viewed</span>' : '')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `<div class="empty"><div class="big">No notifications</div><div class="hint">Scores, reports, meetings and announcements land here.</div></div>`}
    </div>`;
    $('#mark-read')?.addEventListener('click', async () => {
      await sb.from('notifications').update({ read: true }).eq('user_id', S.user.id).eq('read', false);
      window.DS.loadNotifBadge(); window.DS.navigate('notifications');
    });
    $$('[data-nread]', v).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      await sb.from('notifications').update({ read: true }).eq('id', b.dataset.nread);
      window.DS.loadNotifBadge();
      window.DS.navigate('notifications');
    }));
    $$('[data-ntab]', v).forEach(b => b.addEventListener('click', async () => {
      await sb.from('notifications').update({ read: true }).eq('id', b.dataset.nid);
      window.DS.loadNotifBadge();
      window.DS.navigate(b.dataset.ntab);
    }));
  };

  // ── PROFILE ──
  window.renderProfilePage = async function (v) {
    const p = S.profile || {};
    const units = await myUnits();
    const displayName = p.full_name || S.user?.email || 'Team member';
    const initials = window.DS.getInitials(displayName);

    v.innerHTML = `
      <div class="profile-hero">
        <div class="profile-hero-main">
          <div class="profile-avatar-lg">${esc(initials)}</div>
          <div class="profile-hero-info">
            <div class="profile-hero-name">${esc(displayName)}</div>
            <div class="profile-hero-email">${esc(p.email || S.user?.email || '—')}</div>
            <div class="profile-hero-tags">
              <span class="tag brand">${esc(p.access_level || 'Member')}</span>
              ${p.active === false ? '<span class="tag alert">Deactivated</span>' : '<span class="tag ok">Active</span>'}
              ${units.map(u => `<span class="tag">${esc(u.units?.name || 'Unit')}${u.positions?.title ? ' · ' + esc(u.positions.title) : ''}</span>`).join('')}
            </div>
          </div>
        </div>
        <button type="button" class="btn sm" id="profile-signout-btn">Sign out</button>
      </div>

      <div class="profile-grid">
        <div class="card" style="margin-top:0">
          <div class="card-head">
            <div>
              <h3>Account details</h3>
              <p class="small muted" style="margin-top:2px">Update your display name and contact info</p>
            </div>
          </div>
          <form id="pf-form" novalidate>
            <div class="field">
              <label class="label" for="pf-name">Full name</label>
              <input class="input" id="pf-name" required value="${esc(p.full_name || '')}" placeholder="Your full name">
            </div>
            <div class="field">
              <label class="label" for="pf-email">Work email</label>
              <input class="input" id="pf-email" type="email" disabled value="${esc(p.email || S.user?.email || '')}">
            </div>
            <div class="field">
              <label class="label" for="pf-phone">Phone (optional)</label>
              <input class="input" id="pf-phone" type="tel" value="${esc(p.phone || '')}" placeholder="+234…">
            </div>
            <div class="error-box hidden" id="pf-error" style="margin-bottom:14px" role="alert" aria-live="polite"></div>
            <button class="btn primary" id="pf-save-btn" type="submit">Save profile</button>
          </form>
        </div>

        <div class="card" style="margin-top:0">
          <div class="card-head">
            <div>
              <h3>Security &amp; password</h3>
              <p class="small muted" style="margin-top:2px">Choose a strong password (min 6 characters)</p>
            </div>
          </div>
          <form id="cp-form" novalidate>
            <div class="field">
              <div class="pw-label-row">
                <label class="label" for="cp1" style="margin-bottom:0">New password</label>
                <button type="button" class="btn ghost sm" id="cp-toggle-btn" style="min-height:auto;padding:2px 8px;font-size:11px">Show</button>
              </div>
              <input class="input" id="cp1" type="password" minlength="6" required autocomplete="new-password" placeholder="At least 6 characters">
            </div>
            <div class="field">
              <label class="label" for="cp2">Confirm new password</label>
              <input class="input" id="cp2" type="password" minlength="6" required autocomplete="new-password" placeholder="Re-enter new password">
            </div>
            <div class="error-box hidden" id="cp-error" style="margin-bottom:14px" role="alert" aria-live="polite"></div>
            <button class="btn primary" id="cp-save-btn" type="submit">Update password</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>My units &amp; roles</h3>
            <p class="small muted" style="margin-top:2px">Teams and positions assigned to your account</p>
          </div>
          <button type="button" class="btn sm ghost" id="pf-goto-units">Open Units &amp; OKRs</button>
        </div>
        ${units.length ? `
          <div class="ds-list">
            ${units.map(u => `
              <div class="ds-list-card">
                <div class="ds-list-main">
                  <div class="ds-list-icon">🏢</div>
                  <div class="ds-list-content">
                    <div class="ds-list-title-row">
                      <span class="ds-list-title">${esc(u.units?.name || 'Unit')}</span>
                      <span class="tag brand">${esc(u.positions?.title || 'Member')}</span>
                    </div>
                    ${u.units?.description ? `<div class="ds-list-sub">${esc(u.units.description)}</div>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="empty" style="padding:20px"><div class="hint" style="margin:0">You are not assigned to a unit yet.</div></div>`}
      </div>
    `;

    $('#pf-goto-units')?.addEventListener('click', () => window.DS.navigate('units'));

    $('#pf-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pf-error');
      const btn = $('#pf-save-btn');
      err?.classList.add('hidden'); err?.classList.remove('show');
      const full_name = $('#pf-name')?.value.trim();
      const phone = $('#pf-phone')?.value.trim() || null;
      if (!full_name) {
        if (err) { err.textContent = 'Full name cannot be empty.'; err.classList.remove('hidden'); err.classList.add('show'); }
        $('#pf-name')?.focus();
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const { error } = await sb.from('profiles').update({ full_name, phone }).eq('id', S.user.id);
      if (error) {
        if (err) { err.textContent = error.message; err.classList.remove('hidden'); err.classList.add('show'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Save profile'; }
        return;
      }
      S.profile = { ...S.profile, full_name, phone };
      window.DS.renderNav?.();
      toast('✓ Profile updated.');
      window.DS.navigate('profile');
    });

    $('#cp-toggle-btn')?.addEventListener('click', () => {
      const p1 = $('#cp1'), p2 = $('#cp2'), t = $('#cp-toggle-btn');
      if (!p1) return;
      const show = p1.type === 'password';
      p1.type = show ? 'text' : 'password';
      if (p2) p2.type = show ? 'text' : 'password';
      if (t) t.textContent = show ? 'Hide' : 'Show';
    });

    $('#cp-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#cp-error');
      const btn = $('#cp-save-btn');
      err?.classList.add('hidden'); err?.classList.remove('show');
      const p1 = $('#cp1')?.value || '';
      const p2 = $('#cp2')?.value || '';
      if (p1.length < 6) {
        if (err) { err.textContent = 'New password must be at least 6 characters.'; err.classList.remove('hidden'); err.classList.add('show'); }
        $('#cp1')?.focus();
        return;
      }
      if (p1 !== p2) {
        if (err) { err.textContent = 'Passwords do not match.'; err.classList.remove('hidden'); err.classList.add('show'); }
        $('#cp2')?.focus();
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) {
        if (err) { err.textContent = error.message; err.classList.remove('hidden'); err.classList.add('show'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Update password'; }
        return;
      }
      $('#cp1').value = '';
      $('#cp2').value = '';
      if (btn) { btn.disabled = false; btn.textContent = 'Update password'; }
      toast('✓ Password updated.');
    });

    $('#profile-signout-btn')?.addEventListener('click', () => {
      if (window.DS?.auth?.signOut) {
        window.DS.auth.signOut();
      }
    });
  };
})();
