// ─── Tradease Work Order Types ────────────────────────────────────────────────

export interface LineItem {
  id: string;
  description: string;
  amount: number;
  created_at?: string;
}

export type WorkOrderStatus =
  | 'draft'          // contractor building it
  | 'active'         // job in progress, customer can see live
  | 'completed'      // contractor marked done, 24hr window starts
  | 'approved'       // customer approved or auto-approved
  | 'disputed'       // customer flagged an issue
  | 'paid';          // payment processed successfully

export interface BillingBreakdown {
  subtotal: number;
  feeRate: number;       // decimal e.g. 0.08
  feeAmount: number;
  taxRate: number;       // decimal e.g. 0.08875
  taxAmount: number;
  total: number;
}

export interface WorkOrder {
  id: string;
  booking_id: string;
  contractor_id: string;
  customer_id: string;
  status: WorkOrderStatus;
  line_items: LineItem[];
  billing: BillingBreakdown;
  customer_name: string;
  contractor_name: string;
  service_type: string;
  job_address: string;
  notes?: string;
  completed_at?: string;
  auto_approve_at?: string;  // completed_at + 24 hours
  approved_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}