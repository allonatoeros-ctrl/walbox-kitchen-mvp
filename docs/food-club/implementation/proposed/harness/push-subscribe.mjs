const { createClient } = await import(process.cwd() + '/node_modules/@supabase/supabase-js/dist/index.mjs');
import { readFileSync } from 'node:fs';
const ua = JSON.parse(readFileSync(process.argv[2] + '/ua.json', 'utf8'));
const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await c.auth.signInWithOtp({ phone: '+393330000003' });
const v = await c.auth.verifyOtp({ phone: '+393330000003', token: '123456', type: 'sms' });
console.log('login', v.error?.message || v.data.user.id);
for (const ep of ['http://172.18.0.1:8899/ok/1', 'http://172.18.0.1:8899/gone/1']) {
  const r = await c.rpc('food_club_push_subscribe', { p_venue_id: 'walrus-main', p_endpoint: ep, p_p256dh: ua.p256dh, p_auth_key: ua.auth, p_user_agent: 'test', p_scope: 'club', p_text_version: 'v1' });
  console.log('subscribe', ep, r.error?.message || JSON.stringify(r.data));
}
