// MockPaymentProvider — no real money moves, logs everything to payment_events.
// Swap out for StripePaymentProvider by changing the export at the bottom.

import { supabase } from '../supabase';
import type {
  CaptureResult,
  CreateHoldParams,
  CreateHoldResult,
  PaymentIntentDetails,
  PaymentProvider,
  RefundResult,
  ReleaseResult,
} from './provider';

const MOCK_DECLINE_RATE = 0.05; // 5% random decline on hold

async function logEvent(params: {
  paymentIntentId: string;
  bookingId:       string;
  eventType:       string;
  fromStatus?:     string;
  toStatus?:       string;
  actorId?:        string;
  amountCents?:    number;
  note?:           string;
  providerResponse?: Record<string, unknown>;
}) {
  await supabase.from('payment_events').insert({
    payment_intent_id: params.paymentIntentId,
    booking_id:        params.bookingId,
    event_type:        params.eventType,
    from_status:       params.fromStatus ?? null,
    to_status:         params.toStatus ?? null,
    actor_id:          params.actorId ?? null,
    amount_cents:      params.amountCents ?? null,
    note:              params.note ?? null,
    provider_response: params.providerResponse ?? null,
  });
}

export class MockPaymentProvider implements PaymentProvider {
  async createHold(params: CreateHoldParams): Promise<CreateHoldResult> {
    const declined = Math.random() < MOCK_DECLINE_RATE;

    const { data: intent, error } = await supabase
      .from('payment_intents')
      .insert({
        booking_id:         params.bookingId,
        customer_id:        params.customerId,
        contractor_id:      params.contractorId,
        amount_cents:       params.amountCents,
        status:             declined ? 'hold_failed' : 'held',
        provider:           'mock',
        provider_intent_id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        held_at:            declined ? null : new Date().toISOString(),
      })
      .select('id, provider_intent_id')
      .single();

    if (error || !intent) {
      return { intentId: '', status: 'hold_failed', error: error?.message ?? 'Insert failed' };
    }

    await logEvent({
      paymentIntentId: intent.id,
      bookingId:       params.bookingId,
      eventType:       declined ? 'hold_declined' : 'hold_created',
      fromStatus:      'pending_hold',
      toStatus:        declined ? 'hold_failed' : 'held',
      actorId:         params.customerId,
      amountCents:     params.amountCents,
      note:            declined ? 'Mock: random decline (5% rate)' : 'Mock: hold placed successfully',
      providerResponse: { provider_intent_id: intent.provider_intent_id, mock: true },
    });

    return { intentId: intent.id, status: declined ? 'hold_failed' : 'held' };
  }

  async capturePayment(intentId: string, tipCents = 0): Promise<CaptureResult> {
    const { data: intent } = await supabase
      .from('payment_intents')
      .select('id, booking_id, status, amount_cents, customer_id, contractor_id')
      .eq('id', intentId)
      .single();

    if (!intent) return { status: 'failed', error: 'Intent not found' };
    if (intent.status !== 'customer_finished') {
      return { status: 'failed', error: `Cannot capture from status: ${intent.status}` };
    }

    const { error } = await supabase
      .from('payment_intents')
      .update({ status: 'captured', tip_cents: tipCents, captured_at: new Date().toISOString() })
      .eq('id', intentId);

    if (error) return { status: 'failed', error: error.message };

    await logEvent({
      paymentIntentId: intentId,
      bookingId:       intent.booking_id,
      eventType:       'payment_captured',
      fromStatus:      'customer_finished',
      toStatus:        'captured',
      actorId:         intent.customer_id,
      amountCents:     intent.amount_cents + tipCents,
      note:            `Mock: captured. Tip: $${(tipCents / 100).toFixed(2)}`,
    });

    return { status: 'captured' };
  }

  async releaseHold(intentId: string): Promise<ReleaseResult> {
    const { data: intent } = await supabase
      .from('payment_intents')
      .select('id, booking_id, status, customer_id')
      .eq('id', intentId)
      .single();

    if (!intent) return { status: 'failed', error: 'Intent not found' };
    if (intent.status !== 'held') {
      return { status: 'failed', error: `Cannot release from status: ${intent.status}` };
    }

    const { error } = await supabase
      .from('payment_intents')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('id', intentId);

    if (error) return { status: 'failed', error: error.message };

    await logEvent({
      paymentIntentId: intentId,
      bookingId:       intent.booking_id,
      eventType:       'hold_released',
      fromStatus:      'held',
      toStatus:        'released',
      actorId:         intent.customer_id,
      note:            'Mock: hold released back to customer',
    });

    return { status: 'released' };
  }

  async refund(intentId: string, amountCents?: number): Promise<RefundResult> {
    const { data: intent } = await supabase
      .from('payment_intents')
      .select('id, booking_id, status, amount_cents, customer_id')
      .eq('id', intentId)
      .single();

    if (!intent) return { status: 'failed', error: 'Intent not found' };
    if (!['captured', 'customer_finished'].includes(intent.status)) {
      return { status: 'failed', error: `Cannot refund from status: ${intent.status}` };
    }

    const refundAmount = amountCents ?? intent.amount_cents;

    const { error } = await supabase
      .from('payment_intents')
      .update({ status: 'refunded', refunded_at: new Date().toISOString() })
      .eq('id', intentId);

    if (error) return { status: 'failed', error: error.message };

    await logEvent({
      paymentIntentId: intentId,
      bookingId:       intent.booking_id,
      eventType:       'payment_refunded',
      fromStatus:      intent.status,
      toStatus:        'refunded',
      actorId:         intent.customer_id,
      amountCents:     refundAmount,
      note:            `Mock: refunded $${(refundAmount / 100).toFixed(2)}`,
    });

    return { status: 'refunded', refundedCents: refundAmount };
  }

  async getStatus(intentId: string): Promise<PaymentIntentDetails | null> {
    const { data } = await supabase
      .from('payment_intents')
      .select('id, status, amount_cents, tip_cents, held_at, captured_at, released_at, refunded_at')
      .eq('id', intentId)
      .single();

    if (!data) return null;
    return {
      intentId:    data.id,
      status:      data.status,
      amountCents: data.amount_cents,
      tipCents:    data.tip_cents,
      heldAt:      data.held_at,
      capturedAt:  data.captured_at,
      releasedAt:  data.released_at,
      refundedAt:  data.refunded_at,
    };
  }
}

// ── Active provider — swap to StripePaymentProvider when ready ───────────────
export const paymentProvider: PaymentProvider = new MockPaymentProvider();
