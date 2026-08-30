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
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const checkoutId = req.body?.id;
  if (!checkoutId) {
    // Nothing usable in the payload (e.g. a sandbox test ping) — ack so SumUp doesn't retry forever.
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

  let checkout;
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
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

  const attemptId = checkout.checkout_reference;
  const status = checkout.status; // PENDING | PAID | FAILED | EXPIRED (SumUp Checkouts API)

  // Idempotent ledger insert. SumUp gives no per-delivery event id, so (checkout id + status) is
  // the dedup key here: a retried delivery for the same already-logged status is a no-op via the
  // ON CONFLICT in kitchen_payment_webhook_ingest, a genuine status change gets its own row.
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

  if (!attemptId) {
    console.warn('[kitchen-sumup-webhook] checkout has no checkout_reference, cannot resolve attempt', checkoutId);
    return res.status(200).json({ ok: true });
  }

  if (status !== 'PAID' && status !== 'FAILED' && status !== 'EXPIRED') {
    // PENDING or any other transitional status: nothing to resolve yet.
    return res.status(200).json({ ok: true });
  }

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, amount, provider, status')
    .eq('id', attemptId)
    .maybeSingle();

  if (attemptError || !attempt) {
    console.error('[kitchen-sumup-webhook] payment attempt not found for checkout_reference', attemptId, attemptError);
    return res.status(200).json({ ok: true }); // ack: nothing more we can do, avoid endless retries
  }

  if (attempt.status !== 'initiated' && attempt.status !== 'pending' && attempt.status !== 'failed') {
    // Already resolved terminally ('succeeded'/'cancelled') — a retried webhook delivery for a
    // status we already applied would otherwise hit invalid_attempt_status.
    // 'failed' is deliberately let through (LONG SESSION F, same-checkout retry): a SumUp checkout
    // that reported FAILED can still be retried by the customer with a different card and later
    // report PAID for the same checkout id — applySumupCheckoutResult/kitchen_payment_confirm
    // re-verify and gate the actual eligibility (provider='sumup' AND
    // failure_reason='sumup_failed' only), this handler does not need to duplicate that check.
    return res.status(200).json({ ok: true });
  }

  try {
    const result = await applySumupCheckoutResult(supabaseAdmin, attempt, { ...checkout, id: checkoutId });
    if (result.outcome === 'failed' && result.reason === 'amount_mismatch') {
      console.error('[kitchen-sumup-webhook] amount/provider mismatch, failing attempt instead of confirming', {
        attemptId, attemptAmount: attempt.amount, checkoutAmount: checkout.amount, provider: attempt.provider,
      });
    }
  } catch (err) {
    console.error('[kitchen-sumup-webhook] confirm/fail RPC failed', err);
    return res.status(500).json({ error: 'rpc_failed' });
  }

  return res.status(200).json({ ok: true });
}
