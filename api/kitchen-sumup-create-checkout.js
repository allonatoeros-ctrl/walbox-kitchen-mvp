import { createClient } from '@supabase/supabase-js';

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;
  const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey || !sumupMerchantCode) {
    console.error('[kitchen-sumup-create-checkout] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, order_id, provider, method, amount, status, direction')
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

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;

  try {
    const sumupRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
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
        redirect_url: `${baseUrl}/kitchen/status?orderId=${encodeURIComponent(order_id)}&sumup=return`,
        return_url: `${baseUrl}/api/kitchen-sumup-webhook`,
        hosted_checkout: { enabled: true },
      }),
    });

    const sumupData = await sumupRes.json();

    if (!sumupRes.ok) {
      console.error('[kitchen-sumup-create-checkout] SumUp API error', sumupRes.status, sumupData);
      return res.status(502).json({ error: 'sumup_create_checkout_failed' });
    }
    if (!sumupData.hosted_checkout_url) {
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
