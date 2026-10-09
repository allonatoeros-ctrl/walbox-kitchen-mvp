import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';

// Kitchen Payment Hub V1 — SumUp sandbox, webhook receiver.
//
// SumUp does not sign webhook calls (no HMAC secret to verify — confirmed against SumUp's own
// webhook docs: "your application must always verify if the event really took place, by calling
// a relevant SumUp API"). So the incoming payload ({ event_type, id }) is never trusted for anything
// beyond "which checkout id to re-check" — the authoritative status/amount/reference always comes
// from GET /v0.1/checkouts/{id} using our own server-side SUMUP_API_KEY.
//
// Server-side only: SUMUP_API_KEY / SUPABASE_SERVICE_ROLE_KEY read from process.env, never exposed
// to the client. Only calls the Payment Hub V1 RPCs (webhook_ingest, confirm, fail) — no direct
// UPDATE/INSERT on kitchen_orders/kitchen_payments from here.
const MAX_CHECKOUT_ID_LENGTH = 128;

// Shape guard only (not a UUID contract): rejects non-strings, empty/whitespace, over-long input,
// control chars, whitespace, path/query/fragment/escape characters ( / \ ? # % ) and dot-segments.
function isSafeCheckoutId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > MAX_CHECKOUT_ID_LENGTH) return false;
  if (id.trim() !== id) return false;
  if (/[\u0000-\u0020\u007f-\u009f/\\?#%]/.test(id)) return false;
  if (id.includes('..') || id === '.') return false;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const rawId = req.body?.id;
  if (rawId === undefined || rawId === null || rawId === '') {
    // Nothing usable in the payload (e.g. a sandbox test ping) — ack so SumUp doesn't retry forever.
    return res.status(200).json({ ok: true });
  }

  // F6: the public payload is never allowed to steer the authenticated SumUp GET. Shape check only
  // (SumUp documents checkout_id as a plain string, so no UUID-only contract); malformed or
  // path-confusing input is acked with zero side effects (no DB, no SumUp, no ledger).
  if (!isSafeCheckoutId(rawId)) {
    console.warn('[kitchen-sumup-webhook] rejected malformed checkout id');
    return res.status(200).json({ ok: true });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-sumup-webhook] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // F6 DB-FIRST BINDING: only a checkout already recorded by Walbox on a SumUp charge attempt
  // (provider_ref set by create-checkout) may trigger a SumUp GET. Unknown id => ack, 0 fetch.
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, order_id, amount, provider, status, provider_ref, direction')
    .eq('provider', 'sumup')
    .eq('direction', 'charge')
    .eq('provider_ref', rawId)
    .maybeSingle();

  if (attemptError) {
    // Technical lookup failure (not "unknown id"): non-2xx so SumUp retries the delivery.
    console.error('[kitchen-sumup-webhook] attempt lookup failed', attemptError);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  if (!attempt) {
    console.warn('[kitchen-sumup-webhook] no SumUp attempt bound to webhook checkout id, ignoring');
    return res.status(200).json({ ok: true }); // ack: unknown id, avoid endless retries
  }

  if (
    attempt.provider !== 'sumup'
    || (attempt.direction !== undefined && attempt.direction !== 'charge')
    || attempt.provider_ref !== rawId
    || !isSafeCheckoutId(attempt.provider_ref)
  ) {
    console.error('[kitchen-sumup-webhook] attempt/provider binding invalid, ignoring', { attemptId: attempt.id });
    return res.status(200).json({ ok: true });
  }

  if (attempt.status !== 'initiated' && attempt.status !== 'pending' && attempt.status !== 'failed') {
    // Already resolved terminally ('succeeded'/'cancelled') — a retried webhook delivery for a
    // status we already applied would otherwise hit invalid_attempt_status. No SumUp GET needed.
    // 'failed' is deliberately let through (LONG SESSION F, same-checkout retry): a SumUp checkout
    // that reported FAILED can still be retried by the customer with a different card and later
    // report PAID for the same checkout id — applySumupCheckoutResult/kitchen_payment_confirm
    // re-verify and gate the actual eligibility (provider='sumup' AND
    // failure_reason='sumup_failed' only), this handler does not need to duplicate that check.
    return res.status(200).json({ ok: true });
  }

  // Trusted id: the provider_ref stored in the DB, never the raw payload string.
  const checkoutId = attempt.provider_ref;

  let checkout;
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
    checkout = await sumupRes.json();
    if (!sumupRes.ok) {
      console.error('[kitchen-sumup-webhook] SumUp GET checkout failed', sumupRes.status, checkout);
      return res.status(502).json({ error: 'sumup_verify_failed' });
    }
  } catch (err) {
    console.error('[kitchen-sumup-webhook] unexpected error fetching checkout', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  // F6 POST-GET BINDING: the authoritative response must describe exactly the checkout/attempt we
  // looked up. Mismatch => no ledger row, no confirm/fail, no provider_ref write.
  if (!checkout || checkout.id !== checkoutId || checkout.checkout_reference !== attempt.id) {
    console.error('[kitchen-sumup-webhook] checkout response does not match bound attempt, ignoring', {
      attemptId: attempt.id,
    });
    return res.status(200).json({ ok: true });
  }

  const attemptId = attempt.id;
  const status = checkout.status; // PENDING | PAID | FAILED | EXPIRED (SumUp Checkouts API)

  // Idempotent ledger insert (only after input, DB and response binding all hold). SumUp gives no
  // per-delivery event id, so (checkout id + status) is the dedup key here: a retried delivery for
  // the same already-logged status is a no-op via the ON CONFLICT in kitchen_payment_webhook_ingest,
  // a genuine status change gets its own row.
  const { error: ingestError } = await supabaseAdmin.rpc('kitchen_payment_webhook_ingest', {
    p_provider: 'sumup',
    p_provider_event_id: `${checkoutId}:${status}`,
    p_signature_verified: true, // "verified" = fetched authoritatively via our own GET call, not the raw POST body
    p_raw_payload: checkout,
  });

  if (ingestError) {
    console.error('[kitchen-sumup-webhook] webhook_ingest RPC failed', ingestError);
    return res.status(500).json({ error: 'webhook_ingest_failed' });
  }

  if (status !== 'PAID' && status !== 'FAILED' && status !== 'EXPIRED') {
    // PENDING or any other transitional status: nothing to resolve yet.
    return res.status(200).json({ ok: true });
  }

  try {
    const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
    if (result.outcome === 'failed' && result.reason === 'amount_mismatch') {
      console.error('[kitchen-sumup-webhook] amount/provider mismatch, failing attempt instead of confirming', {
        attemptId, attemptAmount: attempt.amount, checkoutAmount: checkout.amount, provider: attempt.provider,
      });
    }
    if (result.outcome === 'lost_race') {
      // F03: SumUp really captured money on this checkout, but a counter payment already won the
      // one-succeeded-charge-per-order slot — logged server-side (kitchen_action_log,
      // 'payment_confirm_lost_race') by the RPC itself; surface it here too so it is not silent in
      // this process's own logs.
      console.error('[kitchen-sumup-webhook] SumUp confirmed PAID but lost the succeeded-charge race — needs manual reconciliation', {
        attemptId, orderId: attempt.order_id, winningPaymentId: result.winning_payment_id,
      });
    }
  } catch (err) {
    console.error('[kitchen-sumup-webhook] confirm/fail RPC failed', err);
    return res.status(500).json({ error: 'rpc_failed' });
  }

  return res.status(200).json({ ok: true });
}
