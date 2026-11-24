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
    const [{ data: report }, { data: tasks }, units, { data: fb }, { data: scores }, { data: ann }] = await Promise.all([
      sb.from('daily_reports').select('*').eq('user_id', S.user.id).eq('report_date', date).maybeSingle(),
      sb.from('tasks').select('*, task_assignees!inner(user_id)').eq('task_assignees.user_id', S.user.id).order('due_date'),
      myUnits(),
      sb.from('weekly_feedback').select('*, periods:period_id(label)').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(4),
      sb.from('weekly_scores').select('*, periods:period_id(label)').eq('user_id', S.user.id).order('scored_at', { ascending: false }).limit(4),
      sb.from('channels').select('id').eq('kind', 'announcements').maybeSingle(),
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

    v.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${report ? (report.is_late ? 'Late' : 'On time') : '—'}</div><div class="cap">Today's report</div></div>
        <div class="stat"><div class="num">${openTasks.length}</div><div class="cap">Open tasks</div></div>
        <div class="stat"><div class="num ${overdue.length ? 'alert-text' : ''}">${overdue.length}</div><div class="cap">Overdue</div></div>
        <div class="stat"><div class="num">${headlineScore != null ? headlineScore + '%' : '—'}</div><div class="cap">Latest score</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Today's daily report — ${fmtD(date)}</h3>
          ${report ? `<span class="tag ${report.status === 'Rejected' ? 'alert' : report.is_late ? 'alert' : 'ok'}">${report.status}${report.is_late ? ' · Late ' + report.late_minutes + ' min' : ''}</span>` : '<span class="tag muted-tag">Not submitted</span>'}
        </div>
        ${report ? `<dl class="kv">
          <dt>Submitted</dt><dd>${fmtDT(report.submitted_at)}</dd>
          <dt>Yesterday</dt><dd>${esc(report.did_yesterday || '—')}</dd>
          <dt>Today</dt><dd>${esc(report.doing_today || '—')}</dd>
          ${report.blockers ? `<dt>Blockers</dt><dd>${esc(report.blockers)}</dd>` : ''}
          ${report.review_note ? `<dt>Admin note</dt><dd>${esc(report.review_note)}</dd>` : ''}
        </dl>` : ''}
        <div style="margin-top:16px"><button class="btn ${report ? '' : 'primary'}" data-goto="report">${report ? 'Edit / resubmit' : "Write today's report"}</button></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>My tasks</h3><button class="btn sm ghost" data-goto="tasks">View all</button></div>
        ${openTasks.length ? openTasks.slice(0, 5).map(t => `
          <div class="row"><div class="row-main">
            <div class="t">${esc(t.title)} ${t.due_date && t.due_date < date ? '<span class="tag alert">Overdue</span>' : ''}</div>
            <div class="s">${esc(t.status || 'To do')} · due ${fmtD(t.due_date)}${t.priority ? ' · ' + esc(t.priority) : ''}</div>
          </div></div>`).join('') : `<div class="empty" style="padding:20px"><div class="hint">No open tasks. Nice.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>This week — idea & problem</h3><button class="btn sm ghost" data-goto="ideas">Open</button></div>
        ${(fb && fb.length) ? fb.map(f => `<div class="row"><div class="row-main"><div class="t">${f.type === 'idea' ? 'Idea' : 'Problem'} · ${esc(f.periods?.label || '')}</div><div class="s">${esc(f.content).slice(0, 90)}</div></div><span class="tag ${f.status === 'Rejected' || f.status === 'Dismissed' ? 'alert' : f.status === 'Open' ? 'muted-tag' : 'ok'}">${f.status}</span></div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">Submit one idea and one problem this week.</div><button class="btn sm" data-goto="ideas">Add now</button></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>My units & OKRs</h3><button class="btn sm ghost" data-goto="units">View all</button></div>
        ${units.length ? units.map(u => `<div class="row"><div class="row-main"><div class="t">${esc(u.units?.name || 'Unit')}</div><div class="s">${esc(u.positions?.title || 'Member')}</div></div></div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">You are not in a unit yet.</div></div>`}
      </div>

      ${annPosts.length ? `<div class="card"><div class="card-head"><h3>Announcements</h3></div>
        ${annPosts.map(a => `<div class="row"><div class="row-main"><div class="t">${esc(a.title || 'Announcement')}</div><div class="s">${esc((a.body || '').slice(0, 100))} · ${fmtDT(a.created_at)}</div></div></div>`).join('')}</div>` : ''}
    `;
    $$('[data-goto]', v).forEach(b => b.addEventListener('click', () => window.DS.navigate(b.dataset.goto)));
  };

  // ── DAILY REPORT ──
  window.DS.registerRoute('report', {
    title: 'Daily report', sub: 'What you did yesterday, what you will do today, blockers',
    get action() { return `<span class="tag muted-tag">Deadline <span id="dl-tag">18:00</span> WAT</span>`; },
    render: async (v) => {
      const date = todayLagos();
      const [{ data: existing }, { data: settings }] = await Promise.all([
        sb.from('daily_reports').select('*').eq('user_id', S.user.id).eq('report_date', date).maybeSingle(),
        sb.from('org_settings').select('daily_report_deadline').limit(1).maybeSingle(),
      ]);
      const dl = (settings?.daily_report_deadline || '18:00:00').slice(0, 5);
      // Editable when nothing is submitted yet, or when the admin rejected it
      // and asked for a resubmission. A submitted report under review is read-only.
      const editable = !existing || existing.status === 'Submitted' || existing.status === 'Rejected';
      v.innerHTML = `
        <div class="card">
          <div class="card-head"><h3>Daily scrum — ${fmtD(date)}</h3>
            ${existing ? `<span class="tag ${existing.status === 'Rejected' ? 'alert' : existing.is_late ? 'alert' : 'ok'}">${existing.status}${existing.is_late ? ' · Late by ' + existing.late_minutes + ' min' : ''}</span>` : '<span class="tag muted-tag">Not submitted</span>'}
          </div>
          ${existing ? `<p class="small muted" style="margin-bottom:16px">Submitted ${fmtDT(existing.submitted_at)}${existing.review_note ? ' · Note: ' + esc(existing.review_note) : ''}${existing.score != null ? ' · Score: ' + existing.score : ''}</p>` : ''}
          <div class="error-box hidden" id="dr-error" style="margin-bottom:14px"></div>
          <form id="dr-form" novalidate>
            <div class="field"><label class="label" for="dr-done">What I did yesterday</label><textarea class="input" id="dr-done" required ${editable ? '' : 'disabled'}>${esc(existing?.did_yesterday || '')}</textarea></div>
            <div class="field"><label class="label" for="dr-plan">What I will do today</label><textarea class="input" id="dr-plan" required ${editable ? '' : 'disabled'}>${esc(existing?.doing_today || '')}</textarea></div>
            <div class="field"><label class="label" for="dr-block">Blockers (optional)</label><input class="input" id="dr-block" ${editable ? '' : 'disabled'} value="${esc(existing?.blockers || '')}"></div>
            <div class="field"><label class="label" for="dr-ev">Evidence link (URL)</label><input class="input" id="dr-ev" type="url" ${editable ? '' : 'disabled'} value="${esc(existing?.evidence_url || '')}" placeholder="https://drive.google.com/…"></div>
            ${editable ? `<button class="btn primary" type="submit" style="width:100%">${existing && (existing.status === 'Rejected') ? 'Resubmit report' : existing ? 'Update report' : 'Submit report'}</button>`
              : `<p class="small muted">${existing ? 'Under review — not editable until the admin responds.' : 'Already submitted.'}</p>`}
          </form>
        </div>`;
      $('#dl-tag') && ($('#dl-tag').textContent = dl);
      const form = $('#dr-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#dr-error');
        err.classList.remove('show');
        const now = new Date();
        const lagos = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
        const [h, m] = dl.split(':').map(Number);
        const deadline = new Date(lagos); deadline.setHours(h, m, 0, 0);
        const isLate = lagos > deadline;
        const lateMinutes = isLate ? Math.round((lagos - deadline) / 60000) : 0;
        const { error } = await sb.from('daily_reports').upsert({
          user_id: S.user.id, report_date: date,
          did_yesterday: $('#dr-done').value.trim(),
          doing_today: $('#dr-plan').value.trim(),
          blockers: $('#dr-block').value.trim() || null,
          evidence_url: $('#dr-ev').value.trim() || null,
          submitted_at: now.toISOString(), is_late: isLate, late_minutes: lateMinutes, status: 'Submitted',
        }, { onConflict: 'user_id,report_date' });
        if (error) { err.textContent = error.message; err.classList.add('show'); return; }
        toast(isLate ? `Submitted — late by ${lateMinutes} min` : 'Report submitted', isLate);
        window.DS.navigate('report');
      });
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
      v.innerHTML = `
        <div class="card">
          ${list.length ? `<div class="table-wrap"><table class="ds">
            <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th><th>Evidence</th><th></th></tr></thead>
            <tbody>${list.map(t => `
              <tr><td style="font-weight:700;min-width:180px">${esc(t.title)}${t.extension_requested ? ' <span class="tag muted-tag">Extension asked</span>' : ''}</td>
                <td><span class="tag ${t.status === 'Done' ? 'ok' : t.status === 'In review' || t.status === 'In Review' ? '' : 'muted-tag'}">${esc(t.status || 'To do')}</span></td>
                <td>${esc(t.priority || '—')}</td>
                <td>${t.due_date ? (t.due_date < date && t.status !== 'Done' ? `<span class="tag alert">Overdue ${fmtD(t.due_date)}</span>` : fmtD(t.due_date)) : '—'}</td>
                <td>${t.evidence_url ? `<a href="${esc(t.evidence_url)}" target="_blank" rel="noopener">Open</a>` : '<span class="muted">—</span>'}</td>
                <td style="text-align:right"><button class="btn sm ghost" data-ext="${t.id}">Request extension</button></td>
              </tr>`).join('')}</tbody></table></div>`
          : `<div class="empty"><div class="big">No tasks assigned</div><div class="hint">Tasks assigned to you will appear here.</div></div>`}
        </div>`;
      $$('[data-ext]', v).forEach(b => b.addEventListener('click', async () => {
        const reason = prompt('Reason for the extension request:');
        if (reason === null) return;
        await sb.from('task_updates').insert({
          task_id: b.dataset.ext, user_id: S.user.id,
          description: 'Extension requested: ' + reason,
          update_type: 'extension_request',
        }).catch((e) => toast('Could not send the request.', true));
        await sb.from('tasks').update({ extension_requested: true, extension_note: reason }).eq('id', b.dataset.ext);
        toast('Extension request sent to admin.');
      }));
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
    v.innerHTML = `<div class="card">${(data && data.length) ? data.map(raw => {
      const m = window.DS.meeting(raw);
      return `
      <div class="row" style="align-items:flex-start"><div class="row-main">
        <div class="t">${esc(m.title)}</div>
        <div class="s">${fmtDT(m.starts_at)} · ${m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">Join link</a>` : '—'} · ${esc(m.units?.name || 'Everyone')}</div>
        ${m.minutes ? `<div class="s">Notes: ${esc(m.minutes)}</div>` : ''}
      </div>
      <button class="btn sm" data-mr="${m.id}" data-title="${esc(m.title)}">File meeting report</button></div>`;
    }).join('')
      : `<div class="empty"><div class="big">No meetings</div><div class="hint">Upcoming meetings will appear here.</div></div>`}</div>`;
    $$('[data-mr]', v).forEach(b => b.addEventListener('click', () => meetingReportModal(b.dataset.mr, b.dataset.title)));
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
    const scoredHtml = scored.length ? `<div class="table-wrap"><table class="ds">
      <thead><tr><th>Date</th><th>Status</th><th>Score</th><th>Note</th></tr></thead>
      <tbody>${scored.slice(0, 10).map(r => `<tr>
        <td style="font-weight:700">${fmtD(r.report_date)}</td>
        <td>${statusTagLocal(r.status)}</td>
        <td style="font-weight:800">${r.score}/100</td>
        <td class="small">${r.review_note ? esc(r.review_note) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>` : '';

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
        ${list.length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th>Week</th>${crits.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Score</th></tr></thead>
          <tbody>${list.map(s => `<tr>
            <td style="font-weight:700">${esc(s.periods?.label || '')} ${s.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : ''}</td>
            ${crits.map(c => `<td>${s.criterion_scores?.[c.key] ?? '—'}</td>`).join('')}
            <td style="font-weight:800">${s.manual_override ?? s.weighted_total}/100</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><div class="big">No scores yet</div><div class="hint">Your weekly scores appear here after admin review.</div></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Monthly</h3></div>
        ${monthly && monthly.length ? monthly.map(m => `<div class="row"><div class="row-main"><div class="t">${esc(m.periods?.label || '')}</div><div class="s">Weekly average ${m.weekly_avg ?? '—'}</div></div><b>${Math.round(m.final_score ?? m.weekly_avg ?? 0)}%</b></div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">Monthly rollup appears at month end.</div></div>`}
      </div>
      <p class="tiny muted">Private: no rankings, no other members' data.</p>`;
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
    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Library</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input class="input" id="lib-q" placeholder="Search…" style="min-height:38px;width:180px" aria-label="Search library">
            <select class="input" id="lib-cat" style="min-height:38px;width:auto" aria-label="Filter by category">
              <option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="lib-list">
        ${list.length ? list.map(i => `
          <div class="row" data-name="${esc(((i.title || '') + ' ' + (i.description || '')).toLowerCase())}" data-cat="${esc(i.category || '')}">
            <div class="row-main"><div class="t">${esc(i.title)}${i.broken_link ? ' <span class="tag alert">Reported broken</span>' : ''}</div>
              <div class="s">${esc(i.description || '')} ${i.category ? `· <span class="tag muted-tag">${esc(i.category)}</span>` : ''}</div></div>
            <button class="btn sm" data-broken="${i.id}">Report broken link</button>
            <a class="btn sm primary" href="${esc(i.url)}" target="_blank" rel="noopener">Open</a>
          </div>`).join('')
        : `<div class="empty"><div class="big">Nothing shared with you yet</div><div class="hint">Library links granted to you or your units appear here.</div></div>`}
        </div>
      </div>`;
    const apply = () => {
      const q = $('#lib-q').value.toLowerCase(), c = $('#lib-cat').value;
      $$('#lib-list .row').forEach(r => {
        r.style.display = (r.dataset.name.includes(q) && (!c || r.dataset.cat === c)) ? '' : 'none';
      });
    };
    $('#lib-q').addEventListener('input', apply);
    $('#lib-cat').addEventListener('change', apply);
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
  };

  // ── LEAVE ──
  window.DS.registerRoute('leave', {
    get title() { return 'Leave'; },
    get sub() { return isAdmin() ? 'Approve or decline leave requests' : 'Request leave and track it'; },
    render: async (v) => { isAdmin() ? await window.renderLeaveAdmin(v) : await window.renderLeave(v); },
  });

  window.renderLeave = async function (v) {
    const { data: mine } = await sb.from('leave_requests').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false });
    v.innerHTML = `
      <div class="card"><div class="card-head"><h3>Request leave</h3></div>
        <form id="lv-form" novalidate>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label class="label" for="lv-s">Start date</label><input class="input" id="lv-s" type="date" required></div>
            <div class="field"><label class="label" for="lv-e">End date</label><input class="input" id="lv-e" type="date" required></div>
          </div>
          <div class="field"><label class="label" for="lv-r">Reason</label><input class="input" id="lv-r"></div>
          <button class="btn primary" style="width:100%" type="submit">Submit request</button>
        </form>
      </div>
      <div class="card"><div class="card-head"><h3>My requests</h3></div>
        ${(mine && mine.length) ? mine.map(l => `<div class="row"><div class="row-main"><div class="t">${fmtD(l.start_date)} → ${fmtD(l.end_date)}</div><div class="s">${esc(l.reason || '')}</div></div>
          <span class="tag ${l.status === 'Approved' ? 'ok' : l.status === 'Declined' ? 'alert' : 'muted-tag'}">${l.status}</span></div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="hint">No leave requests yet.</div></div>`}
      </div>`;
    $('#lv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.from('leave_requests').insert({ user_id: S.user.id, start_date: $('#lv-s').value, end_date: $('#lv-e').value, reason: $('#lv-r').value.trim() || null });
      if (error) return toast(error.message, true);
      toast('Leave request submitted.');
      window.DS.navigate('leave');
    });
  };

  // ── CHANNELS (shared feed) ──
  window.DS.registerRoute('channels', {
    get title() { return 'Channels'; },
    get sub() { return isAdmin() ? 'Announcements and team channels' : 'General channel, your unit channels, announcements'; },
    render: async (v) => { isAdmin() ? await window.renderChannelsAdmin(v) : await window.renderChannelsView(v); },
  });

  window.renderChannelsView = async function (v) {
    const { data: channels } = await sb.from('channels').select('*').order('created_at');
    const list = channels || [];
    v.innerHTML = `<div class="card"><div class="card-head"><h3>Channels</h3></div>
      ${list.length ? list.map(c => `<div class="row"><div class="row-main"><div class="t"># ${esc(c.display_name || c.name)}</div>
        <div class="s">${esc(c.description || '')} · ${c.is_private ? 'Private' : 'Public'}${c.kind === 'announcements' ? ' · admin-only' : ''}</div></div>
        <button class="btn sm" data-open-ch="${c.id}" data-name="${esc(c.display_name || c.name)}" data-kind="${esc(c.kind || 'general')}">Open</button></div>`).join('')
      : `<div class="empty"><div class="big">No channels</div><div class="hint">Channels appear here once created.</div></div>`}</div>
      <div id="ch-feed"></div>`;
    $$('[data-open-ch]', v).forEach(b => b.addEventListener('click', () => loadChannelFeed(b.dataset.openCh, b.dataset.name, b.dataset.kind)));
  };

  async function loadChannelFeed(id, name, kind) {
    const feed = $('#ch-feed');
    if (!feed) return;
    feed.innerHTML = `<div class="card"><div class="card-head"><h3># ${esc(name)}</h3></div><div class="loading">Loading…</div></div>`;
    const { data } = await sb.from('channel_updates').select('*, profiles:author_id(full_name)').eq('channel_id', id).order('created_at', { ascending: false }).limit(30);
    const canPost = kind !== 'announcements' || isAdmin();
    feed.innerHTML = `<div class="card"><div class="card-head"><h3># ${esc(name)}</h3>${kind === 'announcements' ? '<span class="tag muted-tag">Admin-only posting</span>' : ''}</div>
      ${canPost ? `<form id="ch-form" style="margin-bottom:16px"><div class="field"><label class="label" for="ch-msg">New post</label>
        <textarea class="input" id="ch-msg" required placeholder="Write a message or paste a URL…"></textarea></div>
        <button class="btn primary sm" type="submit">Post</button></form>` : ''}
      ${(data && data.length) ? data.map(p => `<div class="row" style="align-items:flex-start"><div class="row-main">
        <div class="t">${esc(p.title || 'Post')}</div>
        <div class="s">${esc(p.body || '')}</div>
        ${p.drive_link ? `<div class="s"><a href="${esc(p.drive_link)}" target="_blank" rel="noopener">${esc(p.drive_link)}</a></div>` : ''}
        <div class="tiny muted">${esc(p.profiles?.full_name || 'Member')} · ${fmtDT(p.created_at)}</div>
      </div></div>`).join('') : `<div class="empty" style="padding:20px"><div class="hint">No posts yet.</div></div>`}
    </div>`;
    const form = $('#ch-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.from('channel_updates').insert({ channel_id: id, author_id: S.user.id, title: 'Post', body: $('#ch-msg').value.trim(), status: 'Published' });
      if (error) return toast(error.message, true);
      loadChannelFeed(id, name, kind);
    });
  }

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
    const p = S.profile;
    v.innerHTML = `<div class="card"><div class="card-head"><h3>Profile</h3></div>
      <dl class="kv">
        <dt>Name</dt><dd>${esc(p.full_name || '—')}</dd>
        <dt>Email</dt><dd>${esc(p.email)}</dd>
        <dt>Role</dt><dd>${esc(p.access_level)}</dd>
        <dt>Status</dt><dd>${p.active === false ? '<span class="tag alert">Deactivated</span>' : '<span class="tag ok">Active</span>'}</dd>
      </dl></div>
      <div class="card"><div class="card-head"><h3>Change password</h3></div>
        <form id="cp-form" novalidate>
          <div class="field"><label class="label" for="cp1">New password</label><input class="input" id="cp1" type="password" minlength="6" required autocomplete="new-password"></div>
          <button class="btn" type="submit">Update password</button>
        </form></div>`;
    $('#cp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: $('#cp1').value });
      if (error) return toast(error.message, true);
      toast('Password updated.');
    });
  };
})();
