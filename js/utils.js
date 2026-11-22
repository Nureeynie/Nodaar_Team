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
  clearTimeout(t._timer);
  clearTimeout(t._hideTimer);

  t.innerHTML = `
    <span class="text-base flex-shrink-0">${isErr ? '❌' : '✅'}</span>
    <span class="flex-1 text-xs sm:text-sm font-semibold leading-snug">${escapeHtml(msg)}</span>
    <button type="button" onclick="window.hideToast ? window.hideToast() : this.parentElement.style.display='none'" class="ml-2 text-white/70 hover:text-white p-1 rounded-lg text-base font-bold leading-none transition" aria-label="Dismiss">&times;</button>
  `;

  t.className = `fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 text-xs sm:text-sm font-semibold px-4 py-3 rounded-2xl shadow-2xl transition-all duration-300 flex items-center gap-2.5 max-w-sm ${isErr ? 'bg-red-600 text-white' : 'bg-navy-900 text-white border border-white/10'}`;
  t.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
  t.classList.add('opacity-100', 'pointer-events-auto');
  t.style.display = 'flex';
  t.style.opacity = '1';
  t.style.pointerEvents = 'auto';

  t._timer = setTimeout(() => {
    hideToast();
  }, 3500);
}

export function hideToast() {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(t._timer);
  t.style.opacity = '0';
  t.classList.remove('opacity-100', 'pointer-events-auto');
  t.classList.add('opacity-0', 'pointer-events-none');
  t.style.pointerEvents = 'none';
  t._hideTimer = setTimeout(() => {
    t.classList.add('hidden');
    t.style.display = 'none';
  }, 320);
}

if (typeof window !== 'undefined') {
  window.showToast = showToast;
  window.hideToast = hideToast;
}
export function debounce(fn, ms=300) {
  let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(()=> fn(...args), ms); };
}
