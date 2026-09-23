// Unit tests for charge-customer's pure logic. Run with:
//   deno test --allow-env supabase/functions/charge-customer/logic.test.ts
// Never imports index.ts (which calls Deno.serve() at module load) and
// never reaches the real network -- fetch is stubbed below and made to
// throw if anything ever tries to hit api.stripe.com for real.

import { assertEquals, assertMatch, assertNotEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildClaimMarker, buildIdempotencyKey, CLAIM_PREFIX, ChargeError, gateChargeableStatus, stripePost } from './logic.ts';

// ── gateChargeableStatus ────────────────────────────────────────────────────

Deno.test('gate: payment_releasing with no existing PI is chargeable', () => {
  assertEquals(gateChargeableStatus('payment_releasing', null), { kind: 'ok' });
});

Deno.test('gate: completed + a real PI id is already_paid, short-circuits', () => {
  assertEquals(gateChargeableStatus('completed', 'pi_abc123'), { kind: 'already_paid' });
});

Deno.test('gate: completed with no PI id is NOT already_paid (not reached via this function)', () => {
  assertEquals(gateChargeableStatus('completed', null), { kind: 'not_ready', status: 'completed' });
});

Deno.test('gate: awaiting_approval is rejected — payment_releasing is the only reachable pre-charge state', () => {
  assertEquals(gateChargeableStatus('awaiting_approval', null), { kind: 'not_ready', status: 'awaiting_approval' });
});

// The whole point of this repair: 'approved' and 'paid' are not real
// work_order_status enum values and must no longer be treated specially.
Deno.test("gate: 'approved' is rejected — not a real enum value, previously silently let through", () => {
  assertEquals(gateChargeableStatus('approved', null), { kind: 'not_ready', status: 'approved' });
});

Deno.test("gate: 'paid' is rejected — not a real enum value, previously short-circuited as already_paid", () => {
  assertEquals(gateChargeableStatus('paid', null), { kind: 'not_ready', status: 'paid' });
});

// ── buildIdempotencyKey ─────────────────────────────────────────────────────

Deno.test('idempotency key: deterministic per work order (retries collapse in Stripe)', () => {
  const a = buildIdempotencyKey('11111111-1111-1111-1111-111111111111');
  const b = buildIdempotencyKey('11111111-1111-1111-1111-111111111111');
  assertEquals(a, b);
  assertEquals(a, 'charge-customer:11111111-1111-1111-1111-111111111111');
});

Deno.test('idempotency key: different per work order', () => {
  const a = buildIdempotencyKey('work-order-a');
  const b = buildIdempotencyKey('work-order-b');
  assertNotEquals(a, b);
});

// ── buildClaimMarker ────────────────────────────────────────────────────────

Deno.test('claim marker: carries the claim prefix and the work order id', () => {
  const marker = buildClaimMarker('wo-123');
  assertMatch(marker, new RegExp(`^${CLAIM_PREFIX}wo-123:`));
});

Deno.test('claim marker: never looks like a real Stripe PI id (so a stuck marker is never mistaken for one)', () => {
  const marker = buildClaimMarker('wo-123');
  assertEquals(marker.startsWith('pi_'), false);
});

Deno.test('claim marker: unique per call (two concurrent claims never collide on the value itself)', () => {
  const a = buildClaimMarker('wo-123');
  const b = buildClaimMarker('wo-123');
  assertNotEquals(a, b);
});

// ── stripePost: never touches the real network, and sends Idempotency-Key ──

function stubFetchOnce(handler: (input: string | URL | Request, init?: RequestInit) => Response) {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    if (called) throw new Error('fetch stub called more than once — test only expects one request');
    called = true;
    const url = typeof input === 'string' ? input : input.toString();
    // Hard guarantee this test suite never makes a real network call: the
    // stub answers locally instead of forwarding to the real Stripe API.
    if (!url.startsWith('https://api.stripe.com/')) {
      throw new Error(`unexpected fetch target in test: ${url}`);
    }
    return Promise.resolve(handler(input, init));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

Deno.test('stripePost: sends Idempotency-Key header when provided, never calls real Stripe', async () => {
  let seenHeaders: Headers | undefined;
  const restore = stubFetchOnce((_input, init) => {
    seenHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ id: 'pi_test_123', status: 'succeeded' }), { status: 200 });
  });
  try {
    const result = await stripePost('sk_test_fake', 'payment_intents', { amount: 1000 }, 'charge-customer:wo-1');
    assertEquals(result.id, 'pi_test_123');
    assertEquals(seenHeaders?.get('Idempotency-Key'), 'charge-customer:wo-1');
    assertEquals(seenHeaders?.get('Authorization'), 'Bearer sk_test_fake');
  } finally {
    restore();
  }
});

Deno.test('stripePost: omits Idempotency-Key header when none is provided', async () => {
  let seenHeaders: Headers | undefined;
  const restore = stubFetchOnce((_input, init) => {
    seenHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ id: 'pi_test_456', status: 'succeeded' }), { status: 200 });
  });
  try {
    await stripePost('sk_test_fake', 'payment_intents/pi_test_456/capture', {});
    assertEquals(seenHeaders?.has('Idempotency-Key'), false);
  } finally {
    restore();
  }
});

Deno.test('stripePost: a Stripe-side error throws, never returns success', async () => {
  const restore = stubFetchOnce(() =>
    new Response(JSON.stringify({ error: { message: 'Your card was declined.' } }), { status: 402 }));
  try {
    await assertRejects(
      () => stripePost('sk_test_fake', 'payment_intents', { amount: 1000 }),
      Error,
      'Your card was declined.',
    );
  } finally {
    restore();
  }
});

// ── ChargeError ──────────────────────────────────────────────────────────

Deno.test('ChargeError carries the intended HTTP status', () => {
  const err = new ChargeError('Forbidden', 403);
  assertEquals(err.message, 'Forbidden');
  assertEquals(err.status, 403);
  assertThrows(() => { throw err; }, ChargeError, 'Forbidden');
});
