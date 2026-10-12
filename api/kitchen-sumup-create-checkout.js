import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './_lib/sumupProviderRefRecovery.js';

// S0.5 F7: timeout applicativi sulle fetch SumUp. La lease DB della claim e 20 s: la POST di creazione
// non deve partire troppo tardi dopo la claim, altrimenti un retry concorrente potrebbe sovrapporsi.
const SUMUP_GET_TIMEOUT_MS = 5000;
const SUMUP_POST_TIMEOUT_MS = 8000;
const POST_START_DEADLINE_MS = 6000;

// Kitchen Payment Hub V1 — SumUp sandbox, create checkout.
//
// Server-side only: reads SUMUP_API_KEY / SUMUP_MERCHANT_CODE / SUPABASE_SERVICE_ROLE_KEY from
// process.env (never exposed to the client). Uses SumUp's Hosted Checkout (hosted_checkout.enabled)
// — the simplest officially supported integration for the Checkouts API: no card widget/SDK needed,
// SumUp returns hosted_checkout_url and the browser is redirected there directly.
//
// Never trusts amount/provider/method from the client: re-reads the payment attempt row (already
// created client-side via the customer's own session against RPC kitchen_payment_attempt_start,
// which validates amount = order.total) and only proceeds if it matches what the client claims.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { order_id, payment_attempt_id } = req.body || {};
  if (!order_id || !payment_attempt_id) {
    return res.status(400).json({ error: 'missing_order_id_or_payment_attempt_id' });
  }

  // S0.5 F4: possedere order_id/payment_attempt_id non e autorizzazione. Nessuna lettura/mutazione/
  // fetch SumUp prima di: caller autenticato -> proprietario dell'ordine -> attempt di quell'ordine.
  const authHeader = req.headers?.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: 'missing_session' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;
  const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey || !sumupMerchantCode) {
    console.error('[kitchen-sumup-create-checkout] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Identita del caller risolta server-side dal bearer token (mai da id forniti dal client).
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'invalid_session' });
  }
  const callerId = userData.user.id;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, customer_id, payment_status, total')
    .eq('id', order_id)
    .maybeSingle();

  if (orderError) {
    console.error('[kitchen-sumup-create-checkout] order lookup failed', orderError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }
  // Ownership PRIMA di qualsiasi lettura dell'attempt o informazione sullo stato di pagamento.
  if (!order.customer_id || order.customer_id !== callerId) {
    return res.status(403).json({ error: 'not_order_owner' });
  }

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, order_id, provider, method, amount, status, direction, provider_ref')
    .eq('id', payment_attempt_id)
    .maybeSingle();

  if (attemptError) {
    console.error('[kitchen-sumup-create-checkout] attempt lookup failed', attemptError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!attempt || attempt.order_id !== order_id) {
    return res.status(404).json({ error: 'payment_attempt_not_found' });
  }
  if (attempt.provider !== 'sumup' || attempt.method !== 'sumup_online') {
    return res.status(400).json({ error: 'not_a_sumup_attempt' });
  }
  if (attempt.direction !== 'charge' || attempt.status !== 'initiated') {
    return res.status(409).json({ error: 'invalid_attempt_status', status: attempt.status });
  }

  // Race guard (P1-2): attempt_start already checked order.payment_status once, but the order can
  // still get paid (e.g. cash at the counter) in the gap between that RPC call and this request.
  // Re-check server-side right before creating a real hosted checkout — never trust the client's
  // earlier attempt_start result as still true.
  if (order.payment_status === 'paid') {
    const { error: failError } = await supabaseAdmin.rpc('kitchen_payment_fail', {
      p_attempt_id: attempt.id,
      p_reason: 'order_already_paid_race',
      p_raw_payload: {},
    });
    if (failError) {
      console.error('[kitchen-sumup-create-checkout] failed to close race-orphaned attempt', failError);
    }
    return res.status(409).json({ error: 'order_already_paid' });
  }

  // S0.5 F1 (Amount Integrity): l'attempt e uno snapshot dell'importo; il totale autorevole e
  // kitchen_orders.total, riletto qui server-side. Se divergono, fail closed PRIMA di riusare o
  // creare qualsiasi checkout (nessun claim, nessuna fetch SumUp, nessun PATCH per "correggere").
  if (Number(attempt.amount) !== Number(order.total)) {
    console.error('[kitchen-sumup-create-checkout] attempt/order amount mismatch', {
      attemptId: attempt.id, attemptAmount: attempt.amount, orderTotal: order.total,
    });
    return res.status(409).json({ error: 'amount_mismatch' });
  }

  // S0.5 F5: gli URL inviati a SumUp derivano SOLO da VERCEL_PROJECT_PRODUCTION_URL (mai da Host /
  // X-Forwarded-*). Checkout reale solo in Production; altrove fail closed PRIMA di qualsiasi claim,
  // mutation o fetch SumUp (incluso il percorso di riuso con provider_ref).
  const productionOrigin = resolveProductionOrigin();
  if (!productionOrigin) {
    console.error('[kitchen-sumup-create-checkout] checkout not allowed: non-production env or invalid production url');
    return res.status(503).json({ error: 'checkout_origin_unavailable' });
  }

  // Duplicate live checkout guard (P0): an attempt that already has a provider_ref means a SumUp
  // checkout was already created for it — creating another one here would leave two live checkouts
  // sharing the same checkout_reference (=attempt.id), either of which could turn PAID and capture
  // money twice at the acquirer. Never create a new checkout in this branch: always re-verify the
  // EXISTING one authoritatively (GET, same pattern as api/kitchen-sumup-reconcile.js) and reuse or
  // resolve it via the shared applySumupCheckoutResult helper — same decision webhook/reconcile/sweep
  // already apply, no separate copy of that logic here.
  if (attempt.provider_ref) {
    return resolveExistingCheckout({ res, supabaseAdmin, attempt, sumupApiKey });
  }

  // No checkout created yet for this attempt: claim the "I create it" slot atomically before calling
  // SumUp. A plain application-level check-then-write here would race under a double-click or two
  // open tabs — two concurrent calls could both observe provider_ref IS NULL before either writes it.
  // The claim RPC's single conditional UPDATE is atomic at the DB level regardless of timing (see
  // supabase/migrations/20260830150000_kitchen_payment_attempt_claim_checkout_v1.sql).
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc('kitchen_payment_attempt_claim_checkout', {
    p_attempt_id: attempt.id,
  });
  if (claimError) {
    // S4: guardie S3 sull'ordine (abbandonato, o online oltre created_at + 4:30). Codici stabili, nessun checkout.
    const claimCode = claimError.message || '';
    for (const code of ['order_payment_abandoned', 'online_payment_expired']) {
      if (claimCode.includes(code)) return res.status(409).json({ error: code });
    }
    console.error('[kitchen-sumup-create-checkout] claim RPC failed', claimError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!claimed?.id) {
    // Lost the race: another concurrent call already owns checkout creation for this attempt (or
    // resolved it in the meantime). PostgREST serializes a NULL composite row (0 rows matched by
    // the claim UPDATE) as an object with every field null (e.g. { id: null, ... }), NOT bare JSON
    // null — a plain `!claimed` check is always false for that shape and would wrongly treat a lost
    // race as a win. Never create a second checkout — the winner's response already carries the
    // real hosted_checkout_url; the client can retry shortly and will then hit the
    // provider_ref-present reuse path above.
    return res.status(409).json({ error: 'checkout_creation_in_progress' });
  }

  // S0.5 F7: List-first. Dopo la claim e PRIMA di ogni POST, cerca per checkout_reference (= attempt.id)
  // un checkout gia creato da una request precedente rimasta in volo oltre la lease. Mai POST se il
  // lookup fallisce o e ambiguo: l'esito della create resterebbe sconosciuto.
  const claimedAt = Date.now();
  const lookup = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id, fetchImpl: sumupGetFetch });
  if (lookup.reason !== 'not_found') {
    return resolveLookupOutcome({ res, supabaseAdmin, attempt, sumupApiKey, lookup });
  }

  if (Date.now() - claimedAt > POST_START_DEADLINE_MS) {
    console.error('[kitchen-sumup-create-checkout] POST start deadline exceeded, create not attempted');
    return outcomeUnknown(res);
  }

  try {
    let sumupRes;
    try {
      sumupRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sumupApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_reference: attempt.id,
          amount: attempt.amount,
          currency: 'EUR',
          merchant_code: sumupMerchantCode,
          description: `Walrus Pub — ordine ${order_id}`,
          redirect_url: `${productionOrigin}/kitchen/status?orderId=${encodeURIComponent(order_id)}&sumup=return`,
          return_url: `${productionOrigin}/api/kitchen-sumup-webhook`,
          hosted_checkout: { enabled: true },
        }),
        signal: AbortSignal.timeout(SUMUP_POST_TIMEOUT_MS),
      });
    } catch (err) {
      // Timeout / errore di rete: SumUp potrebbe aver creato il checkout. UNKNOWN, mai FAILED.
      console.error('[kitchen-sumup-create-checkout] create checkout POST outcome unknown', err);
      return outcomeUnknown(res);
    }

    let sumupData = null;
    let bodyParsed = true;
    try {
      sumupData = await sumupRes.json();
    } catch {
      bodyParsed = false;
    }

    if (sumupRes.status >= 500) {
      console.error('[kitchen-sumup-create-checkout] SumUp 5xx on create, outcome unknown', sumupRes.status);
      return outcomeUnknown(res);
    }

    if (sumupRes.status === 409 && bodyParsed && sumupData?.error_code === 'DUPLICATED_CHECKOUT') {
      // Il checkout esiste gia: recupero via List, mai una seconda POST nella stessa request.
      const dup = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id, fetchImpl: sumupGetFetch });
      return resolveLookupOutcome({ res, supabaseAdmin, attempt, sumupApiKey, lookup: dup });
    }

    if (!sumupRes.ok) {
      console.error('[kitchen-sumup-create-checkout] SumUp API error', sumupRes.status, sumupData);
      if (DOCUMENTED_CREATE_ERROR_STATUSES.has(sumupRes.status)) {
        return res.status(502).json({ error: 'sumup_create_checkout_failed' });
      }
      // 4xx non previsto dal contratto: non implica "checkout sicuramente non creato".
      return outcomeUnknown(res);
    }

    if (!bodyParsed) {
      console.error('[kitchen-sumup-create-checkout] 2xx create response with unparsable body, outcome unknown');
      return outcomeUnknown(res);
    }

    // S0.5 F7 (G4): appena l'id SumUp e noto, persisti provider_ref PRIMA di controllare l'URL, cosi un
    // retry futuro entra nel ramo di riuso invece di creare un secondo checkout. Best-effort: un
    // fallimento qui degrada la reconciliation a UNKNOWN (sicuro), non blocca il redirect.
    if (sumupData?.id) {
      const { error: refError } = await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
        p_attempt_id: attempt.id,
        p_provider_ref: sumupData.id,
      });
      if (refError) {
        console.warn('[kitchen-sumup-create-checkout] failed to persist provider_ref', refError);
      }
    }

    if (!sumupData?.hosted_checkout_url) {
      console.error('[kitchen-sumup-create-checkout] missing hosted_checkout_url in SumUp response');
      return res.status(502).json({ error: 'sumup_create_checkout_failed' });
    }

    return res.status(200).json({
      checkout_id: sumupData.id,
      hosted_checkout_url: sumupData.hosted_checkout_url,
    });
  } catch (err) {
    console.error('[kitchen-sumup-create-checkout] unexpected error', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}

// Fetch con timeout GET, iniettata nell'helper di recovery (List-by-checkout_reference).
function sumupGetFetch(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(SUMUP_GET_TIMEOUT_MS) });
}

