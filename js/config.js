// Nodaar config — reads from env, never hardcode secrets
// Vite: import.meta.env.VITE_...   |  Vanilla fallback: window.__ENV__ | localStorage

export const CONFIG = {
  SUPABASE_URL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL)
    || (typeof window !== 'undefined' && window.__ENV?.VITE_SUPABASE_URL)
    || localStorage.getItem('VITE_SUPABASE_URL')
    || 'https://xzrczuoxlujzmztkupbz.supabase.co', // fallback for preview only — rotate in prod

  SUPABASE_ANON_KEY: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY)
    || (typeof window !== 'undefined' && window.__ENV?.VITE_SUPABASE_ANON_KEY)
    || localStorage.getItem('VITE_SUPABASE_ANON_KEY')
    || 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN',

  APP_NAME: 'Nodaar Team Hub',
  ORG_EMAIL: 'hello@nodaar.com',
};

// Warn if still using fallback in production
if (!import.meta?.env?.VITE_SUPABASE_URL && location.hostname !== 'localhost' && !location.hostname.includes('127.0.0.1')) {
  console.warn('[Nodaar] Using fallback Supabase URL — set VITE_SUPABASE_URL in Vercel env vars');
}
