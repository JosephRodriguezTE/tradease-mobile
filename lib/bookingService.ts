import { supabase } from './supabase';

// ─── Customer: Create a booking ───────────────────────────────────────────────

export async function createBooking({
  contractorId,
  trade,
  description,
  location,
  priceEstimate,
}: {
  contractorId: string;
  trade: string;
  description: string;
  location: string;
  priceEstimate?: number;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      customer_id: user.id,
      contractor_id: contractorId,
      trade,
      description,
      status: 'pending',
      payment_status: 'unpaid',
      refund_status: 'none',
      notes: location,
      price_estimate: priceEstimate ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Customer: Get my bookings ────────────────────────────────────────────────

export async function getCustomerBookings() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      contractor:contractor_id (
        id,
        company_name,
        trade_type,
        avatar_url,
        rating
      )
    `)
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─── Contractor: Get available jobs ──────────────────────────────────────────

export async function getAvailableJobs(trade?: string) {
  let query = supabase
    .from('bookings')
    .select(`
      *,
      customer:customer_id (
        id,
        full_name,
        location
      )
    `)
    .eq('status', 'pending')
    .is('contractor_id', null)
    .order('created_at', { ascending: false });

  if (trade && trade !== 'All') {
    query = query.eq('trade', trade);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Contractor: Accept a job ─────────────────────────────────────────────────

export async function acceptJob(bookingId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bookings')
    .update({
      contractor_id: user.id,
      status: 'accepted',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw error;

  // Auto-create a conversation when job is accepted
  await createConversation(bookingId, data.customer_id, user.id);

  return data;
}

// ─── Contractor: Decline a job ────────────────────────────────────────────────

export async function declineJob(bookingId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'declined' })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Complete a job ───────────────────────────────────────────────────────────

export async function completeJob(bookingId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Create conversation (internal) ──────────────────────────────────────────

async function createConversation(
  bookingId: string,
  customerId: string,
  contractorId: string
) {
  // Check if conversation already exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('contractor_id', contractorId)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      customer_id: customerId,
      contractor_id: contractorId,
      status: 'accepted',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}