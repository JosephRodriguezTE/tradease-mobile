// logic.ts — pure/testable pieces of charge-customer, kept out of index.ts
// so they can be imported by tests without triggering Deno.serve() or the
// top-level env-var assertions that module does at load time.

export class ChargeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// A single UPDATE with a WHERE clause two racing requests both try to
// satisfy -- only one can win it, since Postgres serializes row updates.
// The marker is overwritten with the real Stripe PI id on success, or reset
// back to NULL on any failure, so a retry after a genuine failure is never
// permanently blocked.
export const CLAIM_PREFIX = 'claim:';
export function buildClaimMarker(workOrderId: string): string {
  return `${CLAIM_PREFIX}${workOrderId}:${crypto.randomUUID()}`;
}

// Deterministic per-work-order key: a literal retry (same work order) reuses
// the same key, so Stripe returns the existing PaymentIntent instead of
// creating a second one, even if our own atomic claim were somehow bypassed.
export function buildIdempotencyKey(workOrderId: string): string {
  return `charge-customer:${workOrderId}`;
}

export type GateResult =
  | { kind: 'already_paid' }
  | { kind: 'ok' }
  | { kind: 'not_ready'; status: string };

// payment_releasing is the only reachable pre-charge state -- it's what
// mark_work_order_paid()'s own WHERE clause requires. 'approved' and 'paid'
// (the previous gate) are not work_order_status enum values and can never
// occur; that gate silently only ever let 'completed' through, which
// disagreed with mark_work_order_paid entirely. See docs/PAYMENT_FLOW_STATE.md.
export function gateChargeableStatus(status: string, stripePaymentIntentId: string | null): GateResult {
  if (status === 'completed' && stripePaymentIntentId) return { kind: 'already_paid' };
  if (status !== 'payment_releasing') return { kind: 'not_ready', status };
  return { kind: 'ok' };
}

export async function stripePost(
  stripeSecretKey: string,
  path: string,
  params: Record<string, string | number>,
  idempotencyKey?: string,
) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers, body });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error on ${path}`);
  return data;
}
