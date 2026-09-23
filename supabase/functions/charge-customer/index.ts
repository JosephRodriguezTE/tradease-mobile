// charge-customer/index.ts
// Called when a customer approves a work order OR by the auto-approve cron job.
// Creates a PaymentIntent against the customer's saved card, transfers the
// contractor payout to their Connect account, and marks the work order paid.
// verify_jwt: false because it's called by the auto-approve cron (no user JWT).
// Protected by the internal secret header.
//
// NOT WIRED TO ANYTHING YET. Nothing in either app calls this function --
// see docs/PAYMENT_LAUNCH_BLOCKER.md. It still needs: contractors.stripe_account_id
// populated somewhere (Connect onboarding UI, built nowhere today), and
// users.stripe_customer_id/stripe_payment_method_id populated somewhere
// (card-collection UI, also built nowhere today). Wiring a caller to this
// function is a separate, explicit step -- not part of this repair.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getServiceKey } from '../_shared/secretKey.ts';
import { getInternalSecret, isValidInternalSecret } from '../_shared/internalSecret.ts';
import { ChargeError, buildClaimMarker, buildIdempotencyKey, gateChargeableStatus, stripePost } from './logic.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = getServiceKey();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tradease-internal',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Auth: internal secret OR valid user JWT for customer-triggered approvals
  const internalSecret = req.headers.get('x-tradease-internal');
  const authHeader = req.headers.get('Authorization');
  const isInternal = isValidInternalSecret(internalSecret);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Fix 4 will address this path — left exactly as-is here.
  let callerId: string | null = null;
  if (!isInternal) {
    // Validate the user JWT
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    callerId = user.id;
  }

  const work_order_id: string | undefined = (await req.json().catch(() => ({})))?.work_order_id;
  if (!work_order_id) return json({ error: 'work_order_id required' }, 400);

  // Tracks whether this request holds the claim, so the outer catch knows
  // whether there's anything to release.
  let claimMarker: string | null = null;

  try {
    // 1. Load work order
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('id, customer_id, contractor_id, billing, status, stripe_payment_intent_id')
      .eq('id', work_order_id)
      .single();

    if (woErr || !wo) throw new ChargeError('Work order not found', 404);

    // Ownership check — a non-internal caller may only charge the work
    // order they are the customer on. Runs before any api.stripe.com call
    // (and before any other branch below) so a cross-account caller learns
    // nothing about the work order's state and never causes Stripe side
    // effects.
    if (!isInternal && callerId !== wo.customer_id) {
      throw new ChargeError('Forbidden', 403);
    }

    const gate = gateChargeableStatus(wo.status, wo.stripe_payment_intent_id);
    if (gate.kind === 'already_paid') return json({ already_paid: true });
    if (gate.kind === 'not_ready') {
      throw new ChargeError(`Cannot charge work order with status: ${gate.status}`, 400);
    }

    // 2. Idempotency: if a real Stripe PI already exists (a previous attempt
    // got as far as creating one but not marking the work order paid), try
    // to capture that instead of creating a second one. A stuck claim
    // marker from a crashed prior attempt doesn't start with 'pi_' and is
    // deliberately not treated as chargeable here — see #3.
    if (wo.stripe_payment_intent_id?.startsWith('pi_')) {
      const pi = await stripePost(STRIPE_SECRET_KEY, `payment_intents/${wo.stripe_payment_intent_id}/capture`, {});
      if (pi.status === 'succeeded') {
        const { error: rpcErr } = await supabase.rpc('mark_work_order_paid', {
          p_work_order_id: work_order_id,
          p_stripe_payment_intent_id: pi.id,
        });
        if (rpcErr) throw new ChargeError(`mark_work_order_paid failed: ${rpcErr.message}`, 500);
        return json({ success: true, payment_intent_id: pi.id });
      }
    }

    // 3. Atomic claim. Only one concurrent request can satisfy this WHERE
    // clause; the loser gets zero affected rows back and bails before ever
    // calling Stripe. Released in the catch block below on any failure from
    // this point on, so a genuine failure doesn't permanently strand the
    // work order at 'claim:...'.
    claimMarker = buildClaimMarker(work_order_id);
    const { data: claimedRow, error: claimErr } = await supabase
      .from('work_orders')
      .update({ stripe_payment_intent_id: claimMarker })
      .eq('id', work_order_id)
      .eq('status', 'payment_releasing')
      .is('stripe_payment_intent_id', null)
      .select('id')
      .maybeSingle();

    if (claimErr) throw new ChargeError(claimErr.message, 500);
    if (!claimedRow) {
      claimMarker = null; // nothing to release — we never held it
      throw new ChargeError('Charge already claimed by another request', 409);
    }

    // 4. Load customer payment details
    const { data: customer } = await supabase
      .from('users')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('id', wo.customer_id)
      .single();

    if (!customer?.stripe_customer_id || !customer?.stripe_payment_method_id) {
      throw new ChargeError('Customer has no payment method on file', 400);
    }

    // 5. Load contractor Connect account
    const { data: contractor } = await supabase
      .from('contractors')
      .select('stripe_account_id')
      .eq('id', wo.contractor_id)
      .single();

    if (!contractor?.stripe_account_id) {
      throw new ChargeError('Contractor has not completed Stripe Connect onboarding', 400);
    }

    // 6. Calculate amounts (billing stored as JSONB)
    const billing = wo.billing as Record<string, number>;
    const totalCents = Math.round((billing.total ?? 0) * 100);
    const feeCents = Math.round((billing.feeAmount ?? 0) * 100);

    if (totalCents < 50) throw new ChargeError('Amount too small to charge', 400);

    // 7. Create + confirm PaymentIntent with automatic transfer
    const idempotencyKey = buildIdempotencyKey(work_order_id);
    const pi = await stripePost(STRIPE_SECRET_KEY, 'payment_intents', {
      amount: totalCents,
      currency: 'usd',
      customer: customer.stripe_customer_id,
      payment_method: customer.stripe_payment_method_id,
      confirm: 'true',
      off_session: 'true',
      application_fee_amount: feeCents,
      'transfer_data[destination]': contractor.stripe_account_id,
      description: `Tradease work order ${work_order_id}`,
      metadata_work_order_id: work_order_id,
    }, idempotencyKey);

    // 8. Store the real PI id, overwriting the claim marker
    await supabase
      .from('work_orders')
      .update({ stripe_payment_intent_id: pi.id })
      .eq('id', work_order_id);
    claimMarker = null; // claim resolved — nothing left to release

    if (pi.status === 'succeeded') {
      const { error: rpcErr } = await supabase.rpc('mark_work_order_paid', {
        p_work_order_id: work_order_id,
        p_stripe_payment_intent_id: pi.id,
      });
      if (rpcErr) throw new ChargeError(`mark_work_order_paid failed: ${rpcErr.message}`, 500);

      // Send payment approved email to contractor
      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tradease-internal': getInternalSecret(),
        },
        body: JSON.stringify({
          template: 'payment_approved',
          to: (await supabase.from('users').select('email').eq('id', wo.contractor_id).single()).data?.email,
          data: {
            amount: billing.total,
            trade: 'service',
            customerName: 'Customer',
          },
        }),
      });

      return json({ success: true, payment_intent_id: pi.id });
    }

    // requires_action — 3DS needed (rare for off-session but handle it)
    return json({ requires_action: true, client_secret: pi.client_secret });

  } catch (err: unknown) {
    if (claimMarker) {
      await supabase
        .from('work_orders')
        .update({ stripe_payment_intent_id: null })
        .eq('id', work_order_id)
        .eq('stripe_payment_intent_id', claimMarker)
        .then(() => {}, () => {}); // best-effort release; don't mask the original error
    }
    if (err instanceof ChargeError) return json({ error: err.message }, err.status);
    console.error('charge-customer error:', err);
    return json({ error: String(err) }, 500);
  }
});
