import { supabase } from './supabase';

// Customers can't read the contractors table (own row or admin only), so an
// embed like contractor:contractor_id(...) on bookings or job_offers comes
// back null for them. PostgREST can't embed the contractors_public view
// either (no foreign key), so batch-read it by id instead. phone is still
// gated by the view (booking relationship or the contractor's opt-in).
export const CONTRACTOR_CARD_COLUMNS =
  'id, company_name, trade_type, avatar_url, rating, phone, tagline, description, username, plan, verification_status, verified, insured, license_verified, specializations, is_available, total_bookings, review_count, location';

export async function fetchPublicContractors<T extends { id: string }>(
  ids: (string | null | undefined)[],
  columns: string = CONTRACTOR_CARD_COLUMNS,
): Promise<Record<string, T>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.from('contractors_public').select(columns).in('id', unique);
  if (error) {
    console.warn('[contractorsPublic] lookup failed:', error.message);
    return {};
  }
  return Object.fromEntries(((data ?? []) as unknown as T[]).map(c => [c.id, c]));
}
