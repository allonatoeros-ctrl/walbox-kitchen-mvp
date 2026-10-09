import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './_lib/sumupProviderRefRecovery.js';

// Kitchen Payment Hub V1 — "Passa al pagamento al banco" per un checkout SumUp non concluso.
//
// Staff-facing dedicated endpoint, esplicito: lo staff conferma che il cliente vuole pagare al
// banco per un ordine il cui checkout SumUp online e' ancora aperto/non risolto. Riusa lo stesso
// scheletro auth/lookup/fail-closed-DELETE di api/kitchen-cancel-with-payment-check.js (vedi quel
// file per il design originale approvato da Eros) ma senza mai cancellare l'ordine: chiude solo
// l'attempt via la nuova RPC kitchen_payment_attempt_close_unpaid (migration
// 20260923100000_kitchen_payment_attempt_close_unpaid_v1.sql), lasciando l'ordine pronto per
// kitchen_payment_record_counter.
//
// Flow:
//   1. Lookup ordine + eventuale attempt charge da chiudere: 'initiated'/'pending' (checkout ancora
//      aperto), OPPURE 'failed' con provider='sumup' AND failure_reason='sumup_failed' (carta
//      rifiutata ma checkout ancora nella same-checkout retry window di F03,
//      20260913120000/20260830101227). Nessun attempt in questi stati -> nulla da chiudere, lo
//      staff puo' incassare direttamente al banco.
//   2. Attempt non-sumup (mai dovrebbe accadere: i canali counter/manual non restano
//      initiated/failed-sumup) -> nessuna verifica remota possibile, si chiude direttamente via RPC
//      (la RPC stessa e' l'autorita' finale sullo stato dell'attempt).
//   3. Attempt sumup -> **sempre** un GET autoritativo del checkout prima di sbloccare, anche se
//      l'attempt e' gia' 'failed' localmente (un webhook/reconcile puo' averlo capovolto in PAID
//      dopo l'ultimo check). PAID -> risolto via lo stesso resolver condiviso di webhook/reconcile
//      (applySumupCheckoutResult) e STOP: mai chiudere un attempt che ha realmente incassato.
//   4. SumUp conferma EXPIRED o CANCELLED -> il checkout non e' piu' pagabile (non riattivabile dal
//      cliente): nessun DELETE necessario, si procede direttamente alla chiusura (6).
//   5. Qualunque altro stato non pagato — **incluso FAILED** — e PENDING -> DELETE del checkout e
//      VERIFICA dell'esito con un GET successivo. FAILED NON e' terminale su SumUp: la hosted checkout
//      page lascia riprovare il cliente con un'altra carta sullo stesso checkout (assunto F03/Long
//      Session F, vedi api/_lib/sumupPaymentResolution.js), quindi chiudere solo localmente
//      permetterebbe un doppio incasso (online dopo il banco). Policy fail-closed:
//        - DELETE 5xx/errore di rete -> 502 sumup_delete_indeterminate, blocca;
//        - qualunque altra risposta al DELETE (2xx, 404, altri 4xx) NON e' una prova di chiusura: si
//          rilegge il checkout via GET. GET non verificabile -> blocca (outcome 'unknown'); PAID ->
//          risolto via resolver condiviso e STOP; EXPIRED/CANCELLED -> checkout davvero chiuso,
//          si procede; qualunque altro stato (PENDING/FAILED/...) -> checkout ancora potenzialmente
//          pagabile, blocca (outcome 'unknown', reason 'checkout_close_unverified').
//      "Blocca" = nessuna chiamata alla RPC di chiusura, nessun attempt marcato chiuso.
//   6. Chiusura atomica: kitchen_payment_attempt_close_unpaid marca/converte solo l'attempt come
//      failed/staff_closed_for_counter (mai l'ordine) — kitchen_payment_record_counter si sblocca
//      immediatamente dopo sullo stesso ordine, e l'attempt non e' piu' retry-eligible per un
//      webhook/reconcile tardivo sullo stesso checkout.
//
// Due Supabase client, stesso pattern di kitchen-cancel-with-payment-check.js: supabaseAdmin
// (service_role) per la chiave SumUp + lookup + il resolver condiviso; supabaseAsStaff (anon key +
// JWT del chiamante) per la RPC di chiusura, cosi' auth.uid()/is_staff_for_venue dentro
// kitchen_payment_attempt_close_unpaid risolvono al vero membro dello staff.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { order_id, note } = req.body || {};
  if (!order_id) {
    return res.status(400).json({ error: 'missing_order_id' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: 'missing_session' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-staff-sumup-close-for-counter] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'invalid_session' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, venue_id, payment_status, status')
    .eq('id', order_id)
    .maybeSingle();

  if (orderError) {
    console.error('[kitchen-staff-sumup-close-for-counter] order lookup failed', orderError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }

  // Acts as the calling staff member (their own JWT), not service_role — same pattern as
  // kitchen-cancel-with-payment-check.js / kitchen-staff-sumup-reconcile.js.
  const supabaseAsStaff = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: isStaff, error: staffCheckError } = await supabaseAsStaff.rpc('is_staff_for_venue', {
    p_venue_id: order.venue_id,
  });
  if (staffCheckError) {
    console.error('[kitchen-staff-sumup-close-for-counter] staff check failed', staffCheckError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!isStaff) {
    return res.status(403).json({ error: 'not_staff_for_venue' });
  }

  if (order.status === 'cancelled') {
    return res.status(409).json({ error: 'order_cancelled' });
  }

  // Stesso guard di kitchen_payment_record_counter: un ordine gia' pagato non ha nulla da chiudere
  // per il banco, indipendentemente dal canale che lo ha pagato.
  if (order.payment_status === 'paid') {
    return res.status(409).json({ error: 'order_already_paid' });
  }

  // 'initiated'/'pending' (checkout ancora aperto) OPPURE 'failed' nella stessa-checkout retry
  // window di F03 (provider='sumup' AND failure_reason='sumup_failed') — stesso predicato di
  // kitchen_payment_record_counter (20260913120000) e kitchen_payment_confirm (20260830101227),
  // letto qui a monte solo per decidere COSA verificare/chiudere; l'autorita' finale sullo stato
  // resta comunque il GET SumUp sotto + il lock della RPC.
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, venue_id, amount, provider, status, failure_reason, provider_ref')
    .eq('order_id', order_id)
    .eq('direction', 'charge')
    .in('status', ['initiated', 'pending', 'failed'])
    .or('status.neq.failed,and(provider.eq.sumup,failure_reason.eq.sumup_failed)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attemptError) {
    console.error('[kitchen-staff-sumup-close-for-counter] attempt lookup failed', attemptError);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  if (!attempt) {
    // Nessun checkout online in sospeso: nulla da chiudere, lo staff puo' incassare direttamente
    // via kitchen_payment_record_counter.
    return res.status(200).json({ outcome: 'no_pending_attempt' });
  }

  if (attempt.provider !== 'sumup') {
    // Non dovrebbe accadere in condizioni normali (i canali counter/manual non restano initiated),
    // ma niente da verificare da remoto: la RPC stessa e' l'autorita' finale sullo stato.
    return closeAttempt({ res, supabaseAsStaff, attemptId: attempt.id, note });
  }

  let providerRef = attempt.provider_ref;
  if (!providerRef) {
    const recovery = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id });
    if (!recovery.checkout) {
      // Mai indovinare: non possiamo verificare questo attempt contro SumUp, mai chiuderlo alla cieca.
      return res.status(200).json({
        outcome: 'unknown',
        needs_manual_reconciliation: recovery.reason === 'ambiguous',
      });
    }
    providerRef = recovery.checkout.id;
    await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
      p_attempt_id: attempt.id,
      p_provider_ref: providerRef,
    });
  }

  const checkout = await getSumupCheckout({ sumupApiKey, providerRef, attempt });
  if (checkout.outcome === 'unknown') {
    return res.status(200).json({ outcome: 'unknown' });
  }

  if (checkout.data.status === 'PAID') {
    return resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout: checkout.data });
  }

  if (checkout.data.status !== 'EXPIRED' && checkout.data.status !== 'CANCELLED') {
    // PENDING, FAILED o qualunque altro stato non terminale-irreversibile: il checkout puo' essere
    // ancora pagabile (FAILED incluso: retry con un'altra carta sulla stessa pagina hosted). DELETE
    // + verifica GET, fail-closed — la chiusura locale avviene solo se SumUp conferma
    // EXPIRED/CANCELLED dopo il DELETE.
    const deactivation = await deactivateAndVerify({ sumupApiKey, providerRef, attempt });
    if (deactivation.kind === 'indeterminate') {
      return res.status(502).json({ error: 'sumup_delete_indeterminate', retryable: true });
    }
    if (deactivation.kind === 'unknown') {
      return res.status(200).json({ outcome: 'unknown' });
    }
    if (deactivation.kind === 'paid') {
      return resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout: deactivation.data });
    }
    if (deactivation.kind === 'unverified') {
      return res.status(200).json({ outcome: 'unknown', reason: 'checkout_close_unverified' });
    }
    // deactivation.kind === 'closed': EXPIRED/CANCELLED confermato — la RPC ri-verifica lo stato
    // locale sotto lock come autorita' finale.
  }

  return closeAttempt({ res, supabaseAsStaff, attemptId: attempt.id, note });
}

