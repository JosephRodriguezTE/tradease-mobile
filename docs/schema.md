# Tradease — Database Map (schema.md)

> Plain-English map of what Tradease stores and where. Claude Code reads this so it
> stops guessing table and column names. **Keep it accurate.** When the database
> changes, update this file (or have Claude Code regenerate it from the live DB).
>
> HOW TO FILL THIS IN: run the Part 3.1 prompt from the prompt playbook. It reads
> your live database (project `linqsojbszglbgpoxgtv`) and fills every section below.
>
> ⚠️ STATUS: no Supabase MCP tool has been available in any session so far, so
> nothing below has been confirmed against the LIVE database yet. Everything marked
> "from code" was verified by reading actual insert/select/update calls in both
> repos (`tradease3`, `New folder`) — real, but not the same as reading the live
> schema, which could hold columns/constraints/RLS neither client's code touches.
> Everything marked ⚠️ UNCONFIRMED still needs the live query.

---

## How to read this file
- **Table** = a category of information (like a labeled drawer).
- **Column** = one piece of info in that drawer (like "customer name" or "price").
- **RLS** = the locks that decide who is allowed to see or change each row.
- **View** = a saved window that shows a filtered slice of data without exposing the rest.

---

## ❌ Correction: there is no `jobs` table

The original draft of this file assumed a `jobs` table. Neither codebase has ever
queried a table by that name — every job posting lives in **`bookings`**. Renamed
below. If a separate `jobs` table genuinely exists live and neither client uses it
yet, that's important to know — flag when you paste the live table list.

## bookings
A customer's posted job. (From code — `tradease3/app/create-job.tsx`,
`New folder/app/create-job/page.tsx`, `New folder/app/book/page.tsx`,
`New folder/components/BookingModal.tsx`, plus every read site in both repos.)

Columns confirmed from code:
`id, customer_id, user_id, contractor_id, customer_name, customer_phone,
trade, description, specializations (text[]), notes, job_address, job_lat, job_lng,
price_estimate, payout_max, booking_time, scheduled_at, urgency, is_instant_book,
instant_book_price, photo_urls, status, payment_status, refund_status,
customer_rating, accepted_by_employee_id, contractor_name, created_at,
accepted_at, confirmed_at, completed_at`

