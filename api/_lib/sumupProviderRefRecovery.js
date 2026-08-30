// Kitchen Payment Hub V1 — SumUp Online — Autonomous Reconciliation + Refund — FASE 2.
//
// provider_ref recovery: an attempt can be stuck 'initiated'/'pending' with no provider_ref when
// api/kitchen-sumup-create-checkout.js reached SumUp but the best-effort
// kitchen_payment_attempt_set_provider_ref write failed (or never ran because the process crashed
// between the two calls). Without a provider_ref, neither the on-demand reconcile endpoint nor the
// autonomous sweep has anything to GET by id.
//
// Recovery uses the SAME already-integrated SumUp Checkouts API, no new credential/scope: SumUp
// supports listing checkouts filtered by checkout_reference (GET /v0.1/checkouts?checkout_reference=),
// and create-checkout always sets checkout_reference = attempt.id. So the attempt's own id is enough
// to look the checkout back up even with provider_ref missing.
//
// Fails closed, never guesses: zero matches (checkout truly never created at SumUp) or more than one
// match (should never happen given checkout_reference is set to the attempt's own uuid, but if it
// ever does, the mapping is not guaranteed) both return null — caller must treat this exactly like a
// lookup failure (UNKNOWN, blocking, no retry, no auto-resolution).

export async function recoverSumupProviderRef({ sumupApiKey, attemptId, fetchImpl = fetch }) {
  let res;
  let list;
  try {
    res = await fetchImpl(
      `https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(attemptId)}`,
      { headers: { Authorization: `Bearer ${sumupApiKey}` } }
    );
    list = await res.json();
  } catch {
    return { checkout: null, reason: 'lookup_failed' };
  }

  if (!res.ok || !Array.isArray(list)) {
    return { checkout: null, reason: 'lookup_failed' };
  }

  const matches = list.filter((c) => c.checkout_reference === attemptId);

  if (matches.length === 0) {
    return { checkout: null, reason: 'not_found' };
  }
  if (matches.length > 1) {
    // Never inventare un mapping non garantito: ambiguous, staff must reconcile manually.
    return { checkout: null, reason: 'ambiguous' };
  }
  return { checkout: matches[0], reason: null };
}
