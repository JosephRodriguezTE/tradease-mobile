// ─── useWorkOrder ─────────────────────────────────────────────────────────────
// Central hook for all work order state, billing calculations, and Supabase sync.
// Used by both ContractorWorkOrderScreen and CustomerWorkOrderScreen.

import { sendPushNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { BillingBreakdown, LineItem, WorkOrder } from '@/types/workOrder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });

// ─── Constants ────────────────────────────────────────────────────────────────

export const FEE_TIERS = [
  { upTo: 500,      rate: 0.10, label: '10%' },
  { upTo: 2000,     rate: 0.08, label: '8%'  },
  { upTo: Infinity, rate: 0.06, label: '6%'  },
] as const;

export const DEFAULT_TAX_RATE = 0.08875;
export const TAX_RATE_RANGE   = { min: '7%', max: '9%' };
export const FEE_RATE_RANGE   = { min: '6%', max: '10%' };
export const AUTO_APPROVE_MS  = 24 * 60 * 60 * 1000;

// ─── Fee helpers ──────────────────────────────────────────────────────────────

export function getFeeRate(subtotal: number): number {
  for (const tier of FEE_TIERS) {
    if (subtotal <= tier.upTo) return tier.rate;
  }
  return FEE_TIERS[FEE_TIERS.length - 1].rate;
}

export function getFeeLabel(subtotal: number): string {
  for (const tier of FEE_TIERS) {
    if (subtotal <= tier.upTo) return tier.label;
  }
  return FEE_TIERS[FEE_TIERS.length - 1].label;
}

export function calcBilling(
  items: LineItem[],
  taxRate: number = DEFAULT_TAX_RATE,
): BillingBreakdown {
  const subtotal  = items.reduce((sum, item) => sum + item.amount, 0);
  const feeRate   = getFeeRate(subtotal);
  const feeAmount = parseFloat((subtotal * feeRate).toFixed(2));
  const taxAmount = parseFloat((subtotal * taxRate).toFixed(2));
  const total     = parseFloat((subtotal + feeAmount + taxAmount).toFixed(2));
  return { subtotal, feeRate, feeAmount, taxRate, taxAmount, total };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function getCountdownLabel(autoApproveAt: string): string {
  const diff = new Date(autoApproveAt).getTime() - Date.now();
  if (diff <= 0) return 'Processing payment...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m remaining`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseWorkOrderOptions {
  workOrderId: string;
  role: 'contractor' | 'customer';
}

export function useWorkOrder({ workOrderId, role }: UseWorkOrderOptions) {
  const [workOrder, setWorkOrder]   = useState<WorkOrder | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('work_orders')
        .select('*')
        .eq('booking_id', workOrderId)
        .single();
      if (!mounted) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setWorkOrder(data as WorkOrder);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [workOrderId]);

  useEffect(() => {
    // Unique name prevents Supabase returning a cached already-subscribed
    // channel when the effect re-runs (React Strict Mode or workOrderId change).
    const channel = supabase
      .channel(`work_order:${workOrderId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `booking_id=eq.${workOrderId}` },
        (payload) => setWorkOrder(payload.new as WorkOrder),
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workOrderId]);

  const addLineItem = useCallback(async (description: string, amount: number) => {
    if (!workOrder || role !== 'contractor') return;
    const newItem: LineItem = { id: uuid(), description, amount };
    const updatedItems = [...workOrder.line_items, newItem];
    const billing = calcBilling(updatedItems);
    const now = new Date().toISOString();
    setWorkOrder({ ...workOrder, line_items: updatedItems, billing, updated_at: now });
    setSaving(true);
    const { error: err } = await supabase
      .from('work_orders')
      .update({ line_items: updatedItems, billing, updated_at: now })
      .eq('booking_id', workOrderId);
    setSaving(false);
    if (err) Alert.alert('Error', 'Failed to save line item.');
  }, [workOrder, role, workOrderId]);

  const removeLineItem = useCallback(async (itemId: string) => {
    if (!workOrder || role !== 'contractor') return;
    const updatedItems = workOrder.line_items.filter((i) => i.id !== itemId);
    const billing = calcBilling(updatedItems);
    const now = new Date().toISOString();
    setWorkOrder({ ...workOrder, line_items: updatedItems, billing, updated_at: now });
    setSaving(true);
    const { error: err } = await supabase
      .from('work_orders')
      .update({ line_items: updatedItems, billing, updated_at: now })
      .eq('booking_id', workOrderId);
    setSaving(false);
    if (err) Alert.alert('Error', 'Failed to remove line item.');
  }, [workOrder, role, workOrderId]);

  const markComplete = useCallback(async () => {
    if (!workOrder || role !== 'contractor') return;
    if (workOrder.line_items.length === 0) {
      Alert.alert('Add items first', 'Add at least one line item before marking complete.');
      return;
    }
    const now          = new Date();
    const autoApproveAt = new Date(now.getTime() + AUTO_APPROVE_MS).toISOString();
    const nowStr       = now.toISOString();
    setSaving(true);
    const { data: updated, error: err } = await supabase
      .from('work_orders')
      .update({ status: 'completed', completed_at: nowStr, auto_approve_at: autoApproveAt, updated_at: nowStr })
      .eq('booking_id', workOrderId)
      .select('id')
      .single();
    setSaving(false);
    if (err || !updated) { Alert.alert('Error', 'Failed to mark job complete.'); return; }
    setWorkOrder({ ...workOrder, status: 'completed', completed_at: nowStr, auto_approve_at: autoApproveAt, updated_at: nowStr });
    // Sync booking status so customer's jobs tab shows the correct state
    supabase.from('bookings').update({ status: 'completed' }).eq('id', workOrderId).then(() => {});
    // Push notification to customer — email handled by DB trigger
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_id, trade')
        .eq('id', workOrderId)
        .single();
      if (booking?.customer_id) {
        sendPushNotification({
          userId:    booking.customer_id,
          type:      'job_completed',
          title:     'Job Complete — Review & Pay',
          message:   `${workOrder.contractor_name} has finished. Tap to approve payment.`,
          bookingId: workOrderId,
          actorName: workOrder.contractor_name,
          icon:      'checkmark-circle-outline',
          data:      { booking_id: workOrderId, work_order_id: workOrderId },
        });
      }
    } catch (_) {}
  }, [workOrder, role, workOrderId]);

  const approveAndPay = useCallback(async () => {
    if (!workOrder || role !== 'customer') return;
    const now = new Date().toISOString();
    setSaving(true);

    // 1. Mark approved in work_orders
    const { error: err } = await supabase
      .from('work_orders')
      .update({ status: 'approved', approved_at: now, updated_at: now })
      .eq('booking_id', workOrderId)
      .select('id')
      .single();

    if (err) {
      setSaving(false);
      Alert.alert(
        err.code === 'PGRST116' ? 'Not Ready' : 'Approval Failed',
        err.code === 'PGRST116'
          ? "The contractor hasn't marked this job complete yet."
          : 'Could not process approval. Please try again.',
      );
      return;
    }

    setWorkOrder({ ...workOrder, status: 'approved', approved_at: now, updated_at: now });

    // Sync booking so jobs list reflects approved status
    supabase.from('bookings').update({ status: 'approved' }).eq('id', workOrderId).then(() => {});

    // 2. Trigger Stripe charge via tradease.tech API
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
      if (token && apiUrl) {
        const res = await fetch(`${apiUrl}/api/approve-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ booking_id: workOrderId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // Log but don't block — payment record created, Stripe will retry
          console.warn('approve-payment API error:', body?.error ?? res.status);
        }
      }
    } catch (apiErr) {
      console.warn('approve-payment fetch error:', apiErr);
    }

    setSaving(false);
  }, [workOrder, role, workOrderId]);

  const raiseDispute = useCallback(async (reason: string) => {
    if (!workOrder || role !== 'customer') return;
    const now = new Date().toISOString();
    setSaving(true);
    const { error: err } = await supabase
      .from('work_orders')
      .update({ status: 'disputed', notes: reason, updated_at: now })
      .eq('booking_id', workOrderId)
      .select('id')
      .single();
    setSaving(false);
    if (err) {
      Alert.alert(
        err.code === 'PGRST116' ? 'Cannot Dispute' : 'Dispute Failed',
        err.code === 'PGRST116'
          ? 'Disputes can only be raised once the job is marked complete.'
          : 'Failed to submit dispute. Please try again.',
      );
      return;
    }
    setWorkOrder((prev) => prev ? { ...prev, status: 'disputed', notes: reason } : prev);
  }, [workOrder, role, workOrderId]);

  return { workOrder, loading, saving, error, addLineItem, removeLineItem, markComplete, approveAndPay, raiseDispute };
}