Status values seen written in code: `draft` (mobile-only, never reaches the server
as a real job until promoted) → `pending` → `confirmed` → ... → `completed` →
`approved` | `disputed` (per `SKILL.md`'s RLS policy for `bookings` UPDATE); also
`cancelled`. See `docs/state-machine.md` for how these do/don't map to the new
9-state design.

⚠️ Known existing bug, unrelated to this project: mobile writes the address into
`notes`, never into `job_address`; the website writes `job_address` correctly.
Both are tolerated on read (`booking.job_address || booking.notes`) but this means
`job_address` is silently empty on every mobile-created booking today.

RLS: ⚠️ UNCONFIRMED live, but `SKILL.md` documents the intended fix (Fix 1F) —
customer can update only while `status = 'pending'`, or move `completed → approved`
or `completed → disputed`; contractor can update own booking but is blocked by a
trigger from reassigning `customer_id`/`contractor_id`. **Whether this fix has
actually been applied to the live database is unknown** — flagged as CRITICAL in
the security note above.

## job_offers
A contractor's quote on a booking. This table was NOT in the original draft at all —
it's real, heavily used, and important: **this is where offer accept/decline/counter
actually happens**, not on `bookings` directly.

Columns confirmed from code (`tradease3/app/job-offer/contractor.tsx`,
`app/job/[id].tsx`, `app/(tabs)/contractor-home.tsx`, `app/job-board.tsx`):
`id, booking_id, contractor_id, customer_id, quoted_price, quote_note, status,
customer_action, contractor_final, expires_at, scheduled_at, booking_time,
counter_price, counter_note, counter_expires_at`

Status values seen: `quoted` → `accepted` | `declined` | `countered`.
`customer_action` / `contractor_final` are separate parallel fields, each also
`pending` | `accepted` | `declined` | `countered`.

⚠️ "expiry — FRAGILE" per the original draft: `expires_at` is set explicitly by
client code (a computed timestamp, e.g. `Date.now() + N`), not a database column
default as the draft implied. The actual fragility, if any, is unconfirmed — could
be about what (if anything) auto-expires a quote past `expires_at` server-side.
No cron/edge function doing that was found in either repo. Needs your memory of
what actually broke here, or a live check for a pg_cron job / edge function.

RLS: **CRITICAL, per `SKILL.md` Fix 1C — was "fully open"** (any user could read or
write any contractor's quotes). Fix documented but application status live is
unconfirmed. See security note at the top of this conversation.

## work_orders
Created once a job_offer is accepted (`app/job/[id].tsx:294`, upserted on
`booking_id`, `ignoreDuplicates: true`).

Columns confirmed from code:
`id, booking_id, contractor_id, customer_id, service_type, job_address,
contractor_name, customer_name, wo_status, line_items (jsonb array),
billing (jsonb: subtotal/feeRate/feeAmount/taxRate/taxAmount/total)`

⚠️ Correction: prior memory said the status column was named `status` — the real
column, per code, is **`wo_status`** (seen set to `'accepted'` at creation).

Access-detail fields also live here per the mobile/website work-order screens:
`gate_code, pets_note, parking_note, special_instructions` — all currently
**always null**, no write path exists anywhere in either repo (see Part 4 plan —
these need new `bookings` columns instead, populated at job-creation time, then
copied here at accept-time).

## contractors
(From existing verified memory, `supabase-schema.md` — 41 days old, not re-verified
this session.) `id, company_name, username, trade_type, specializations (jsonb),
is_available, is_online, lat, lng, last_location_update, verification_status,
verification_submitted_at, rating (defaults 5.0), push_token, plan, years_in_business,
bio, profile_published, specialties (text[]), avatar_url`

RLS: **CRITICAL, per `SKILL.md` Fix 1B** — plan upgrades could reportedly be
self-granted (bypassing the paywall) unless a `prevent_plan_self_update` trigger is
in place. Application status live unconfirmed.

## subscriptions
Not seen directly in either app codebase's client-side queries (likely
server/webhook-managed), but referenced in `SKILL.md` Fix 1A as **the single worst
RLS vulnerability found** — described as allowing broad read/write with no
`contractor_own_sub` ownership check. Needs a live check for current policy state.
No column list available from code — needs the live schema.

## users
Drives role resolution (`useRole()`: contractors → contractor_employees → users →
auth metadata). ⚠️ UNCONFIRMED from code this session: the original draft's claim
that `role` has a defaulting/overwrite bug ("never default to customer, never
overwrite on update"). This is asserted from your own prior experience, not
something I independently re-verified in code this pass — worth confirming still
applies before treating it as current.

## contractor_penalties, refund_requests, notifications, time_slots, cancellations, contact_messages
All referenced only in `SKILL.md`'s RLS section (Fixes 1D–1J), not queried directly
by name in a way I traced column-by-column this session. Each is flagged there as
having an overly-permissive policy ("fully open," "anyone can approve," "everyone
reads everyone's"). No column lists available without the live schema.

## contractor_profiles (VIEW — SECURITY DEFINER)
⚠️ UNCONFIRMED — not referenced anywhere in either repo's client code, and not
mentioned in `SKILL.md` either. Either it exists live and is only used by an Edge
Function / raw SQL neither client touches, or it doesn't exist yet and this was
aspirational in the original draft. Needs the live table list to resolve.

## <fill: other tables>
`SKILL.md` also implies these exist, unconfirmed column-level: `reviews`,
`disputes` (listed as MISSING — table may not exist yet), `contractor_schedule`,
`contractor_portfolio`, `contractor_verification` — the last three are in the
41-day-old verified memory and not re-checked this session.

---

## Storage buckets
Confirmed from code, both repos: `job-photos`, `portfolio` (mobile) /
`portfolio-photos` (per `SKILL.md` — **name mismatch between the two repos'
references worth double-checking live**), `avatars`, `work-orders` (mobile) /
paired with a `work_order_media` metadata table, `verification-docs`.

## Known fragile spots
- `users.role` defaulting/overwriting — asserted, not re-verified this session
- `job_offers.expires_at` — asserted fragile, mechanism of the actual bug unconfirmed
- portfolio photo storage path — asserted fragile, not re-verified this session
- the `match-job` edge function swallowing a 401 instead of erroring — **this one IS
  independently confirmed**, `SKILL.md` section 3 shows the current code has no auth
  check at all on that function, which is a stronger problem than "swallows a 401"
  (there's nothing there to swallow — it's simply unauthenticated)
- the `contractor_profiles` SECURITY DEFINER view — existence itself unconfirmed, see above
- **CRITICAL, newly surfaced this session**: the full RLS vulnerability list in
  `SKILL.md` Section 1 (subscriptions, contractors, job_offers, contractor_penalties,
  refund_requests, bookings, notifications, time_slots, cancellations,
  contact_messages) — unknown whether these fixes have been applied live
