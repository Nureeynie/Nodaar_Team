// Nodaar Teams-like Calendar — Mon-Sat 10am-4pm, 10-member team
// Features: Week/Day/Month view, meetings auto-synced, Add to Google/Outlook/ICS, work-hours shade

let calView = 'week'; // week | day | month
let calDate = new Date(); // current anchor

function startOfWeek(d){ const day=d.getDay(); const diff = d.getDate()-day + (day===0? -6:1); return new Date(d.setDate(diff)); } // Monday start
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function fmtTime(d){ return d.toLocaleTimeString('en-GB',{hour:'2-digit', minute:'2-digit'}); }

async function loadCalendar(){
  const container = document.getElementById('calendar-container');
  if(!container) return;
  container.innerHTML = loadingHTML();

  // Fetch calendar_events + meetings fallback
  let events = [];
  try {
    const sb = window.sbClient;
    const { data } = await sb.from('calendar_events').select('*').order('start_at', {ascending:true}).limit(100);
    events = data || [];
  } catch(e){
    // fallback to meetings if table not yet created
    try {
      const { data: meetings } = await window.sbClient.from('meetings').select('*').order('meeting_date');
      events = (meetings||[]).map(m=> ({
        title: m.title, description: m.agenda, start_at: `${m.meeting_date}T${m.start_time}`, end_at: `${m.meeting_date}T${m.end_time}`, location: m.meet_link, event_type:'meeting', meeting_id: m.id
      }));
    } catch(_){ events = JSON.parse(localStorage.getItem('calendar_fallback')||'[]'); }
    if(!events.length) { /* demo for 10-member team */ }
  }

  // Controls
  const nav = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2">
        <button onclick="calNav(-1)" class="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">‹</button>
        <span class="font-black text-navy-900 text-sm px-2">${calTitle()}</span>
        <button onclick="calNav(1)" class="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">›</button>
        <button onclick="calToday()" class="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl">Today</button>
      </div>
      <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
        ${['week','day','month'].map(v=> `<button onclick="setCalView('${v}')" class="px-3 py-1.5 text-xs font-bold rounded-lg ${calView===v?'bg-white shadow text-navy-900':'text-slate-500'}">${v.toUpperCase()}</button>`).join('')}
      </div>
      <div class="text-xs text-slate-500">Mon-Sat 10am-4pm • ${events.filter(e=> e.event_type==='meeting').length} meetings • <span class="font-bold text-emerald-600">${events.length} events</span></div>
    </div>
  `;

  let body = '';
  if(calView==='week'){
    const start = startOfWeek(new Date(calDate));
    const days = Array.from({length:6}, (_,i)=> addDays(new Date(start), i)); // Mon-Sat only!
    body = `
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto horizontal-scroller">
          <div class="min-w-[640px]">
            <div class="grid grid-cols-6 bg-slate-50 border-b border-slate-200">
              ${days.map(d=> `<div class="p-3 text-center border-r border-slate-200 last:border-0 ${fmtDate(d)===fmtDate(new Date())?'bg-brand-50':''}">
                <div class="text-xs font-black text-slate-500 uppercase">${d.toLocaleDateString('en',{weekday:'short'})}</div>
                <div class="text-lg font-black ${fmtDate(d)===fmtDate(new Date())?'text-brand-600': 'text-navy-900'}">${d.getDate()}</div>
                <div class="text-xs ${publicIsWorkingDay(d)?'text-emerald-600':'text-red-500'}">${publicIsWorkingDay(d)?'10am-4pm':'Off'}</div>
              </div>`).join('')}
            </div>
            <div class="grid grid-cols-6 min-h-[320px]">
              ${days.map(d=> {
                const dayStr = fmtDate(d);
                const dayEvents = events.filter(e=> fmtDate(new Date(e.start_at))===dayStr);
                return `<div class="p-2 border-r border-slate-100 last:border-0 space-y-2 ${!publicIsWorkingDay(d)?'bg-slate-50/50':''}">
                  ${dayEvents.length? dayEvents.map(ev=> eventCard(ev)).join('') : `<div class="text-xs text-slate-300 text-center py-8">No events</div>`}
                  ${publicIsWorkingDay(d)? `<button onclick="quickAdd('${dayStr}')" class="w-full mt-2 py-1.5 text-xs font-bold text-slate-400 hover:text-brand-600 border border-dashed border-slate-200 rounded-lg hover:border-brand-300">+ Add</button>`: ''}
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  } else if(calView==='day'){
    const dayStr = fmtDate(calDate);
    const dayEvents = events.filter(e=> fmtDate(new Date(e.start_at))===dayStr);
    body = `<div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <h3 class="font-black text-navy-900 mb-3">${calDate.toLocaleDateString('en',{weekday:'long', day:'numeric', month:'long'})} — ${publicIsWorkingDay(calDate)?'Work Day 10am-4pm':'Off Day (Sunday)'}</h3>
      <div class="space-y-2">${dayEvents.length? dayEvents.map(eventCard).join('') : '<p class="text-xs text-slate-400 py-6 text-center">No events — enjoy focus time!</p>'}</div>
      <div class="mt-4 flex flex-wrap gap-2">${publicIsWorkingDay(calDate)? `<button onclick="quickAdd('${dayStr}')" class="w-full sm:w-auto px-4 py-2 bg-brand-500 text-white text-xs font-bold rounded-xl shadow-sm">+ Add Meeting</button>`: '<span class="text-xs text-red-500">Sunday off — overtime needs approval</span>'}<button onclick="exportICSForDay('${dayStr}')" class="w-full sm:w-auto px-4 py-2 bg-white border border-slate-200 text-xs font-bold rounded-xl shadow-sm">⬇ Export .ics</button></div>
    </div>`;
  } else { // month
    const y=calDate.getFullYear(), m=calDate.getMonth();
    const first=new Date(y,m,1), last=new Date(y,m+1,0);
    const daysInMonth = Array.from({length: last.getDate()}, (_,i)=> new Date(y,m,i+1));
    body = `<div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto horizontal-scroller">
        <div class="min-w-[700px]">
          <div class="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=> `<div class="p-2 text-center text-xs font-black text-slate-500">${d}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7">
            ${daysInMonth.map(d=> {
              const dayStr=fmtDate(d); const dayEvents=events.filter(e=> fmtDate(new Date(e.start_at))===dayStr);
              const isSun = d.getDay()===0;
              return `<div class="min-h-[90px] p-2 border-r border-b border-slate-100 ${isSun?'bg-red-50/40':''} ${fmtDate(d)===fmtDate(new Date())?'bg-brand-50':''}">
                <div class="text-xs font-bold ${isSun?'text-red-500': fmtDate(d)===fmtDate(new Date())?'text-brand-600':'text-navy-900'}">${d.getDate()} ${isSun?'(Off)':''}</div>
                <div class="mt-1 space-y-1">${dayEvents.slice(0,2).map(ev=> `<div class="text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded truncate">${escapeHtml(ev.title)} ${new Date(ev.start_at).toLocaleTimeString('en-GB',{hour:'2-digit', minute:'2-digit'})}</div>`).join('')}${dayEvents.length>2? `<div class="text-xs text-slate-400">+${dayEvents.length-2} more</div>`:''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = nav + body;
}

function calTitle(){
  if(calView==='day') return calDate.toLocaleDateString('en',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  if(calView==='week'){ const s=startOfWeek(new Date(calDate)); const e=addDays(s,5); return `${s.toLocaleDateString('en',{month:'short', day:'numeric'})} — ${e.toLocaleDateString('en',{month:'short', day:'numeric', year:'numeric'})} (Mon-Sat)`; }
  return calDate.toLocaleDateString('en',{month:'long', year:'numeric'});
}
function calNav(dir){
  if(calView==='day') calDate = addDays(calDate, dir);
  else if(calView==='week') calDate = addDays(calDate, dir*7);
  else calDate = new Date(calDate.getFullYear(), calDate.getMonth()+dir, 1);
  loadCalendar();
}
function calToday(){ calDate=new Date(); loadCalendar(); }
function setCalView(v){ calView=v; loadCalendar(); }
function publicIsWorkingDay(d){ const day=d.getDay(); return day>=1 && day<=6; } // Mon=1 .. Sat=6
window.publicIsWorkingDay = publicIsWorkingDay;

function eventCard(ev){
  const s=new Date(ev.start_at), e=new Date(ev.end_at);
  const isMeeting = ev.event_type==='meeting';
  return `
    <div class="p-2.5 bg-white border border-slate-200 rounded-xl hover:shadow-md transition cursor-pointer" onclick="openCalEvent('${ev.id||ev.meeting_id}')">
      <div class="text-xs font-black text-navy-900 truncate">${escapeHtml(ev.title)}</div>
      <div class="text-xs text-slate-500">${fmtTime(s)} — ${fmtTime(e)} • ${isMeeting?'📅 Meeting':'📌 ' + ev.event_type}</div>
      ${ev.location? `<a href="${ev.location}" target="_blank" class="text-xs text-brand-600 font-bold hover:underline">Join ↗</a>` : ''}
      <div class="mt-1 flex gap-1">
        <a href="${googleCalUrl(ev)}" target="_blank" class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold hover:bg-blue-100">GCal</a>
        <a href="${outlookUrl(ev)}" target="_blank" class="text-xs bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold hover:bg-black">Outlook</a>
        <button onclick="event.stopPropagation(); exportICS('${ev.id||ev.meeting_id}')" class="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">.ics</button>
      </div>
    </div>
  `;
}

function googleCalUrl(ev){
  const s=new Date(ev.start_at).toISOString().replace(/-|:|\.\d+/g,''), e=new Date(ev.end_at).toISOString().replace(/-|:|\.\d+/g,'');
  const details = encodeURIComponent(ev.description||'');
  const loc = encodeURIComponent(ev.location||'');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${s}/${e}&details=${details}&location=${loc}`;
}
function outlookUrl(ev){
  const s=new Date(ev.start_at).toISOString(), e=new Date(ev.end_at).toISOString();
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(ev.title)}&body=${encodeURIComponent(ev.description||'')}&&startdt=${s}&enddt=${e}&location=${encodeURIComponent(ev.location||'')}`;
}
function icsContent(ev){
  const dt = (d)=> new Date(d).toISOString().replace(/-|:|\.\d+/g,'');
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Nodaar//Calendar//EN\nBEGIN:VEVENT\nUID:${ev.id||ev.meeting_id}@nodaar.com\nDTSTAMP:${dt(new Date())}\nDTSTART:${dt(ev.start_at)}\nDTEND:${dt(ev.end_at)}\nSUMMARY:${ev.title}\nDESCRIPTION:${(ev.description||'').replace(/\n/g,'\\n')}\nLOCATION:${ev.location||''}\nEND:VEVENT\nEND:VCALENDAR`;
}
function exportICS(id){
  const ev = { id, title: 'Meeting', start_at: new Date().toISOString(), end_at: new Date(Date.now()+3600000).toISOString(), location:'' };
  // Try fetch real event
  const blob = new Blob([icsContent(ev)], {type:'text/calendar'});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='nodaar-meeting.ics'; a.click(); URL.revokeObjectURL(url);
}
function exportICSForDay(dayStr){ exportICS(dayStr); }
function quickAdd(dayStr){ 
  // Open meeting modal prefilled
  activeTab='meetings'; navigate('meetings');
  setTimeout(()=>{ openActionModal(); const d=document.getElementById('f-date'); if(d) d.value=dayStr; const s=document.getElementById('f-start'); if(s) s.value='10:00'; const e=document.getElementById('f-end'); if(e) e.value='11:00'; }, 200);
}
function openCalEvent(id){ /* future: detail */ }

window.loadCalendar=loadCalendar; window.calNav=calNav; window.calToday=calToday; window.setCalView=setCalView;
window.googleCalUrl=googleCalUrl; window.outlookUrl=outlookUrl; window.exportICS=exportICS; window.exportICSForDay=exportICSForDay; window.quickAdd=quickAdd; window.addDays=addDays; window.fmtDate=fmtDate; window.eventCard=eventCard;
