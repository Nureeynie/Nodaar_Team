/* Nodaar DS — admin screens
   Review queue, review+score, users, units, tasks & OKRs, meetings,
   ideas, scores & periods, calendar & leave, library admin, channels. */
(function () {
  const { $, $$, esc, S, sb } = window.DS;
  const { todayLagos, fmtDT, fmtD } = window.DS.fmt;
  const toast = window.DS.toast;

  const SECTIONS = ['Operations','Team','Reseller','Supplier','Customers','Social Media','Logistics','Finance','Mission and Vision','Research','Product/App','Others'];
  const TASK_STATUS = ['To do','In progress','In review','Done'];
  const FB_STATUS = ['Submitted','Approved','In progress','Implemented','Rejected'];

  // ── helpers ──
  const nameOf = (p) => (p && (p.full_name || p.email)) || 'Unknown';
  const tagFor = (s) => {
    const t = String(s || '');
    if (['Rejected','Dismissed','Declined'].includes(t)) return 'alert';
    if (['Approved','Done','Implemented','Scored','Resolved'].includes(t)) return 'ok';
    if (['Submitted','Open','In progress','In Progress','In review','In Review'].includes(t)) return '';
    return 'muted-tag';
  };
  const statusTag = (s, extra) => `<span class="tag ${tagFor(s)}">${esc(s || '—')}${extra ? ' ' + esc(extra) : ''}</span>`;

  // "Late by Xh Ym"
  function lateBy(minutes) {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const parts = [];
    if (h) parts.push(h + 'h');
    if (m || !h) parts.push(m + 'm');
    return parts.join(' ');
  }

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
        <div class="stat"><div class="num">${pending.count || 0}</div><div class="cap">Waiting for review</div></div>
        <div class="stat"><div class="num">${submittedToday}<span class="muted" style="font-size:16px">/${active.length}</span></div><div class="cap">Reports today</div></div>
        <div class="stat"><div class="num ${missedToday ? 'alert-text' : ''}">${missedToday}</div><div class="cap">Missed today (0)</div></div>
        <div class="stat"><div class="num ${overdue.length ? 'alert-text' : ''}">${overdue.length}</div><div class="cap">Overdue tasks</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Needs your attention</h3><button class="btn primary sm" data-go="review">Open review queue</button></div>
        <div class="row"><div class="row-main"><div class="t">${pending.count || 0} daily reports waiting</div><div class="s">Approve with a score, or reject and ask for a resubmission.</div></div><button class="btn sm" data-go="review">Review</button></div>
        <div class="row"><div class="row-main"><div class="t">${openBlockers.length} open blockers today</div><div class="s">Members flagged something they cannot move past.</div></div></div>
        <div class="row"><div class="row-main"><div class="t">${(fb.data || []).length} ideas and problems awaiting a decision</div><div class="s">Approve, mark in progress, or reject with a reason.</div></div><button class="btn sm" data-go="ideas">Decide</button></div>
        <div class="row"><div class="row-main"><div class="t">${overdue.length} overdue tasks</div><div class="s">Past due date and not done.</div></div><button class="btn sm" data-go="tasks">Open tasks</button></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Per-member performance</h3><button class="btn sm ghost" data-go="scores">All scores</button></div>
        ${active.length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th class="sticky-col">Member</th><th>Latest weekly</th><th>Period</th><th>State</th></tr></thead>
          <tbody>${active.map(p => {
            const s = latest[p.id];
            const val = s ? (s.manual_override ?? s.weighted_total) : null;
            return `<tr>
              <td class="sticky-col" style="font-weight:700;white-space:nowrap">${esc(nameOf(p))}</td>
              <td style="white-space:nowrap">${val != null ? `<b>${val}/100</b>` : '<span class="muted">Not scored</span>'}</td>
              <td style="white-space:nowrap">${s ? esc(s.periods?.label || '—') : '—'}</td>
              <td style="white-space:nowrap">${s ? (s.periods?.locked ? '<span class="tag muted-tag">Period locked</span>' : '<span class="tag ok">Open</span>') : '<span class="tag muted-tag">No score</span>'}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`
        : emptyState('No members yet', 'Create users so the team can start reporting.', '<button class="btn primary sm" data-go="users">Create a user</button>')}
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
      items.push({ kind: 'daily', id: r.id, ts: r.submitted_at, who: pmap[r.user_id], late: r.is_late, lateMin: r.late_minutes, missed: r.missed_report, title: 'Daily report · ' + fmtD(r.report_date), sub: (r.did_yesterday || r.doing_today || '').slice(0, 90) });
    }
    for (const f of (feedback || [])) {
      items.push({ kind: 'feedback', id: f.id, ts: f.created_at, who: pmap[f.user_id], late: false, title: (f.type === 'idea' ? 'Idea' : 'Problem') + (f.title ? ' · ' + f.title : ''), sub: (f.content || '').slice(0, 90), feedback: f });
    }
    for (const a of (att || [])) {
      if (reviewedAtt.has(a.meeting_id + ':' + a.user_id)) continue;
      if (!a.note || !a.note.trim()) continue;
      items.push({ kind: 'meeting', id: a.id, ts: a.created_at || new Date().toISOString(), who: pmap[a.user_id], late: false, title: 'Meeting report · ' + (mmap[a.meeting_id]?.title || 'Meeting'), sub: a.note.slice(0, 90), att: a });
    }
    items.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    let reviewPage = 1;

    function renderReviewView() {
      const pg = window.DS.paginate(items, reviewPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head">
            <div>
              <h3>${items.length} item${items.length === 1 ? '' : 's'} waiting</h3>
              <p class="small muted" style="margin-top:2px">Daily scrums, meeting reports, and weekly ideas needing decisions</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <select class="input" id="rq-kind" style="min-height:36px;width:auto" aria-label="Filter by type">
                <option value="">All types</option><option value="daily">Daily reports</option>
                <option value="meeting">Meeting reports</option><option value="feedback">Ideas &amp; problems</option>
              </select>
              <select class="input" id="rq-who" style="min-height:36px;width:auto" aria-label="Filter by member">
                <option value="">Everyone</option>${people.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="rq-list">
          ${pg.items.length ? pg.items.map(it => `
            <div class="row" data-kind="${it.kind}" data-who="${it.who?.id || ''}">
              <div class="row-main">
                <div class="t">${esc(it.title)}${it.late ? ` <span class="tag alert">Late by ${lateBy(it.lateMin)}</span>` : ''}${it.missed ? ' <span class="tag alert">Missed</span>' : ''}</div>
                <div class="s">${esc(nameOf(it.who))} · submitted ${fmtDT(it.ts)}</div>
                ${it.sub ? `<div class="s">${esc(it.sub)}</div>` : ''}
              </div>
              <button class="btn primary sm" data-open="${it.kind}:${it.id}">Open &amp; score</button>
            </div>`).join('')
          : emptyState('Nothing to review', 'Every submission has been handled. New reports land here automatically.')}
          </div>
          ${pg.renderBar('review')}
        </div>`;

      const apply = () => {
        const k = $('#rq-kind').value, w = $('#rq-who').value;
        $$('#rq-list .row').forEach(r => {
          r.style.display = (!k || r.dataset.kind === k) && (!w || r.dataset.who === w) ? '' : 'none';
        });
      };
      $('#rq-kind')?.addEventListener('change', apply);
      $('#rq-who')?.addEventListener('change', apply);
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
      <h2 style="margin-bottom:6px">${E(o.title)}</h2>
      <p class="muted small" style="margin-bottom:10px">${o.meta || ''}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${o.lateFlag ? `<span class="tag alert">Late by ${E(o.lateFlag)}</span>` : ''}
        ${o.missed ? '<span class="tag alert">Missed report — recorded 0</span>' : ''}
        ${o.score != null ? `<span class="tag ok">Scored ${o.score}/100</span>` : '<span class="tag muted-tag">Not scored yet</span>'}
      </div>
      <div class="card" style="padding:16px;margin-bottom:16px">${o.body}</div>
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
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" style="flex:1;min-width:180px" id="rv-save" type="button">${E(o.saveLabel || 'Approve and save score')}</button>
        <button class="btn alert" style="flex:1;min-width:160px" id="rv-reject" type="button">Reject and ask to resubmit</button>
      </div>
      ${o.onDelete ? `<button class="btn ghost alert sm" style="width:100%;margin-top:12px" id="rv-del" type="button">Delete submission permanently</button>` : ''}
      <p class="tiny muted" style="margin-top:12px">The system never suggests a score — you decide. Late submissions are shown with their exact time and are not penalised automatically.</p>`}`;

    // wiring, called by the caller once the markup is in the DOM
    const bind = () => {
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
        if (!confirm('Are you sure you want to permanently delete this submission?')) return;
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
    const people = await loadPeople();
    const { data: units } = await sb.from('units').select('id,name');
    const { data: um } = await sb.from('unit_members').select('*');
    const unitMap = Object.fromEntries((units || []).map(u => [u.id, u.name]));
    let userPage = 1;

    function renderView() {
      const pg = window.DS.paginate(people, userPage, 25);
      v.innerHTML = `
        <div class="card">
          <div class="card-head"><h3>Create a user</h3></div>
          <form id="nu-form" novalidate>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 16px">
              <div class="field"><label class="label" for="nu-name">Full name</label><input class="input" id="nu-name" required placeholder="e.g. Alex Johnson"></div>
              <div class="field"><label class="label" for="nu-email">Email</label><input class="input" id="nu-email" type="email" required placeholder="alex@company.com"></div>
              <div class="field"><label class="label" for="nu-pass">Temporary password</label><input class="input" id="nu-pass" required minlength="6" placeholder="At least 6 characters"></div>
              <div class="field"><label class="label" for="nu-role">Access level</label><select class="input" id="nu-role"><option>Member</option><option>Admin</option></select></div>
              <div class="field"><label class="label" for="nu-unit">Assign to unit</label><select class="input" id="nu-unit"><option value="">None yet</option>${(units || []).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
              <div class="field"><label class="label" for="nu-position">Role in unit</label><input class="input" id="nu-position" placeholder="e.g. Lead, Analyst"></div>
            </div>
            <div class="error-box hidden" id="nu-error" style="margin-bottom:14px"></div>
            <button class="btn primary" type="submit">Create user</button>
            <p class="tiny muted" style="margin-top:10px">The user signs in with the temporary password and must set a new one before seeing anything.</p>
          </form>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h3>Team members</h3>
              <p class="small muted" style="margin-top:2px">${people.length} user${people.length === 1 ? '' : 's'} registered in system</p>
            </div>
            <span class="tag muted-tag">${pg.curPage} / ${pg.totalPages}</span>
          </div>
          ${pg.items.length ? `
            <div class="table-wrap"><table class="ds">
              <thead><tr><th class="sticky-col">Name</th><th>Email</th><th>Access</th><th>Units</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
              <tbody>${pg.items.map(p => {
                const myUnits = (um || []).filter(u => u.user_id === p.id).map(u => unitMap[u.unit_id]).filter(Boolean);
                const actions = [
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
                return `<tr>
                  <td class="sticky-col" style="font-weight:700;white-space:nowrap">${esc(nameOf(p))}</td>
                  <td style="white-space:nowrap">${esc(p.email || '')}</td>
                  <td style="white-space:nowrap">${p.access_level === 'Admin' ? '<span class="tag">Admin</span>' : '<span class="tag muted-tag">Member</span>'}</td>
                  <td style="white-space:nowrap">${myUnits.length ? esc(myUnits.join(', ')) : '<span class="muted">—</span>'}</td>
                  <td style="white-space:nowrap">${p.active === false ? '<span class="tag alert">Deactivated</span>' : '<span class="tag ok">Active</span>'}</td>
                  <td style="text-align:right">${window.DS.renderActionMenu(actions)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>
            ${pg.renderBar('users')}
          ` : emptyState('No users yet', 'Create the first account with the form above.')}
        </div>
      `;

      bindEvents();
      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (newPage) => {
        userPage = newPage;
        renderView();
      });
    }

    function bindEvents() {
      $('#nu-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#nu-error');
        err.classList.remove('show');
        const email = $('#nu-email').value.trim();
        const password = $('#nu-pass').value;
        const full_name = $('#nu-name').value.trim();
        const access_level = $('#nu-role').value;
        if (!full_name || !email || !password) { err.textContent = 'Name, email and temporary password are all required.'; err.classList.add('show'); return; }
        if (password.length < 6) { err.textContent = 'Temporary password must be at least 6 characters.'; err.classList.add('show'); return; }

        err.textContent = 'Creating account…';
        err.classList.add('show');
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
          err.classList.add('show');
          return;
        }
        const newId = body.user?.id;
        if (newId) {
          await sb.from('profiles').update({ access_level, must_change_password: true, active: true }).eq('id', newId);
          await audit('user_created', 'profiles:' + newId, null, email);
        }
        toast(`✓ User created. Temporary password: ${password}`);
        window.DS.navigate('users');
      });

      $$('[data-pw]', v).forEach(b => b.addEventListener('click', async () => {
        const pw = prompt('New temporary password (at least 6 characters):');
        if (!pw) return;
        if (pw.length < 6) return toast('Password must be at least 6 characters.', true);
        const { error } = await sb.auth.admin.setUserPassword
          ? await sb.auth.admin.setUserPassword(b.dataset.pw, pw)
          : await sb.auth.admin.updateUserById(b.dataset.pw, { password: pw });
        if (error) return toast(error.message, true);
        await sb.from('profiles').update({ must_change_password: true }).eq('id', b.dataset.pw);
        await audit('user_password_reset', 'profiles:' + b.dataset.pw);
        toast(`✓ Password reset: ${pw}`);
      }));

      $$('[data-promote]', v).forEach(b => b.addEventListener('click', async () => {
        const { error } = await sb.from('profiles').update({ access_level: 'Admin' }).eq('id', b.dataset.promote);
        if (error) return toast(error.message, true);
        await audit('user_promoted', 'profiles:' + b.dataset.promote, 'Member', 'Admin');
        toast('✓ Promoted to admin.');
        window.DS.navigate('users');
      }));

      $$('[data-demote]', v).forEach(b => b.addEventListener('click', async () => {
        const { error } = await sb.from('profiles').update({ access_level: 'Member' }).eq('id', b.dataset.demote);
        if (error) return toast(error.message, true);
        await audit('user_demoted', 'profiles:' + b.dataset.demote, 'Admin', 'Member');
        toast('Changed to member.', true);
        window.DS.navigate('users');
      }));

      $$('[data-tog]', v).forEach(b => b.addEventListener('click', async () => {
        const active = b.dataset.active === '1';
        const { error } = await sb.from('profiles').update({ active: !active }).eq('id', b.dataset.tog);
        if (error) return toast(error.message, true);
        await audit(active ? 'user_deactivated' : 'user_reactivated', 'profiles:' + b.dataset.tog);
        toast(active ? '✓ Account deactivated.' : '✓ Account reactivated.');
        window.DS.navigate('users');
      }));
    }

    renderView();
  };

  /* ============================================================
     UNITS & ROLES
     ============================================================ */
  window.renderUnitsAdmin = async function (v) {
    const [units, people, positions, um] = await Promise.all([
      loadUnits(), loadPeople(), loadPositions(),
      sb.from('unit_members').select('*').then(r => r.data || []),
    ]);
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));
    const posMap = Object.fromEntries(positions.map(p => [p.id, p.title]));

    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Create a unit</h3></div>
        <form id="nu2-form" novalidate>
          <div class="field"><label class="label" for="un-name">Unit name</label><input class="input" id="un-name" required placeholder="Operations"></div>
          <div class="field"><label class="label" for="un-desc">Description</label><input class="input" id="un-desc" placeholder="What this unit owns"></div>
          <div class="field"><label class="label" for="un-lead">Unit lead</label><select class="input" id="un-lead"><option value="">No lead yet</option>${people.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select></div>
          <div class="error-box hidden" id="nu2-error" style="margin-bottom:14px"></div>
          <button class="btn primary" type="submit">Create unit</button>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h3>Units</h3></div>
        ${units.length ? units.map(u => {
          const members = um.filter(m => m.unit_id === u.id);
          return `<div style="border-bottom:1px solid var(--line-soft);padding:var(--sp3) 0">
            <div class="card-head" style="margin-bottom:8px">
              <div><h3>${esc(u.name)}</h3><div class="small muted">${esc(u.description || '')}${u.lead_id ? ' · Lead: ' + esc(nameOf(pmap[u.lead_id])) : ''}</div></div>
              <div style="display:flex;gap:8px">
                <button class="btn sm" data-addm="${u.id}">Add member</button>
                <button class="btn sm ghost" data-delunit="${u.id}">Delete</button>
              </div>
            </div>
            ${members.length ? members.map(m => `<div class="row" style="padding:8px 0"><div class="row-main">
              <div class="t" style="font-size:13.5px">${esc(nameOf(pmap[m.user_id]))}</div>
              <div class="s">${esc(posMap[m.position_id] || 'Member')}</div>
            </div><button class="btn sm ghost" data-rmm="${m.id}" aria-label="Remove ${esc(nameOf(pmap[m.user_id]))} from unit">Remove</button></div>`).join('')
            : '<div class="small muted" style="padding:6px 0">No members yet.</div>'}
          </div>`;
        }).join('') : emptyState('No units yet', 'Create one above — a member can belong to several units.', '<button class="btn primary sm" data-focus="un-name">Create the first unit</button>')}
      </div>`;

    $('#nu2-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#nu2-error');
      err.classList.remove('show');
      const name = $('#un-name').value.trim();
      if (!name) { err.textContent = 'Unit name is required.'; err.classList.add('show'); return; }
      const { error } = await sb.from('units').insert({ name, description: $('#un-desc').value.trim() || null, lead_id: $('#un-lead').value || null });
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      await audit('unit_created', 'units:' + name);
      toast('Unit created.');
      window.DS.navigate('units');
    });

    $$('[data-addm]', v).forEach(b => b.addEventListener('click', () => addMemberModal(b.dataset.addm, people, positions, um)));
    $$('[data-rmm]', v).forEach(b => b.addEventListener('click', async () => {
      await sb.from('unit_members').delete().eq('id', b.dataset.rmm);
      await audit('unit_member_removed', 'unit_members:' + b.dataset.rmm);
      toast('Member removed from unit.');
      window.DS.navigate('units');
    }));
    $$('[data-delunit]', v).forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this unit? Its members and OKRs are removed too.')) return;
      await sb.from('units').delete().eq('id', b.dataset.delunit);
      await audit('unit_deleted', 'units:' + b.dataset.delunit);
      toast('Unit deleted.', true);
      window.DS.navigate('units');
    }));
    $('[data-focus]')?.addEventListener('click', () => $('#un-name')?.focus());
  };

  function addMemberModal(unitId, people, positions, um) {
    const inUnit = new Set(um.filter(m => m.unit_id === unitId).map(m => m.user_id));
    const avail = people.filter(p => !inUnit.has(p.id));
    window.DS.modal.open(`
      <h2 style="margin-bottom:16px">Add a member to the unit</h2>
      <form id="am-form" novalidate>
        <div class="field"><label class="label" for="am-user">Member</label>
          <select class="input" id="am-user" required>${avail.length ? avail.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('') : '<option value="">Everyone is already in this unit</option>'}</select></div>
        <div class="field"><label class="label" for="am-pos">Role in unit</label>
          <select class="input" id="am-pos"><option value="">Member</option>${positions.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="am-newpos">Or add a new role title</label><input class="input" id="am-newpos" placeholder="e.g. Analyst"></div>
        <div style="display:flex;gap:10px"><button class="btn primary" style="flex:1" type="submit">Add to unit</button><button class="btn" type="button" id="am-cancel">Cancel</button></div>
      </form>`);
    $('#am-cancel').addEventListener('click', window.DS.modal.close);
    $('#am-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = $('#am-user').value;
      if (!userId) return toast('No members left to add.', true);
      let posId = $('#am-pos').value || null;
      const np = ($('#am-newpos').value || '').trim();
      if (np) {
        const { data: p } = await sb.from('positions').select('id').eq('title', np).maybeSingle();
        if (p) posId = p.id;
        else { const { data: created } = await sb.from('positions').insert({ title: np }).select().single(); posId = created?.id; }
      }
      const { error } = await sb.from('unit_members').insert({ user_id: userId, unit_id: unitId, position_id: posId });
      if (error) return toast(error.message, true);
      await audit('unit_member_added', 'unit_members:' + unitId);
      window.DS.modal.close();
      toast('Member added.');
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
        ${(tasks || []).length ? `
          <div class="table-wrap"><table class="ds">
            <thead><tr><th class="sticky-col">Task</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due</th><th>Evidence</th><th style="text-align:right">Actions</th></tr></thead>
            <tbody>${(tasks || []).slice(0, 25).map(t => {
              const as = (assignees || []).filter(a => a.task_id === t.id).map(a => nameOf(pmap[a.user_id]));
              const overdue = t.due_date && t.due_date < date && t.status !== 'Done';
              const actions = [
                t.evidence_url ? { label: 'Open evidence link', icon: '↗', attrs: `onclick="window.open('${esc(t.evidence_url)}', '_blank')"` } : null,
                { divider: true },
                { label: 'Delete task', icon: '🗑️', isAlert: true, attrs: `data-del-task="${t.id}"` },
              ];
              return `<tr>
                <td class="sticky-col" style="font-weight:700;white-space:nowrap"><div class="table-cell-truncate" style="max-width:220px" title="${esc(t.title)}">${esc(t.title)}</div>${t.extension_requested ? ' <span class="tag muted-tag">Extension</span>' : ''}</td>
                <td style="white-space:nowrap">${as.length ? esc(as.join(', ')) : '<span class="muted">Unassigned</span>'}</td>
                <td><select class="input" style="min-height:30px;padding:2px 6px;font-size:12px" data-setst="${t.id}">${TASK_STATUS.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
                <td style="white-space:nowrap">${esc(t.priority || '—')}</td>
                <td style="white-space:nowrap">${overdue ? `<span class="tag alert">Overdue ${fmtD(t.due_date)}</span>` : (t.due_date ? fmtD(t.due_date) : '—')}</td>
                <td>${t.evidence_url ? `<a href="${esc(t.evidence_url)}" target="_blank" rel="noopener" class="btn sm ghost" style="padding:2px 8px;font-size:12px;white-space:nowrap">Link ↗</a>` : '<span class="muted">—</span>'}</td>
                <td style="text-align:right">${window.DS.renderActionMenu(actions)}</td>
              </tr>`;
            }).join('')}</tbody></table></div>
          ${window.DS.paginate(tasks || [], 1, 25).renderBar('tasks')}
        ` : emptyState('No tasks yet', 'Create one above and assign it to a member or a unit.')}
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

    $('#tf-status').addEventListener('change', () => {
      const f = $('#tf-status').value;
      $$('tbody tr', v).forEach(tr => {
        const sel = tr.querySelector('[data-setst]');
        tr.style.display = !f || (sel && sel.value === f) ? '' : 'none';
      });
    });

    $$('[data-setst]', v).forEach(sel => sel.addEventListener('change', async () => {
      const raw = sel.value;
      const map = { 'To do': 'To Do', 'In progress': 'In Progress', 'In review': 'In Review', 'Done': 'Done' };
      const { error } = await sb.from('tasks').update({ status: map[raw] || raw }).eq('id', sel.dataset.setst);
      if (error) return toast(error.message, true);
      await audit('task_status_changed', 'tasks:' + sel.dataset.setst, null, raw);
      toast('Task status updated.');
    }));

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

    $$('[data-del-task]', v).forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this task?')) return;
      b.disabled = true;
      const { error } = await sb.from('tasks').delete().eq('id', b.dataset.delTask);
      if (error) { toast(error.message, true); b.disabled = false; return; }
      toast('✓ Task deleted.');
      window.DS.navigate('tasks');
    }));
  };

  /* ============================================================
     MEETINGS (admin)
     ============================================================ */
  window.renderMeetingsAdmin = async function (v) {
    const [people, units, { data: meetings }] = await Promise.all([
      loadPeople(), loadUnits(),
      sb.from('meetings').select('*').order('starts_at', { ascending: false }),
    ]);
    const { data: att } = await sb.from('meeting_attendance').select('*');
    const pmap = Object.fromEntries(people.map(p => [p.id, p]));

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
          <div class="field"><label class="label" for="mt-invite">Invite members</label>
            <select class="input" id="mt-invite" multiple size="5" aria-label="Choose members to invite">${people.map(p => `<option value="${p.id}">${esc(nameOf(p))}</option>`).join('')}</select>
            <div class="small muted" style="margin-top:4px">Hold Ctrl or Cmd to pick more than one. Everyone is invited when no unit is chosen.</div>
          </div>
          <div class="error-box hidden" id="nm-error" style="margin-bottom:14px"></div>
          <button class="btn primary" type="submit">Create meeting</button>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h3>Meetings</h3></div>
        ${(meetings || []).length ? (meetings || []).map(raw => {
          const m = window.DS.meeting(raw);
          const reports = (att || []).filter(a => a.meeting_id === m.id);
          const yes = reports.filter(a => a.attended).length;
          return `<div style="border-bottom:1px solid var(--line-soft);padding:var(--sp3) 0">
            <div class="card-head" style="margin-bottom:8px">
              <div><h3>${esc(m.title)}</h3><div class="small muted">${fmtDT(m.starts_at)}${m.ends_at ? ' – ' + fmtDT(m.ends_at) : ''} · ${esc(m.units?.name || 'Everyone')}</div></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn sm" data-att="${m.id}">Mark attendance</button>
                <button class="btn sm" data-notes="${m.id}">Notes link</button>
              </div>
            </div>
            <div class="small muted">${reports.length ? `${yes} of ${reports.length} reported attending` : 'No meeting reports yet'}${m.notes_link ? ' · Notes: ' + esc(m.notes_link) : ''}</div>
          </div>`;
        }).join('') : emptyState('No meetings yet', 'Create one above and invite a unit or individual members.')}
      </div>`;

    $('#nm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#nm-error');
      err.classList.remove('show');
      const title = $('#mt-title').value.trim();
      const start = $('#mt-start').value;
      if (!title || !start) { err.textContent = 'Title and start time are required.'; err.classList.add('show'); return; }
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
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      const picked = [...$('#mt-invite').selectedOptions].map(o => o.value);
      for (const uid of picked) { try { await sb.from('meeting_attendance').insert({ meeting_id: created.id, user_id: uid, attended: false }); } catch (e) { /* best-effort */ } }
      await audit('meeting_created', 'meetings:' + created.id, null, title);
      for (const uid of picked) await notifyUser(uid, 'meeting', 'New meeting: ' + title, fmtDT(new Date(start).toISOString()), 'meetings');
      toast('Meeting created.');
      window.DS.navigate('meetings');
    });

    $$('[data-att]', v).forEach(b => b.addEventListener('click', () => attendanceModal(b.dataset.att, people)));
    $$('[data-notes]', v).forEach(b => b.addEventListener('click', async () => {
      const url = prompt('Notes link (URL):', 'https://');
      if (url === null) return;
      await sb.from('meetings').update({ minutes: url, drive_notes_link: url }).eq('id', b.dataset.notes);
      await audit('meeting_notes_updated', 'meetings:' + b.dataset.notes);
      toast('Notes link saved.');
      window.DS.navigate('meetings');
    }));
  };

  function attendanceModal(meetingId, people) {
    window.DS.modal.open(`
      <h2 style="margin-bottom:6px">Mark attendance</h2>
      <p class="muted small" style="margin-bottom:16px">Tick who attended. Members can still file their own meeting report afterwards.</p>
      <form id="at-form" novalidate>
        <div style="max-height:50vh;overflow-y:auto;border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:8px 12px;margin-bottom:16px">
          ${people.map(p => `<label class="row" style="cursor:pointer"><span style="width:22px"><input type="checkbox" name="att" value="${p.id}"></span><span class="row-main"><span class="t">${esc(nameOf(p))}</span></span></label>`).join('')}
        </div>
        <div style="display:flex;gap:10px"><button class="btn primary" style="flex:1" type="submit">Save attendance</button><button class="btn" type="button" id="at-cancel">Cancel</button></div>
      </form>`);
    $('#at-cancel').addEventListener('click', window.DS.modal.close);
    $('#at-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ids = [...$$('input[name="att"]:checked', document)].map(i => i.value);
      for (const uid of ids) {
        const { error } = await sb.from('meeting_attendance').upsert({ meeting_id: meetingId, user_id: uid, attended: true }, { onConflict: 'meeting_id,user_id' });
        if (error) toast(error.message, true);
      }
      await audit('attendance_marked', 'meeting_attendance:' + meetingId);
      window.DS.modal.close();
      toast(`${ids.length} marked as attending.`);
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

    v.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>All submissions</h3>
          <select class="input" id="if-filter" style="min-height:38px;width:auto" aria-label="Filter submissions">
            <option value="">All</option><option value="idea">Ideas</option><option value="problem">Problems</option>
            <option value="pending">Awaiting decision</option>
          </select>
        </div>
        ${list.length ? `<div id="if-list">${list.map(f => `
          <div class="row" data-type="${f.type}" data-pending="${['Submitted','Open'].includes(f.status) ? '1' : '0'}" style="align-items:flex-start">
            <div class="row-main">
              <div class="t">${f.type === 'idea' ? 'Idea' : 'Problem'}${f.title ? ' · ' + esc(f.title) : ''}</div>
              <div class="s">${esc(nameOf(pmap[f.user_id]))} · ${esc(f.periods?.label || 'No period')} · ${esc(f.section || 'No section')}${f.severity ? ' · ' + esc(f.severity) : ''}</div>
              <div class="s">${esc(f.content || '')}</div>
              ${f.admin_note ? `<div class="s">Admin note: ${esc(f.admin_note)}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              ${statusTag(f.status)}
              <button class="btn sm" data-dec="${f.id}">Decide</button>
            </div>
          </div>`).join('')}</div>`
        : emptyState('Nothing submitted yet', 'Members submit one idea and one problem each week. They land here.')}
      </div>`;

    $('#if-filter').addEventListener('change', () => {
      const f = $('#if-filter').value;
      $$('#if-list .row').forEach(r => {
        const match = !f || r.dataset.type === f || (f === 'pending' && r.dataset.pending === '1');
        r.style.display = match ? '' : 'none';
      });
    });

    $$('[data-dec]', v).forEach(b => b.addEventListener('click', async () => {
      const { data: f } = await sb.from('weekly_feedback').select('*').eq('id', b.dataset.dec).single();
      window.DS.modal.open(`
        <h2 style="margin-bottom:6px">${f.type === 'idea' ? 'Idea' : 'Problem'} decision</h2>
        <p class="muted small" style="margin-bottom:16px">${esc(f.title || '')} · ${esc(f.section || 'No section')}</p>
        <div class="card" style="padding:14px;margin-bottom:16px"><div class="small">${esc(f.content || '')}</div></div>
        <form id="dec-form" novalidate>
          <div class="field"><label class="label" for="dec-status">Status</label>
            <select class="input" id="dec-status">${FB_STATUS.map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label class="label" for="dec-note">Reason / note</label><textarea class="input" id="dec-note" placeholder="Explain the decision — the member sees this.">${esc(f.admin_note || '')}</textarea></div>
          <div style="display:flex;gap:10px"><button class="btn primary" style="flex:1" type="submit">Save decision</button><button class="btn" type="button" id="dec-cancel">Cancel</button></div>
        </form>`);
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
    }));
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
        <div class="card-head"><h3>Periods</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn sm" id="new-period">New period</button>
          </div>
        </div>
        ${(periods || []).length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th>Period</th><th>Type</th><th>Dates</th><th>State</th><th>Actions</th></tr></thead>
          <tbody>${(periods || []).map(p => `<tr>
            <td style="font-weight:700">${esc(p.label)}</td>
            <td>${p.type === 'weekly' ? 'Weekly' : 'Monthly'}</td>
            <td>${fmtD(p.start_date)} → ${fmtD(p.end_date)}</td>
            <td>${p.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>'}</td>
            <td>${p.locked
              ? `<button class="btn sm" data-unlock="${p.id}" data-label="${esc(p.label)}">Reopen</button>`
              : `<button class="btn sm" data-lock="${p.id}" data-label="${esc(p.label)}">Lock</button>`}</td>
          </tr>`).join('')}</tbody></table></div>`
        : emptyState('No periods yet', 'Create a weekly period so reports and scores have somewhere to land.')}
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
        <div class="card-head"><h3>Weekly scores</h3></div>
        ${(weekly || []).length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th class="sticky-col">Member</th><th>Period</th><th>Breakdown</th><th>Total</th><th>State</th></tr></thead>
          <tbody>${weekly.map(s => `<tr>
            <td class="sticky-col" style="font-weight:700;white-space:nowrap">${esc(nameOf(pmap[s.user_id]))}</td>
            <td style="white-space:nowrap">${esc(s.periods?.label || '—')}</td>
            <td class="small"><div class="table-cell-truncate" style="max-width:220px" title="${esc(Object.entries(s.criterion_scores || {}).map(([k, val]) => `${k}: ${val}`).join(', ')) }">${Object.entries(s.criterion_scores || {}).map(([k, val]) => `${esc(k)} ${val}`).join(' · ') || '—'}</div></td>
            <td style="font-weight:800;white-space:nowrap">${s.manual_override ?? s.weighted_total}/100</td>
            <td style="white-space:nowrap">${s.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>'}</td>
          </tr>`).join('')}</tbody></table></div>`
        : emptyState('No weekly scores yet', 'Scores appear here once you enter them above.')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Monthly scores</h3></div>
        ${(monthly || []).length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th class="sticky-col">Member</th><th>Period</th><th>Weekly average</th><th>Final</th><th>State</th></tr></thead>
          <tbody>${monthly.map(m => `<tr>
            <td class="sticky-col" style="font-weight:700;white-space:nowrap">${esc(nameOf(pmap[m.user_id]))}</td>
            <td style="white-space:nowrap">${esc(m.periods?.label || '—')}</td>
            <td style="white-space:nowrap">${m.weekly_avg ?? '—'}</td>
            <td style="font-weight:800;white-space:nowrap">${m.final_score ?? m.weekly_avg}/100</td>
            <td style="white-space:nowrap">${m.periods?.locked ? '<span class="tag muted-tag">Locked</span>' : '<span class="tag ok">Open</span>'}</td>
          </tr>`).join('')}</tbody></table></div>`
        : emptyState('No monthly scores yet', 'Monthly rollups appear when a month period is scored.')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Audit log</h3><span class="tag muted-tag">Last 25 changes</span></div>
        ${(auditRows || []).length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th class="sticky-col">When</th><th>Who</th><th>Action</th><th>Target</th><th>Change</th></tr></thead>
          <tbody>${auditRows.map(a => `<tr>
            <td class="sticky-col" style="white-space:nowrap">${fmtDT(a.created_at)}</td>
            <td style="white-space:nowrap">${esc(nameOf(a.profiles))}</td>
            <td style="white-space:nowrap">${esc(a.action)}</td>
            <td class="small"><div class="table-cell-truncate" style="max-width:180px" title="${esc(a.target || '—')}">${esc(a.target || '—')}</div></td>
            <td class="small"><div class="table-cell-truncate" style="max-width:200px" title="${esc(a.old_value || '')} → ${esc(a.new_value || '')}">${a.old_value ? esc(a.old_value) : '—'} → ${a.new_value ? esc(a.new_value) : '—'}</div></td>
          </tr>`).join('')}</tbody></table></div>`
        : emptyState('No changes recorded yet', 'Score edits, locks and user changes are logged here.')}
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
        <h2 style="margin-bottom:16px">New period</h2>
        <form id="np-form" novalidate>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
            <div class="field"><label class="label" for="np-type">Type</label><select class="input" id="np-type"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
            <div class="field"><label class="label" for="np-label">Label</label><input class="input" id="np-label" required placeholder="2026-W48"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
            <div class="field"><label class="label" for="np-start">Start date</label><input class="input" id="np-start" type="date" required></div>
            <div class="field"><label class="label" for="np-end">End date</label><input class="input" id="np-end" type="date" required></div>
          </div>
          <div style="display:flex;gap:10px"><button class="btn primary" style="flex:1" type="submit">Create period</button><button class="btn" type="button" id="np-cancel">Cancel</button></div>
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
      if (!confirm(`Lock ${b.dataset.label}? Scores in this period become read-only until an admin reopens it.`)) return;
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
        <div class="card-head"><h3>Leave requests</h3></div>
        ${(leaves || []).length ? (leaves || []).map(l => `<div class="row" style="align-items:flex-start">
          <div class="row-main">
            <div class="t">${esc(nameOf(pmap[l.user_id]))}</div>
            <div class="s">${fmtD(l.start_date)} → ${fmtD(l.end_date)}${l.reason ? ' · ' + esc(l.reason) : ''}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${statusTag(l.status)}
            ${l.status === 'Pending' ? `
              <button class="btn sm primary" data-lv="1" data-id="${l.id}" data-who="${l.user_id}">Approve</button>
              <button class="btn sm alert" data-lv="0" data-id="${l.id}" data-who="${l.user_id}">Decline</button>` : ''}
          </div>
        </div>`).join('') : emptyState('No leave requests', 'Requests from members appear here for approval.')}
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
        ${(events || []).length ? `<div class="table-wrap"><table class="ds">
          <thead><tr><th>Event</th><th>Type</th><th>Dates</th><th>Notes</th></tr></thead>
          <tbody>${(events || []).map(e => `<tr>
            <td style="font-weight:700">${esc(e.title)}</td>
            <td>${esc(e.event_type)}</td>
            <td>${fmtD(e.start_at)} → ${fmtD(e.end_at)}</td>
            <td class="small">${esc(e.description || '')}</td>
          </tr>`).join('')}</tbody></table></div>`
        : emptyState('No calendar events', 'Add holidays and days off so the team knows when reports are not expected.')}
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

    $$('[data-lv]', v).forEach(b => b.addEventListener('click', async () => {
      const ok = b.dataset.lv === '1';
      const { error } = await sb.from('leave_requests').update({
        status: ok ? 'Approved' : 'Declined', reviewed_by: S.user.id,
      }).eq('id', b.dataset.id);
      if (error) return toast(error.message, true);
      await audit('leave_' + (ok ? 'approved' : 'declined'), 'leave_requests:' + b.dataset.id);
      await notifyUser(b.dataset.who, 'leave', `Leave ${ok ? 'approved' : 'declined'}`, null, 'leave');
      toast(ok ? 'Leave approved.' : 'Leave declined.', !ok);
      window.DS.navigate('leave');
    }));

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

    function renderLib() {
      const pg = window.DS.paginate(itemList, libPage, 25);
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
              <p class="small muted" style="margin-top:2px">${itemList.length} shared document${itemList.length === 1 ? '' : 's'}</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input class="input" id="li-q" placeholder="Search…" style="min-height:36px;width:170px" aria-label="Search library entries">
              <select class="input" id="li-cat-filter" style="min-height:36px;width:auto" aria-label="Filter by category">
                <option value="">All categories</option>${[...new Set(itemList.map(i => i.category).filter(Boolean))].map(c => `<option>${esc(c)}</option>`).join('')}
              </select>
            </div>
          </div>
          ${pg.items.length ? `
            <div id="li-list">
              ${pg.items.map(i => {
                const actions = [
                  { label: 'Access permissions', icon: '👥', attrs: `data-grant="${i.id}"` },
                  { divider: true },
                  { label: 'Delete entry', icon: '🗑️', isAlert: true, attrs: `data-delitem="${i.id}"` },
                ];
                return `
                  <div class="row" data-name="${esc(((i.title || '') + ' ' + (i.description || '')).toLowerCase())}" data-cat="${esc(i.category || '')}" data-broken="${i.broken_link ? '1' : '0'}" style="align-items:flex-start">
                    <div class="row-main">
                      <div class="t">${esc(i.title)} ${i.broken_link ? '<span class="tag alert">Broken link</span>' : ''}</div>
                      <div class="s">${esc(i.description || '')} ${i.category ? `· <span class="tag muted-tag">${esc(i.category)}</span>` : ''}</div>
                      <div class="s">${grantText(i.id)}</div>
                      <div class="tiny muted">Added by ${esc(nameOf(i.profiles))} · ${i.open_count || 0} opens${i.last_broken_report_at ? ' · broken reported ' + fmtDT(i.last_broken_report_at) : ''}</div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                      <a class="btn sm" href="${esc(i.url)}" target="_blank" rel="noopener">Open ↗</a>
                      ${window.DS.renderActionMenu(actions)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${pg.renderBar('lib')}
          ` : emptyState('The library is empty', 'Add a link above and grant access to the people who need it.')}
        </div>

        <div class="card">
          <div class="card-head"><h3>Broken link reports</h3><span class="tag ${(broken || []).length ? 'alert' : 'muted-tag'}">${(broken || []).length} open</span></div>
          ${(broken || []).length ? (broken || []).map(b => `<div class="row">
            <div class="row-main"><div class="t">${esc(b.title)}</div><div class="s">${esc(b.body || '')} · ${fmtDT(b.created_at)}</div></div>
          </div>`).join('') : emptyState('No broken links reported', 'Members can report a dead link from their library view.')}
        </div>
      `;

      bindLib();
      window.DS.initActionMenus(v);
      window.DS.bindPagination(v, (p) => {
        libPage = p;
        renderLib();
      });
    }

    function bindLib() {
      const apply = () => {
        const q = $('#li-q').value.toLowerCase(), c = $('#li-cat-filter').value;
        $$('#li-list .row').forEach(r => {
          r.style.display = (r.dataset.name.includes(q) && (!c || r.dataset.cat === c)) ? '' : 'none';
        });
      };
      $('#li-q')?.addEventListener('input', apply);
      $('#li-cat-filter')?.addEventListener('change', apply);

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

      $$('[data-grant]', v).forEach(b => b.addEventListener('click', () => grantModal(b.dataset.grant, people, units, grants)));
      $$('[data-delitem]', v).forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this library entry?')) return;
        await sb.from('library_grants').delete().eq('item_id', b.dataset.delitem);
        await sb.from('library_items').delete().eq('id', b.dataset.delitem);
        await audit('library_item_deleted', 'library_items:' + b.dataset.delitem);
        toast('✓ Entry deleted.', true);
        window.DS.navigate('library');
      }));
    }

    renderLib();
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
