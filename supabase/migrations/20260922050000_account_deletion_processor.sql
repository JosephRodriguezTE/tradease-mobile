-- Account deletion processor.
--
-- account_deletion_requests has existed since before this migration but
-- nothing ever processed it -- pure write-only log. This migration adds
-- the schema needed to actually run it (grace period, cancellation,
-- one-pending-per-user), the deleted_at flag that hides an anonymized
-- contractor everywhere customers look, and process_account_deletion(),
-- the per-request worker the new edge function calls via RPC. Storage
-- and the auth.users layer (email/ban/sessions) are handled in the edge
-- function, not here -- this function does everything that's pure SQL.
--
-- auth.users is never deleted (users/contractors CASCADE off it, and
-- bookings.customer_id -> auth.users is NO ACTION, so a raw delete would
-- fail the moment the user has any booking -- confirmed live in the
-- read-only pass). Instead the edge function frees the email via the
-- real Admin API (auth.admin.updateUserById) and bans the user; this
-- function clears auth.identities/auth.sessions/auth.refresh_tokens
-- directly, since no admin API revokes a specific user's sessions
-- without deleting them (confirmed against Supabase's own docs/GitHub
-- discussions this session -- ban_duration alone does not invalidate
-- existing sessions, and the only way to force one via the client
-- library is auth.admin.deleteUser(), which is exactly what's forbidden
-- here).

-- ── 1. account_deletion_requests: grace period, one-pending-per-user, cancel ──

alter table public.account_deletion_requests
  add column if not exists scheduled_delete_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists defer_reason text,
  add column if not exists last_attempted_at timestamptz;

update public.account_deletion_requests
  set scheduled_delete_at = requested_at + interval '14 days'
  where scheduled_delete_at is null;

alter table public.account_deletion_requests
  alter column scheduled_delete_at set default (now() + interval '14 days'),
  alter column scheduled_delete_at set not null;

-- One pending request per user -- the UI never checked for an existing
-- one before this, so duplicates were possible.
create unique index if not exists account_deletion_requests_one_pending_per_user
  on public.account_deletion_requests (user_id)
  where status = 'pending';

-- No UPDATE policy existed at all before this -- a user could not cancel
-- their own request even if the UI had offered it. Scoped narrowly: only
-- their own row, only while pending, only into 'cancelled' (never
-- 'done' or any other value -- that transition belongs to the processor
-- alone, which runs as service_role and bypasses RLS).
create policy adr_cancel_own_pending on public.account_deletion_requests
  for update
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

-- ── 2. deleted_at: the flag that hides an anonymized contractor everywhere ──

alter table public.users add column if not exists deleted_at timestamptz;
alter table public.contractors add column if not exists deleted_at timestamptz;