// 4xx documentati e gia gestiti dal contratto corrente (failure HTTP esplicito).
const DOCUMENTED_CREATE_ERROR_STATUSES = new Set([400, 401, 403]);

// S0.5 F7: l'esito della create e sconosciuto. Attempt lasciato recuperabile (nessun kitchen_payment_fail).
function outcomeUnknown(res) {
  return res.status(503).json({ error: 'checkout_outcome_unknown', retryable: true });
}

// S0.5 F7: esito di List-by-checkout_reference (dopo claim o dopo 409 DUPLICATED_CHECKOUT).
// 1 match -> lega provider_ref e passa al ramo di riuso/verifica; ambiguous -> riconciliazione
// manuale; not_found/lookup_failed -> UNKNOWN. In nessun caso crea un checkout.
async function resolveLookupOutcome({ res, supabaseAdmin, attempt, sumupApiKey, lookup }) {
  if (lookup.reason === 'ambiguous') {
    console.error('[kitchen-sumup-create-checkout] ambiguous checkout_reference lookup', { attemptId: attempt.id });
    return res.status(409).json({ error: 'needs_manual_reconciliation' });
  }
  const foundId = lookup.checkout?.id;
  if (lookup.reason || typeof foundId !== 'string' || !foundId) {
    return outcomeUnknown(res);
  }
  const { error: refError } = await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
    p_attempt_id: attempt.id,
    p_provider_ref: foundId,
  });
  if (refError) {
    console.error('[kitchen-sumup-create-checkout] failed to bind recovered provider_ref', refError);
    return outcomeUnknown(res);
  }
  return resolveExistingCheckout({ res, supabaseAdmin, attempt: { ...attempt, provider_ref: foundId }, sumupApiKey });
}

