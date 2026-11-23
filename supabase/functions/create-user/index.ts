// Supabase Edge Function: create a PRE-CONFIRMED team user (service role).
// Deploy:  supabase functions deploy create-user
// Secret required:  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
// (get it from Supabase Dashboard → Settings → API → service_role key — keep it secret!)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { email, password, full_name, role, role_id, access_level } = await req.json();
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // bypasses email confirmation
    );
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, // <-- instantly signable
      user_metadata: { full_name, role, access_level },
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (data.user) {
      await admin.from('profiles').upsert({
        id: data.user.id, email, full_name, role: role || 'Member', role_id: role_id || null, access_level: access_level || 'Member',
      });
    }
    return new Response(JSON.stringify({ ok: true, user: data.user }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
