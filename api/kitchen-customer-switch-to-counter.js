import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';
import { closeSumupAttempt } from './_lib/sumupCloseAttempt.js';

const LOG_TAG = 'kitchen-customer-switch-to-counter';

// S4 (docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md) — "Paga al banco" scelto dal CLIENTE su un ordine online in attesa (POP).
//
// Stessa matrice fail-closed di api/kitchen-staff-sumup-close-for-counter.js (F2), ma:
//   - auth = Bearer del cliente + proprieta' dell'ordine (mai id forniti dal client);
//   - vale per OGNI attempt vivo dell'ordine (initiated/pending, o failed/sumup_failed ancora ritentabile);
//   - la scrittura finale e' la RPC service role kitchen_order_switch_to_counter_system (S3): attempt vivi ->
//     failed/customer_switched_to_counter, ordine POP -> PCP con online_payment_disabled=true, log.
//
// Per ogni attempt sumup: recupero del riferimento (List per checkout_reference, logica I-3 per i claim senza
// provider_ref) -> GET verificato -> PAID: confirm (POP -> received) e STOP, mai il banco su soldi gia' presi ->
// EXPIRED/CANCELLED: gia' chiuso -> altro: DELETE + GET di verifica. Qualunque incertezza -> 409
// switch_to_counter_uncertain (retryable), nessuna scrittura. Lo switch parte solo se TUTTI gli attempt sono chiusi.
// Doppio tap: un ordine gia' passato al banco risponde 200 senza toccare SumUp; la RPC stessa e' idempotente e
// rifiuta (checkout_claim_in_progress) se un checkout sta nascendo proprio ora.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { order_id } = req.body || {};
  if (!order_id) {
    return res.status(400).json({ error: 'missing_order_id' });
  }

  const authHeader = req.headers?.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: 'missing_session' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    console.error(`[${LOG_TAG}] missing required env vars`);
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'invalid_session' });
  }
  const callerId = userData.user.id;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, customer_id, status, payment_status, online_payment_disabled')
    .eq('id', order_id)
    .maybeSingle();

  if (orderError) {
    console.error(`[${LOG_TAG}] order lookup failed`, orderError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }
  // Proprieta' PRIMA di qualsiasi informazione sullo stato o chiamata SumUp.
  if (!order.customer_id || order.customer_id !== callerId) {
    return res.status(403).json({ error: 'not_order_owner' });
  }

  // Idempotente: gia' passato al banco da questo flusso (doppio tap su "Paga al banco").
  if (order.status === 'pending_counter_payment' && order.online_payment_disabled === true) {
    return res.status(200).json({ outcome: 'switched_to_counter' });
  }
  if (order.payment_status === 'paid') {
    return res.status(409).json({ error: 'order_already_paid' });
  }
  if (order.status === 'cancelled') {
    return res.status(409).json({ error: 'order_cancelled' });
  }
  if (order.status === 'payment_abandoned') {
    return res.status(409).json({ error: 'order_payment_abandoned' });
  }
  if (order.status !== 'pending_online_payment') {
    return res.status(409).json({ error: 'order_not_pending_online_payment' });
  }

  // Stesso predicato "attempt vivo" di attempt_start e della RPC switch: initiated/pending, oppure failed ancora
  // nella same-checkout retry window (provider sumup + sumup_failed).
  const { data: attempts, error: attemptsError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, amount, provider, status, failure_reason, provider_ref, checkout_claim_at')
    .eq('order_id', order_id)
    .eq('direction', 'charge')
    .in('status', ['initiated', 'pending', 'failed'])
    .or('status.neq.failed,and(provider.eq.sumup,failure_reason.eq.sumup_failed)')
    .order('created_at', { ascending: false });

  if (attemptsError) {
    console.error(`[${LOG_TAG}] attempts lookup failed`, attemptsError);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  for (const attempt of attempts || []) {
    // Canali non SumUp: nessuna verifica remota possibile, la RPC e' l'autorita' finale.
    if (attempt.provider !== 'sumup') continue;

    const closed = await closeSumupAttempt({ supabaseAdmin, sumupApiKey, attempt, logTag: LOG_TAG });
    if (closed.kind === 'paid') {
      return resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout: closed.data });
    }
    if (closed.kind !== 'closed') {
      return uncertain(res, closed);
    }
  }

  return runSwitch({ res, supabaseAdmin, order_id, callerId });
}

function uncertain(res, { reason, needs_manual_reconciliation }) {
  const body = { error: 'switch_to_counter_uncertain', retryable: true, reason };
  if (needs_manual_reconciliation) body.needs_manual_reconciliation = true;
  return res.status(409).json(body);
}

// PAID -> confirm via il resolver condiviso (su POP: ordine -> received) e STOP: mai mandare al banco un ordine
// gia' pagato online.
async function resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout }) {
  try {
    const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
    if (result.outcome === 'confirmed') {
      return res.status(409).json({ error: 'order_already_paid', outcome: result.outcome });
    }
    // lost_race / amount_mismatch: soldi presi su SumUp ma non registrati come pagamento dell'ordine. Mai il
    // banco sopra: resta incerto, riconciliazione manuale (log gia' scritto dalle RPC).
    console.error(`[${LOG_TAG}] PAID checkout not confirmed as order payment`, { attemptId: attempt.id, outcome: result.outcome });
    return res.status(409).json({
      error: 'switch_to_counter_uncertain', retryable: false, reason: 'paid_needs_reconciliation', outcome: result.outcome,
    });
  } catch (err) {
    console.error(`[${LOG_TAG}] confirm RPC failed while resolving PAID checkout`, err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}

async function runSwitch({ res, supabaseAdmin, order_id, callerId }) {
  try {
    const { data, error } = await supabaseAdmin.rpc('kitchen_order_switch_to_counter_system', {
      p_order_id: order_id,
      p_actor_customer_id: callerId,
    });
    if (error) throw error;
    return res.status(200).json({ outcome: 'switched_to_counter', order_status: data?.status ?? null });
  } catch (err) {
    const code = err?.message || '';
    if (code.includes('checkout_claim_in_progress')) {
      // Un checkout sta nascendo adesso (claim < 20 s): il cliente riprova tra poco.
      return res.status(409).json({ error: 'switch_to_counter_uncertain', retryable: true, reason: 'checkout_claim_in_progress' });
    }
    if (code.includes('order_has_succeeded_charge')) {
      return res.status(409).json({ error: 'order_already_paid' });
    }
    if (code.includes('order_not_pending_online_payment')) {
      return res.status(409).json({ error: 'order_not_pending_online_payment' });
    }
    if (code.includes('not_order_owner')) {
      return res.status(403).json({ error: 'not_order_owner' });
    }
    if (code.includes('order_not_found')) {
      return res.status(404).json({ error: 'order_not_found' });
    }
    console.error(`[${LOG_TAG}] switch RPC failed`, err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}
