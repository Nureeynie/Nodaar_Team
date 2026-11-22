// Nodaar Team Hub — Improved App Entry (modular wrapper)
// This file replaces the hardcoded SB_URL/SB_KEY with env config and adds guards.

import { CONFIG } from './config.js';
import { getSupabase } from './supabase.js';
import { escapeHtml, loadingHTML, showToast } from './utils.js';

// Re-export for legacy app.js compatibility (so old code that expects globals still works)
window.escapeHtml = escapeHtml;
window.loadingHTML = loadingHTML;
window.showToast = showToast;
window.CONFIG = CONFIG;

// Patch: Inject config into legacy app.js expectation
// Legacy app.js did: const SB_URL = 'https://...' ; const SB_KEY = 'sb_publishable_...'
// We override with env.
if (typeof window !== 'undefined') {
  // Will be read by legacy app.js if it checks window.SB_URL
  window.SB_URL = CONFIG.SUPABASE_URL;
  window.SB_KEY = CONFIG.SUPABASE_ANON_KEY;
  console.info('[Nodaar] Supabase configured via env:', CONFIG.SUPABASE_URL);
}

// Lazy load legacy app after config is ready
// In Vite build, we bundle everything; in preview, we load app.js as module
export async function initApp() {
  // Ensure Supabase client is initialized
  const sb = getSupabase();
  // Expose for debugging (remove in prod)
  window.sbClient = sb;
  window.getSupabase = getSupabase;

  // Offline banner
  const offlineBanner = document.createElement('div');
  offlineBanner.id = 'offline-banner';
  offlineBanner.className = 'hidden fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-xs font-bold text-center py-2';
  offlineBanner.textContent = '⚠️ You are offline — changes will sync when back online';
  document.body.prepend(offlineBanner);
  window.addEventListener('online', () => offlineBanner.classList.add('hidden'));
  window.addEventListener('offline', () => offlineBanner.classList.remove('hidden'));

  // Now load the main legacy logic (if not already loaded)
  // We dynamically import the original app.js (which is still global script)
  // For improved version, you will gradually migrate functions to js/modules/*
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
