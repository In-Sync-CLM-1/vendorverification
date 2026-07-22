// Seeds one pending advance request for the demo vendor (Anita / Saffron Textiles)
// so the vendor portal's "Your Advance Requests" section isn't empty for the promo.
// Idempotent: skips if a pending request already exists for this vendor.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv(new URL('../.env', import.meta.url));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const VENDOR_ID = '419dc548-b8fa-4e8b-9594-d8b7e0534c88'; // Saffron Textiles Mills (Anita)

const { data: existing, error: exErr } = await sb
  .from('vendor_advance_requests')
  .select('id')
  .eq('vendor_id', VENDOR_ID)
  .eq('status', 'pending');
if (exErr) throw exErr;

if (existing?.length) {
  console.log('Pending advance request already exists:', existing[0].id);
} else {
  const { data, error } = await sb
    .from('vendor_advance_requests')
    .insert({
      vendor_id: VENDOR_ID,
      amount: 45000,
      activity_name: 'Raw material procurement — August production run',
      vendor_remarks: 'Need to place the yarn order this week to hold the mill slot.',
    })
    .select('id')
    .single();
  if (error) throw error;
  console.log('Created pending advance request:', data.id);
}
