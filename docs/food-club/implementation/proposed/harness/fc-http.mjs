// Collaudo HTTP reale (GoTrue + PostgREST) dello stack Supabase LOCALE. Mai remoto.
const { createClient } = await import(process.cwd() + '/node_modules/@supabase/supabase-js/dist/index.mjs');
import { execFileSync } from 'node:child_process';
const URL = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!/^http:\/\/127\.0\.0\.1:/.test(URL)) throw new Error('solo locale');
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-AtX','-v','ON_ERROR_STOP=1','-c',q], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const results = []; const ok = (name, cond, extra='') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };
const errOf = (r) => r.error ? (r.error.message || r.error.code) : null;
const items = [{ item_id: 'item-009', quantity: 1 }, { item_id: 'item-010', quantity: 1 }];
const order = (c, lane, voucher = null, crid = crypto.randomUUID()) => c.rpc('kitchen_customer_create_order_v4', {
  p_venue_id: 'walrus-main', p_nickname: 'HTTP', p_customer_note: null, p_items: items, p_fulfillment_type: 'eat_here',
  p_payment_lane: lane, p_client_request_id: crid, p_pickup_slot: null, p_voucher_id: voucher });
const PHONE = '+393330000001';
sql(`delete from auth.users where phone in ('393330000001','393330000002')`);

// 0) anon (non loggato): campagna pubblica sì, tabelle no
const anonC = mk();
ok('anon: food_club_public_campaign', !errOf(await anonC.rpc('food_club_public_campaign', { p_venue_id: 'walrus-main' })));
const av = await anonC.from('food_club_vouchers').select('*');
ok('anon: niente SELECT su food_club_vouchers', !!av.error || av.data.length === 0, errOf(av) || `rows=${av.data?.length}`);

// 1) Club SPENTO (campagna inattiva): ordine normale v4 e v3 invariati
sql(`update food_club_campaigns set active=false`);
const A = mk(); const sa = await A.auth.signInAnonymously(); const uidA = sa.data.user.id;
let r = await order(A, 'counter');
ok('club spento: ordine normale v4 counter', !errOf(r) && r.data.discount_amount == 0, errOf(r) || `total=${r.data?.total}`);
r = await A.rpc('kitchen_customer_create_order_v3', { p_venue_id: 'walrus-main', p_nickname: 'HTTP3', p_customer_note: null, p_items: items, p_fulfillment_type: 'eat_here', p_payment_lane: 'online', p_client_request_id: crypto.randomUUID(), p_pickup_slot: null });
ok('club spento: ordine v3 (frontend attuale) invariato', !errOf(r) && r.data.status === 'pending_online_payment', errOf(r) || r.data?.status);
const orderA_anon = r.data?.id;
r = await A.rpc('food_club_my_state');
ok('club spento: my_state risponde', !errOf(r), errOf(r) || JSON.stringify(r.data).slice(0, 120));

// 2) Club ACCESO: anonimo -> phone_change OTP (test_otp) -> stesso uid
sql(`update food_club_campaigns set active=true where id='visite-v1'`);
r = await A.rpc('food_club_join', { p_terms_version: 'v1', p_service_consent: true, p_marketing_consent: false, p_display_name: null, p_referral_code: null });
ok('join senza telefono verificato: rifiutato', !!r.error, errOf(r));
r = await A.auth.updateUser({ phone: PHONE });
ok('updateUser(phone) da anonimo', !r.error, errOf(r));
r = await A.auth.verifyOtp({ phone: PHONE, token: '000000', type: 'phone_change' });
ok('OTP sbagliato rifiutato', !!r.error, errOf(r));
r = await A.auth.verifyOtp({ phone: PHONE, token: '123456', type: 'phone_change' });
ok('OTP phone_change: stesso uid', !r.error && r.data.user?.id === uidA, errOf(r) || `uid=${r.data.user?.id} anon=${r.data.user?.is_anonymous}`);
ok('dopo OTP: utente non più anonimo', r.data.user?.is_anonymous === false, `is_anonymous=${r.data.user?.is_anonymous}`);
r = await A.rpc('food_club_join', { p_terms_version: 'v1', p_service_consent: true, p_marketing_consent: false, p_display_name: 'Tester', p_referral_code: null });
ok('join con telefono verificato', !errOf(r), errOf(r) || JSON.stringify(r.data).slice(0, 100));
const vId = sql(`insert into food_club_vouchers (code,user_id,campaign_id,source,value,min_food,expires_at) values ('WC-HTTP1','${uidA}','visite-v1','manual',5,12,now()+interval '5 days') returning id`).split('\n')[0];
r = await A.rpc('food_club_my_state');
ok('my_state mostra il buono', !errOf(r) && JSON.stringify(r.data).includes(vId), errOf(r));
const mine = await A.from('food_club_vouchers').select('id');
ok('SELECT propri buoni via RLS', !mine.error && mine.data.length === 1, errOf(mine) || mine.data.length);
const upd = await A.from('food_club_vouchers').update({ status: 'available', value: 50 }).eq('id', vId).select();
ok('cliente non può modificare il buono', !!upd.error || upd.data.length === 0, errOf(upd) || `rows=${upd.data.length}`);