// DELETE del checkout SumUp + verifica autoritativa dell'esito. Un esito del DELETE (anche 2xx/404)
// non prova da solo che il checkout sia chiuso: l'unica prova e' un GET successivo che riporta
// EXPIRED/CANCELLED. Ritorna: 'indeterminate' (5xx/rete sul DELETE), 'unknown' (GET di verifica non
// affidabile), 'paid' (+ data), 'closed' (EXPIRED/CANCELLED), 'unverified' (qualunque altro stato).
async function deactivateAndVerify({ sumupApiKey, providerRef, attempt }) {
  try {
    const delRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
    if (delRes.status >= 500) {
      console.error('[kitchen-staff-sumup-close-for-counter] SumUp DELETE checkout returned 5xx — fail-closed', delRes.status);
      return { kind: 'indeterminate' };
    }
  } catch (err) {
    console.error('[kitchen-staff-sumup-close-for-counter] SumUp DELETE checkout errored — fail-closed', err);
    return { kind: 'indeterminate' };
  }

  const verify = await getSumupCheckout({ sumupApiKey, providerRef, attempt });
  if (verify.outcome === 'unknown') {
    return { kind: 'unknown' };
  }
  if (verify.data.status === 'PAID') {
    return { kind: 'paid', data: verify.data };
  }
  if (verify.data.status === 'EXPIRED' || verify.data.status === 'CANCELLED') {
    return { kind: 'closed' };
  }
  console.error('[kitchen-staff-sumup-close-for-counter] checkout still not closed after DELETE — fail-closed', verify.data.status);
  return { kind: 'unverified' };
}

