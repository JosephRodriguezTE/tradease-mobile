// Payment provider interface — swap implementations without touching business logic.
// Current: MockPaymentProvider. Future: StripePaymentProvider.

export type PaymentIntentStatus =
  | 'pending_hold'
  | 'hold_failed'
  | 'held'
  | 'in_progress'
  | 'contractor_completed'
  | 'customer_finished'
  | 'captured'
  | 'released'
  | 'refunded'
  | 'disputed';

export interface CreateHoldParams {
  bookingId:     string;
  customerId:    string;
  contractorId:  string;
  amountCents:   number;
  metadata?:     Record<string, string>;
}

export interface CreateHoldResult {
  intentId: string;
  status:   'held' | 'hold_failed';
  error?:   string;
}

export interface CaptureResult {
  status: 'captured' | 'failed';
  error?: string;
}

export interface ReleaseResult {
  status: 'released' | 'failed';
  error?: string;
}

export interface RefundResult {
  status:          'refunded' | 'failed';
  refundedCents?:  number;
  error?:          string;
}

export interface PaymentIntentDetails {
  intentId:    string;
  status:      PaymentIntentStatus;
  amountCents: number;
  tipCents:    number;
  heldAt?:     string;
  capturedAt?: string;
  releasedAt?: string;
  refundedAt?: string;
}

export interface PaymentProvider {
  /** Put a hold on customer funds. Returns intentId to reference this payment. */
  createHold(params: CreateHoldParams): Promise<CreateHoldResult>;

  /** Capture (release to contractor) after customer approves completed work. */
  capturePayment(intentId: string, tipCents?: number): Promise<CaptureResult>;

  /** Release held funds back to customer — used when job is cancelled before work. */
  releaseHold(intentId: string): Promise<ReleaseResult>;

  /** Refund a captured payment — used for disputes or partial refunds. */
  refund(intentId: string, amountCents?: number): Promise<RefundResult>;

  /** Fetch current status of a payment intent. */
  getStatus(intentId: string): Promise<PaymentIntentDetails | null>;
}