-- ── 3. Gate every public contractor-discovery surface ──────────────────────
--
-- Every surface a customer can find a contractor through, confirmed by
-- reading the actual call sites in both repos: contractors_public (mobile
-- company/[id].tsx; website /contractors, /contractors/[trade],
-- /contractors/[trade]/[city], /contractor/[id], find-contractors) reads
-- this view directly, with zero filtering of its own today. contractors_nearby()
-- (mobile map.tsx; website's nearby branch on /contractors) and
-- get_ranked_contractors() (mobile find-contractor.tsx) are the two RPCs.
-- notify_new_job_posted()'s no-coordinates fallback already reads
-- contractors_public, so gating the view covers it for free; its
-- coordinate branch already calls contractors_nearby(), same thing.
-- The realtime lead-broadcast policy is the one surface that isn't a
-- read path at all -- it's what lets a contractor subscribe to new-job
-- pushes for their trade, gated separately below.
--
-- The base contractors table itself was already unreachable by anyone but
-- the owner or an admin (RLS: contractors_select_own_or_admin) -- these
-- four are the only paths that expose contractor data more broadly, and
-- are the complete set.

create or replace view public.contractors_public as
 SELECT c.id,
    c.username,
    c.company_name,
    c.company_tag,
    c.tagline,
    c.trade_type,
    c.description,
    c.experience,
    c.years_in_business,
    c.specializations,
    c.languages,
    c.service_area,
    c.service_areas,
    c.service_radius_miles,
    c.location,
    c.business_city,
    c.business_state,
    c.show_on_map,
    c.location_mode,
    c.avatar,
    c.avatar_url,
    c.banner_url,
    c.portfolio,
    c.portfolio_photos,
    c.pricing_services,
    c.pricing_note,
    c.pricing_desc,
    c.hourly_rate,
    c.rating,
    c.review_count,
    c.total_bookings,
    c.response_time_avg,
    c.acceptance_rate,
    c.reliability_score,
    c.verified,
    c.license_verified,
    c.insurance_verified,
    c.insured,
    c.is_online,
    c.is_available,
    c.accepts_bookings,
    c.profile_complete,
    c.profile_published,
    c.created_at,
    c.website,
    c.plan,
    c.verification_status,
    c.phone,
    COALESCE(array_agg(ct.trade_id) FILTER (WHERE ct.trade_id IS NOT NULL), '{}'::text[]) AS trade_ids
   FROM contractors c
     LEFT JOIN contractor_trades ct ON ct.contractor_id = c.id
   WHERE c.deleted_at IS NULL
   GROUP BY c.id;

CREATE OR REPLACE FUNCTION public.contractors_nearby(user_lat double precision, user_lng double precision, max_miles double precision DEFAULT 50, trade_filter text DEFAULT NULL::text, specialty_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, company_name text, trade_type text, location text, service_area text, rating numeric, review_count integer, verified boolean, verification_status text, is_available boolean, plan text, avatar_url text, banner_url text, specializations jsonb, years_in_business integer, distance_miles double precision, pin_lat double precision, pin_lng double precision, pin_mode text, service_radius_miles numeric, area_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.company_name, c.trade_type, c.location, c.service_area,
    c.rating, c.review_count, c.verified, c.verification_status,
    c.is_available, c.plan, c.avatar_url, c.banner_url,
    c.specializations, c.years_in_business,
    haversine_miles(user_lat, user_lng, c.lat::float8, c.lng::float8) as distance_miles,
    pcl.pin_lat, pcl.pin_lng, pcl.pin_mode, pcl.service_radius_miles, pcl.area_label
  FROM contractors c
  CROSS JOIN LATERAL public.public_contractor_location(
    c.lat::float8, c.lng::float8, c.service_radius_miles,
    COALESCE(NULLIF(c.location, ''), NULLIF(c.business_city, ''), NULLIF(c.service_area, '')),
    c.show_exact_location, c.has_commercial_address, c.commercial_lat, c.commercial_lng
  ) pcl
  WHERE
    c.lat IS NOT NULL AND c.lng IS NOT NULL
    AND c.deleted_at IS NULL
    AND c.is_available = true
    AND c.verification_status = 'approved'
    AND c.profile_published = true
    AND c.show_on_map = true
    AND haversine_miles(user_lat, user_lng, c.lat::float8, c.lng::float8)
        <= coalesce(c.service_radius_miles::float8, max_miles)
    AND (trade_filter IS NULL OR EXISTS (
      SELECT 1 FROM contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = trade_filter
    ))
    AND (specialty_filter IS NULL OR c.specializations @> to_jsonb(array[specialty_filter]))
  ORDER BY distance_miles ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranked_contractors(p_category text DEFAULT NULL::text, p_area text DEFAULT NULL::text, p_pro_priority_featured boolean DEFAULT false)
 RETURNS SETOF contractors
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.*
  FROM public.contractors c
  WHERE c.deleted_at IS NULL
    AND c.approval_status = 'approved'
    AND c.is_available = true
    AND (
      p_category IS NULL
      OR EXISTS (SELECT 1 FROM contractor_trades ct WHERE ct.contractor_id = c.id AND ct.trade_id = p_category)
    )
    AND (
      p_area IS NULL
      OR c.service_area ILIKE '%' || p_area || '%'
      OR c.location      ILIKE '%' || p_area || '%'
      OR c.business_city ILIKE '%' || p_area || '%'
    )
  ORDER BY
    CASE WHEN c.plan IN ('pro', 'leads') THEN 0 ELSE 1 END,
    CASE WHEN p_pro_priority_featured AND c.plan = 'pro' THEN 0 ELSE 1 END,
    random()
$function$;

DROP POLICY IF EXISTS "contractors can read their own trade's lead broadcasts" ON realtime.messages;

CREATE POLICY "contractors can read their own trade's lead broadcasts"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'leads:%'
    AND EXISTS (
      SELECT 1
      FROM public.contractors c
      WHERE c.id = auth.uid()
        AND c.deleted_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.contractor_trades ct
            WHERE ct.contractor_id = c.id
              AND ct.trade_id = substring(realtime.topic() FROM 7)
          )
          OR (
            NOT EXISTS (SELECT 1 FROM public.contractor_trades ct WHERE ct.contractor_id = c.id)
            AND c.trade_type = substring(realtime.topic() FROM 7)
          )
        )
    )
  );