// Stessa logica difensiva di kitchen-cancel-with-payment-check.js / kitchen-staff-sumup-reconcile.js.
async function getSumupCheckout({ sumupApiKey, providerRef, attempt }) {
  let checkout;
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
    checkout = await sumupRes.json();
    if (!sumupRes.ok) {
      console.error('[kitchen-staff-sumup-close-for-counter] SumUp GET checkout failed', sumupRes.status, checkout);
      return { outcome: 'unknown' };
    }
  } catch (err) {
    console.error('[kitchen-staff-sumup-close-for-counter] unexpected error fetching checkout', err);
    return { outcome: 'unknown' };
  }

  if (checkout.checkout_reference !== attempt.id) {
    console.error('[kitchen-staff-sumup-close-for-counter] checkout_reference mismatch', {
      attemptId: attempt.id, expected: attempt.id, got: checkout.checkout_reference,
    });
    return { outcome: 'unknown' };
  }

  return { outcome: 'ok', data: checkout };
}

// PAID -> risolto via lo stesso resolver condiviso di webhook/reconcile/cancel-check e STOP: mai
// chiudere un attempt che ha realmente incassato online.
async function resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout }) {
  try {
    const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
    return res.status(409).json({ error: 'cannot_close_already_paid', outcome: result.outcome });
  } catch (err) {
    console.error('[kitchen-staff-sumup-close-for-counter] confirm RPC failed while resolving PAID checkout', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}

// Chiusura via la RPC dedicata, con il JWT del chiamante cosi' auth.uid()/is_staff_for_venue dentro
// kitchen_payment_attempt_close_unpaid risolvono correttamente.
async function closeAttempt({ res, supabaseAsStaff, attemptId, note }) {
  try {
    const { data, error } = await supabaseAsStaff.rpc('kitchen_payment_attempt_close_unpaid', {
      p_attempt_id: attemptId,
      p_note: note ?? null,
    });
    if (error) throw error;
    return res.status(200).json({ outcome: 'closed_for_counter', payment: data });
  } catch (err) {
    const code = err?.message || 'close_failed';
    if (code.includes('payment_attempt_already_succeeded')) {
      // Race: un webhook/reconcile ha confermato PAID tra la nostra verifica e il lock della RPC.
      // Mai forzare un secondo incasso: il chiamante deve fermarsi e riconciliare.
      return res.status(409).json({ error: 'cannot_close_already_paid', outcome: 'confirmed' });
    }
    if (code.includes('not_staff_for_venue')) {
      return res.status(403).json({ error: 'not_staff_for_venue' });
    }
    if (code.includes('payment_attempt_not_found')) {
      return res.status(404).json({ error: 'payment_attempt_not_found' });
    }
    if (code.includes('invalid_attempt_status')) {
      return res.status(409).json({ error: 'invalid_attempt_status' });
    }
    console.error('[kitchen-staff-sumup-close-for-counter] close RPC failed', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}
