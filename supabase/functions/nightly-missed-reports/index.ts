// Nightly job (PRD 12.4): record missed daily reports as score 0,
// skipping non-working days and approved leave.
// Deploy: supabase functions deploy nightly-missed-reports
// Schedule: Supabase Dashboard → Database → Cron, or:
//   select cron.schedule('nightly-missed-reports','30 0 * * *','select public.record_missed_daily_reports()');
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { error } = await admin.rpc('record_missed_daily_reports');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, ran_at: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } });
});
