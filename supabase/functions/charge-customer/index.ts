// charge-customer/index.ts
// Called when a customer approves a work order OR by the auto-approve cron job.
// Creates a PaymentIntent against the customer's saved card, transfers the
// contractor payout to their Connect account, and marks the work order paid.
// verify_jwt: false because it's called by the auto-approve cron (no user JWT).
// Protected by the internal secret header.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getServiceKey } from '../_shared/secretKey.ts';
import { getInternalSecret, isValidInternalSecret } from '../_shared/internalSecret.ts';

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

async function stripePost(path: string, params: Record<string, string | number>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error on ${path}`);
  return data;
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

  try {
    const { work_order_id } = await req.json();
    if (!work_order_id) return json({ error: 'work_order_id required' }, 400);

    // 1. Load work order
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('id, customer_id, contractor_id, billing, status, stripe_payment_intent_id')
      .eq('id', work_order_id)
      .single();

    if (woErr || !wo) return json({ error: 'Work order not found' }, 404);

    // Ownership check — a non-internal caller may only charge the work
    // order they are the customer on. Runs before any api.stripe.com call
    // (and before any other branch below) so a cross-account caller learns
    // nothing about the work order's state and never causes Stripe side
    // effects.
    if (!isInternal && callerId !== wo.customer_id) {
      return json({ error: 'Forbidden' }, 403);
    }

    if (wo.status === 'paid') return json({ already_paid: true });
    if (!['approved', 'completed'].includes(wo.status)) {
      return json({ error: `Cannot charge work order with status: ${wo.status}` }, 400);
    }

    // 2. Idempotency: if PI already exists, just confirm/capture it
    if (wo.stripe_payment_intent_id) {
      const pi = await stripePost(`payment_intents/${wo.stripe_payment_intent_id}/capture`, {});
      if (pi.status === 'succeeded') {
        await supabase.rpc('mark_work_order_paid', {
          p_work_order_id: work_order_id,
          p_stripe_payment_intent_id: pi.id,
        });
        return json({ success: true, payment_intent_id: pi.id });
      }
    }

    // 3. Load customer payment details
    const { data: customer } = await supabase
      .from('users')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('id', wo.customer_id)
      .single();

    if (!customer?.stripe_customer_id || !customer?.stripe_payment_method_id) {
      return json({ error: 'Customer has no payment method on file' }, 400);
    }

    // 4. Load contractor Connect account
    const { data: contractor } = await supabase
      .from('contractors')
      .select('stripe_account_id')
      .eq('id', wo.contractor_id)
      .single();

    if (!contractor?.stripe_account_id) {
      return json({ error: 'Contractor has not completed Stripe Connect onboarding' }, 400);
    }

    // 5. Calculate amounts (billing stored as JSONB)
    const billing = wo.billing as Record<string, number>;
    const totalCents = Math.round((billing.total ?? 0) * 100);
    const feeCents = Math.round((billing.feeAmount ?? 0) * 100);
    const payoutCents = totalCents - feeCents;

    if (totalCents < 50) return json({ error: 'Amount too small to charge' }, 400);

    // 6. Create + confirm PaymentIntent with automatic transfer
    const pi = await stripePost('payment_intents', {
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
    });

    // 7. Store PI on work order for webhook matching
    await supabase
      .from('work_orders')
      .update({ stripe_payment_intent_id: pi.id })
      .eq('id', work_order_id);

    if (pi.status === 'succeeded') {
      await supabase.rpc('mark_work_order_paid', {
        p_work_order_id: work_order_id,
        p_stripe_payment_intent_id: pi.id,
      });

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
    console.error('charge-customer error:', err);
    return json({ error: String(err) }, 500);
  }
});