-- ── 4. process_account_deletion(): the per-request worker ──────────────────
--
-- Called once per eligible request, via RPC from the process-account-deletions
-- edge function. Everything in here is one Postgres transaction -- either
-- it all lands or none of it does. Idempotent by construction (every
-- UPDATE sets a fixed value, every DELETE is a no-op on already-gone
-- rows), so a retry after a storage/auth failure downstream is safe:
-- re-running this function does nothing new, it just re-confirms the
-- state and returns the same storage targets again.
--
-- Deliberately does NOT touch auth.users' email or ban_duration -- that
-- has to go through the real Admin API (auth.admin.updateUserById) from
-- the edge function, not a direct write here, so GoTrue's own
-- email-uniqueness/email_change-token invariants stay consistent.
CREATE OR REPLACE FUNCTION public.process_account_deletion(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req record;
  v_uid uuid;
  v_is_contractor boolean;
  v_is_customer boolean;
  v_active_reason text;
  v_storage jsonb;
BEGIN
  SELECT * INTO v_req FROM account_deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_pending');
  END IF;
  IF v_req.scheduled_delete_at > now() THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_due');
  END IF;

  v_uid := v_req.user_id;
  v_is_contractor := EXISTS(SELECT 1 FROM contractors WHERE id = v_uid);
  v_is_customer   := EXISTS(SELECT 1 FROM users WHERE id = v_uid);

  -- Active obligations: defer, don't touch anything, log why. bookings
  -- and work_orders are checked against the FULL non-terminal status set,
  -- not just 'in_progress' -- bookings.status and work_orders.status/wo_status
  -- are known to drift out of sync (documented in docs/PAYMENT_FLOW_STATE.md),
  -- so trusting only one column's "in progress" value isn't safe here.
  SELECT string_agg(reason, '; ') INTO v_active_reason FROM (
    SELECT 'active booking ' || id AS reason FROM bookings
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND status NOT IN ('completed','declined','cancelled')
    UNION ALL
    SELECT 'active work order ' || id FROM work_orders
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND status NOT IN ('completed','cancelled')
    UNION ALL
    SELECT 'held payment on booking ' || id FROM bookings
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND payment_status = 'held'
    UNION ALL
    SELECT 'unsettled payment_intent ' || pi.id FROM payment_intents pi
      JOIN bookings b ON b.id = pi.booking_id
      WHERE (b.customer_id = v_uid OR b.contractor_id = v_uid)
        AND pi.status NOT IN ('captured','released','refunded')
    UNION ALL
    SELECT 'open dispute ' || id FROM disputes
      WHERE (customer_id = v_uid OR contractor_id = v_uid)
        AND status <> 'resolved'
  ) reasons;

  IF v_active_reason IS NOT NULL THEN
    UPDATE account_deletion_requests
      SET defer_reason = v_active_reason, last_attempted_at = now()
      WHERE id = p_request_id;
    RETURN jsonb_build_object('deferred', true, 'reason', v_active_reason);
  END IF;

  -- Anonymize records the counterpart still needs to see.
  UPDATE bookings    SET customer_name   = 'Deleted User' WHERE customer_id   = v_uid;
  UPDATE bookings    SET contractor_name = 'Deleted User' WHERE contractor_id = v_uid;
  UPDATE work_orders SET customer_name   = 'Deleted User' WHERE customer_id   = v_uid;
  UPDATE work_orders SET contractor_name = 'Deleted User' WHERE contractor_id = v_uid;
  UPDATE reviews     SET reviewer_name   = 'Former customer' WHERE customer_id = v_uid;
  UPDATE messages    SET sender_name     = 'Deleted User' WHERE sender_id = v_uid;

  -- payments, payment_intents, payment_events, cancellations, refund_requests,
  -- disputes, job_offers, tos_acceptances, contractor_penalties: retained
  -- untouched -- financial/audit/legal record, or (tos_acceptances) proof
  -- of consent that should outlive the account, per plan.

  -- Delete data that's exclusively theirs, no counterpart, no legal hold.
  DELETE FROM notifications         WHERE user_id = v_uid;
  DELETE FROM availability          WHERE contractor_id = v_uid;
  DELETE FROM contractor_schedule   WHERE contractor_id = v_uid;
  DELETE FROM contractor_locations  WHERE contractor_id = v_uid;
  DELETE FROM contractor_portfolio  WHERE contractor_id = v_uid;
  DELETE FROM contractor_trades     WHERE contractor_id = v_uid;
  DELETE FROM contractor_verification WHERE contractor_id = v_uid;
  DELETE FROM job_views             WHERE contractor_id = v_uid;
  DELETE FROM time_slots            WHERE contractor_id = v_uid;
  DELETE FROM subscriptions         WHERE contractor_id = v_uid;
  -- contractor_earnings is a view (derived from payments, already
  -- retained), not a table -- nothing to delete there.
  DELETE FROM portfolio_jobs        WHERE contractor_id = v_uid;
  DELETE FROM customer_coupons      WHERE user_id = v_uid;
  DELETE FROM job_match_logs        WHERE user_id = v_uid;
  DELETE FROM contact_messages      WHERE user_id = v_uid;
  DELETE FROM payment_waitlist      WHERE user_id = v_uid;
  DELETE FROM otp_codes             WHERE user_id = v_uid;
  DELETE FROM support_messages      WHERE user_id = v_uid;
  -- booking_calendar is a thin updatable view directly over bookings (no
  -- join, no aggregate) -- deleting "from" it deletes the real booking
  -- row underneath via Postgres's auto-updatable-view rules. bookings
  -- is already handled above (anonymized, not deleted) -- confirmed live
  -- this was silently destroying the exact "completed booking the other
  -- side still sees" data the plan says to keep, before this fix.
  DELETE FROM contractor_employees  WHERE user_id = v_uid;
  DELETE FROM employees             WHERE auth_user_id = v_uid;

  -- Compute exactly which storage objects belong to this user, straight
  -- from storage.objects rather than guessing path conventions -- this
  -- is what a naive "delete by user_id prefix" approach misses for
  -- verification-docs (nested one level deeper, under verification/) and
  -- work-orders (not keyed by user at all, only resolvable via the
  -- work_orders table).
  SELECT jsonb_build_object(
    'avatars',             COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'avatars' AND name LIKE v_uid::text || '/%'), '{}'),
    'job-photos',          COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'job-photos' AND name LIKE v_uid::text || '/%'), '{}'),
    'portfolio',            COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'portfolio' AND name LIKE v_uid::text || '/%'), '{}'),
    'portfolio-completed', COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'portfolio-completed' AND name LIKE v_uid::text || '/%'), '{}'),
    'verification-docs',   COALESCE((SELECT array_agg(name) FROM storage.objects WHERE bucket_id = 'verification-docs' AND name LIKE 'verification/' || v_uid::text || '/%'), '{}'),
    'work-orders',         COALESCE((
      SELECT array_agg(o.name) FROM storage.objects o
      WHERE o.bucket_id = 'work-orders'
        AND EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE (wo.customer_id = v_uid OR wo.contractor_id = v_uid)
            AND o.name LIKE wo.id::text || '/%'
        )
    ), '{}')
  ) INTO v_storage;

  -- Auth-layer cleanup that doesn't go through the Admin API (see file
  -- header). Never touches auth.users itself.
  DELETE FROM auth.identities WHERE user_id = v_uid;
  DELETE FROM auth.sessions WHERE user_id = v_uid;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;

  -- Anonymize the identity row itself -- never delete it (bookings.customer_id,
  -- reviews.contractor_id, messages, work_orders all still point at this id).
  IF v_is_customer THEN
    UPDATE users SET
      full_name = 'Deleted User',
      username = 'deleted-' || substr(v_uid::text, 1, 8),
      email = 'deleted-' || v_uid::text || '@invalid',
      phone = NULL, avatar_url = NULL, location = NULL, lat = NULL, lng = NULL,
      last_location_update = NULL, push_token = NULL,
      referral_source = NULL, referral_code = NULL,
      two_factor_phone = NULL, two_factor_enabled = false,
      deleted_at = now()
    WHERE id = v_uid;
  END IF;

  IF v_is_contractor THEN
    UPDATE contractors SET
      company_name = 'Deleted Contractor', legal_name = NULL,
      username = 'deleted-' || substr(v_uid::text, 1, 8),
      email = 'deleted-' || v_uid::text || '@invalid',
      phone = NULL, avatar = NULL, avatar_url = NULL, banner_url = NULL,
      website = NULL, tagline = NULL, description = NULL, experience = NULL,
      location = NULL, address = NULL, business_city = NULL, business_state = NULL,
      service_area = NULL, service_areas = NULL,
      license_number = NULL, license_expiration = NULL, license_county = NULL,
      license_state = NULL, license_url = NULL, insurance_url = NULL,
      lat = NULL, lng = NULL, commercial_lat = NULL, commercial_lng = NULL,
      service_area_lat = NULL, service_area_lng = NULL, last_location_update = NULL,
      push_token = NULL, company_tag = NULL, company_pin_hash = NULL,
      is_available = false, is_online = false, show_on_map = false,
      profile_published = false, accepts_bookings = false,
      deleted_at = now()
    WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'processed', true,
    'user_id', v_uid,
    'role', v_req.role,
    'is_customer', v_is_customer,
    'is_contractor', v_is_contractor,
    'storage_targets', v_storage
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_account_deletion(uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Sweep: finds due requests, fires the edge function per-request ──────
--
-- Mirrors sweep_auto_approve_work_orders's own shape exactly (same
-- internal-secret retrieval, same per-row net.http_post loop). Each
-- net.http_post is async and independent -- one request's edge-function
-- failure doesn't block the next iteration of this loop from firing.
CREATE OR REPLACE FUNCTION public.sweep_account_deletions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_internal_secret text;
BEGIN
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_secret';

  FOR v_req IN
    SELECT id FROM public.account_deletion_requests
    WHERE status = 'pending' AND scheduled_delete_at <= now()
  LOOP
    PERFORM net.http_post(
      url := 'https://linqsojbszglbgpoxgtv.supabase.co/functions/v1/process-account-deletions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-tradease-internal', v_internal_secret
      ),
      body := jsonb_build_object('request_id', v_req.id),
      -- Default pg_net timeout (5s) isn't enough for a full anonymization
      -- pass (~20 statements) plus the Admin API call plus storage
      -- removal, especially on a cold isolate -- confirmed live, both
      -- real test requests timed out at the default before this.
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_account_deletions() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('sweep-account-deletions', '0 * * * *', 'SELECT public.sweep_account_deletions()');
