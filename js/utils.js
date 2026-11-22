// Shared utilities
export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
export function loadingHTML(span='') {
  return `<div class="${span} flex items-center justify-center py-12 text-xs text-slate-400 gap-2">
    <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading…</div>`;
}
export function showToast(msg, isErr=false) {
  const t = document.getElementById('toast');
  if (!t) return alert(msg);
  t.innerHTML = (isErr ? '❌ ' : '✅ ') + escapeHtml(msg);
  t.className = `fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 text-xs font-semibold px-4 py-3 rounded-xl shadow-xl transition-all duration-300 flex items-center gap-2 max-w-xs ${isErr ? 'bg-red-600 text-white' : 'bg-navy-900 text-white'} opacity-100`;
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.add('opacity-0'), 3200);
}
export function debounce(fn, ms=300) {
  let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(()=> fn(...args), ms); };
}