// S0.5 F5: unica authority per gli URL SumUp. Ritorna `https://<hostname>` oppure null (fail closed)
// se l'ambiente non e Production o VERCEL_PROJECT_PRODUCTION_URL manca / non e un hostname singolo.
function resolveProductionOrigin() {
  if (process.env.VERCEL_ENV !== 'production') return null;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (typeof host !== 'string' || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) {
    return null;
  }
  return `https://${host.toLowerCase()}`;
}

// Re-verifies an attempt that already has a live SumUp checkout (provider_ref set) instead of ever
// creating a second one. Mirrors api/kitchen-sumup-reconcile.js's authoritative-GET + shared
// applySumupCheckoutResult pattern — same decision, no separate copy of the resolution logic.
async function resolveExistingCheckout({ res, supabaseAdmin, attempt, sumupApiKey }) {
  let checkout;
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${attempt.provider_ref}`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
      signal: AbortSignal.timeout(SUMUP_GET_TIMEOUT_MS),
    });
    checkout = await sumupRes.json();
    if (!sumupRes.ok) {
      console.error('[kitchen-sumup-create-checkout] SumUp GET checkout failed', sumupRes.status, checkout);
      return res.status(502).json({ error: 'sumup_verify_failed' });
    }
  } catch (err) {
    console.error('[kitchen-sumup-create-checkout] unexpected error fetching existing checkout', err);
    return res.status(502).json({ error: 'sumup_verify_failed' });
  }

  if (checkout.checkout_reference !== attempt.id) {
    // Never reuse/resolve on an unverified reference — same defensive check as reconcile.js.
    console.error('[kitchen-sumup-create-checkout] checkout_reference mismatch', {
      attemptId: attempt.id, providerRef: attempt.provider_ref, got: checkout.checkout_reference,
    });
    return res.status(409).json({ error: 'checkout_reference_mismatch' });
  }

  let result;
  try {
    result = await applySumupCheckoutResult(supabaseAdmin, attempt, { ...checkout, id: attempt.provider_ref });
  } catch (err) {
    console.error('[kitchen-sumup-create-checkout] confirm/fail RPC failed', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  if (result.outcome === 'confirmed') {
    return res.status(409).json({ error: 'order_already_paid' });
  }

  if (result.outcome === 'already_resolved') {
    // Resolved by a concurrent webhook/reconcile call in the gap between our lookup and this check —
    // never hand out a checkout_id/URL for an attempt whose real outcome we haven't just re-read.
    return res.status(409).json({ error: 'attempt_already_resolved' });
  }

  if (result.outcome === 'failed' && result.reason !== 'failed') {
    // EXPIRED/CANCELLED/amount_mismatch: this checkout is genuinely terminal, never reusable.
    // kitchen_payment_attempt_start does not block a new attempt for these reasons (LONG SESSION F,
    // 20260830130000), so the client gets a fresh attempt id there and a normal create-checkout call
    // on that new attempt takes the provider_ref-NULL path above — never a new checkout from here.
    return res.status(409).json({ error: 'attempt_no_longer_valid', reason: result.reason });
  }

  // result.outcome is 'pending', or 'failed' with reason 'failed' (SumUp FAILED — the same-checkout
  // retry case: SumUp does not invalidate a declined checkout, the customer can retry with a
  // different card on the SAME hosted checkout page). Both reuse the existing checkout — never
  // create a new one — but only if SumUp's own GET response still carries hosted_checkout_url: never
  // guess/reconstruct that URL (Eros decision, Gate 2; confirmed available on GET per SumUp's API
  // reference — https://developer.sumup.com/api/checkouts/retrieve — but fail closed if absent).
  if (checkout.hosted_checkout_url) {
    return res.status(200).json({
      checkout_id: attempt.provider_ref,
      hosted_checkout_url: checkout.hosted_checkout_url,
    });
  }

  return res.status(409).json({ error: 'checkout_retry_unavailable' });
}