// 3) altro cliente B: abusi
const B = mk(); await B.auth.signInAnonymously();
r = await order(B, 'counter', vId);
ok('B usa il buono di A: voucher_not_found', /voucher_not_found/.test(errOf(r) || ''), errOf(r));
const bv = await B.from('food_club_vouchers').select('*');
ok('B non vede buoni di A', !bv.error && bv.data.length === 0, errOf(bv) || bv.data.length);
r = await B.rpc('food_club_award_order_stamp', { p_order_id: orderA_anon });
ok('B non può chiamare funzioni interne', !!r.error, errOf(r));
r = await B.rpc('food_club_staff_members', { p_venue_id: 'walrus-main', p_search: null, p_limit: 10 });
ok('B non può chiamare RPC staff', !!r.error, errOf(r));
const bo = await B.from('kitchen_orders').update({ total: 0.01 }).eq('id', orderA_anon).select();
ok('B non può toccare ordini di A', !!bo.error || bo.data.length === 0, errOf(bo) || bo.data.length);

// 4) A usa il buono: totale scontato lato server, doppio uso bloccato
const crid = crypto.randomUUID();
r = await order(A, 'online', vId, crid);
const o1 = r.data;
ok('ordine con buono: sconto lato server', !errOf(r) && Number(o1.discount_amount) === 5, errOf(r) || `total=${o1?.total} disc=${o1?.discount_amount}`);
r = await order(A, 'online', vId, crid);
ok('retry stesso client_request_id: stesso ordine', !errOf(r) && r.data.id === o1.id && Number(r.data.total) === Number(o1.total), errOf(r));
r = await order(A, 'counter', vId);
ok('secondo ordine con buono già riservato: rifiutato', /voucher_not_available/.test(errOf(r) || ''), errOf(r));
const t = await A.from('kitchen_orders').update({ total: 1, discount_amount: 0 }).eq('id', o1.id).select();
ok('cliente non può riscrivere il totale', !!t.error || t.data.length === 0, errOf(t) || t.data.length);
r = await A.rpc('kitchen_payment_attempt_start', { p_order_id: o1.id, p_channel: 'app', p_provider: 'sumup', p_method: 'sumup_online', p_amount: Number(o1.total) + 5, p_idempotency_key: crypto.randomUUID() });
ok('attempt SumUp con importo pieno (non scontato): rifiutato', !!r.error, errOf(r));

// 5) secondo dispositivo: anonimo C con un ordine -> biglietto -> login SMS -> ordini uniti
const C = mk(); await C.auth.signInAnonymously();
r = await order(C, 'counter'); const oC = r.data?.id;
r = await C.auth.updateUser({ phone: PHONE });
ok('C: numero già registrato -> phone_exists', /phone_exists|already been registered/i.test(errOf(r) || '') , errOf(r));
const tk = await C.rpc('food_club_create_merge_ticket', { p_phone: PHONE });
ok('C: biglietto di unione creato', !tk.error && !!tk.data, errOf(tk));
r = await C.auth.signInWithOtp({ phone: PHONE });
ok('C: signInWithOtp', !r.error, errOf(r));
r = await C.auth.verifyOtp({ phone: PHONE, token: '123456', type: 'sms' });
ok('C: login SMS = uid di A', !r.error && r.data.user?.id === uidA, errOf(r) || r.data.user?.id);
r = await C.rpc('food_club_redeem_merge_ticket', { p_token: tk.data });
ok('C: riscatto biglietto', !r.error, errOf(r) || JSON.stringify(r.data));
ok('ordine del dispositivo C passato ad A', sql(`select customer_id from kitchen_orders where id='${oC}'`) === uidA);
r = await C.rpc('food_club_redeem_merge_ticket', { p_token: tk.data });
ok('biglietto: replay stesso utente idempotente, nessun nuovo spostamento', !!r.error || r.data?.replay === true, errOf(r) || JSON.stringify(r.data));

// 6) staff: login reale, RPC staff con telefoni mascherati
const staffEmail = `staff-${Date.now()}@test.local`;
const S = mk(); r = await S.auth.signUp({ email: staffEmail, password: 'Passw0rd!x' });
const sid = r.data.user?.id; sql(`insert into kitchen_staff_members (user_id, venue_id, role) values ('${sid}','walrus-main','staff')`);
r = await S.rpc('food_club_staff_members', { p_venue_id: 'walrus-main', p_search: null, p_limit: 10 });
ok('staff: elenco membri', !r.error && Array.isArray(r.data), errOf(r));
ok('staff: telefono mascherato', !JSON.stringify(r.data).includes('3330000001'), JSON.stringify(r.data).slice(0, 160));
r = await S.rpc('food_club_admin_set_campaign_active', { p_campaign_id: 'visite-v1', p_active: false });
ok('staff non-manager: niente on/off campagna', !!r.error, errOf(r));
r = await S.rpc('kitchen_payment_record_counter', { p_order_id: o1.id, p_method: 'cash' });
ok('staff: incasso al banco bloccato se il pagamento online dello stesso ordine è in corso', /online_(payment_in_progress|order_paid_status_conflict)/.test(errOf(r) || ''), errOf(r) || `amount=${r.data?.amount}`);
ok('stato buono finale coerente', ['reserved','used'].includes(sql(`select status from food_club_vouchers where id='${vId}'`)), sql(`select status from food_club_vouchers where id='${vId}'`));

for (const [s, n, e] of results) console.log(`${s}  ${n}${e ? '  — ' + e : ''}`);
console.log(`TOTAL ${results.filter(x => x[0]==='PASS').length}/${results.length}`);
// 7) numero inserito ma OTP mai verificato: niente iscrizione
{
  const D = mk(); await D.auth.signInAnonymously();
  const u = await D.auth.updateUser({ phone: '+393330000002' });
  const j = await D.rpc('food_club_join', { p_terms_version: 'v1', p_service_consent: true, p_marketing_consent: false, p_display_name: null, p_referral_code: null });
  console.log(`${j.error ? 'PASS' : 'FAIL'}  telefono non verificato (Confirm phone ON): join rifiutato  — ${errOf(u) || 'updateUser ok'} / ${errOf(j)}`);
}
