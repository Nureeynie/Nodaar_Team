// Single Supabase client
import { CONFIG } from './config.js';

let client = null;
export function getSupabase() {
  if (client) return client;
  if (!window.supabase) throw new Error('Supabase JS not loaded — check <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">');
  client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return client;
}
