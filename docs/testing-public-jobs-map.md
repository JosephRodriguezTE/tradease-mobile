# Testing the public jobs map (two-account script)

Covers: customer posts a job with the map-visibility toggle, contractor reads it back through `public_jobs_nearby()`. Needs two real accounts — one customer, one contractor — both signed in on a device with location permission granted.

Before starting, note the live app's job pins/badges are a fixed orange for every trade (`app/(tabs)/map.tsx`'s `jobPin`/`jobBadge` styles use `C.orange` unconditionally) — this was true before this change and wasn't touched, since the task was "don't restructure anything else in that file." Per-trade pin coloring exists only in the unwired `app/(tabs)/map.new.tsx` rewrite. So Test 2 below checks the trade **label**, not a trade **color** — there isn't one to check yet on the live screen. Say the word if you want that added as a follow-up.

Also note: `nearest_major_road` will be blank for every job posted through this flow. `create-job.tsx` only populates `town` (reverse-geocoded from the address) — see the main report for why `nearest_major_road` was deliberately left null rather than using the reverse-geocoded street name.

---

## Test 1 — toggle off, job must NOT appear

1. **Customer account:** Create Job → pick a trade and service → Details step → leave **"Make this job public"** off (it's off by default) → fill in budget/time/a real, complete address → Post Job.
2. **Contractor account:** open the Map tab, pull to refresh (or force-close and reopen).
3. **Expected:** the job does not appear on the map or in the list view, at any radius or trade filter setting.

This confirms two independent layers are both working: `is_public = false` excludes it from `public_jobs_nearby()`, and — separately — the contractor can't fall back to seeing it via a direct table read, because RLS no longer grants browsing contractors row access to `bookings` at all.

## Test 2 — toggle on, job must appear with the right trade and a plausible area label

1. **Customer account:** Create Job again. In the Details step, before posting, confirm the helper text reads exactly:
   > Public jobs show up on the map so nearby pros can find you. Your address stays hidden — the map shows a general area until you hire someone.
2. Turn **"Make this job public"** on. Use a real, complete street address (geocoding needs enough to resolve — city + state alone may not).
3. Post Job.
4. **Contractor account:** Map tab, pull to refresh.
5. **Expected:**
   - The job appears within a normal refresh — no propagation delay, it's a live query.
   - The trade label matches what you selected (e.g. "HVAC", "Electrical") — exact casing, since the RPC does an exact string match against `bookings.trade`.
   - Opening the list view, the job card shows an area label under the "Approximate location…" line — either just a town name, or "Town — near Road" if `nearest_major_road` is ever populated later. Never blank, never the literal word `null`.

## Test 3 — pin is visibly offset from the real address

1. Note the real address you posted from Test 2.
2. Find its approximate true position (Google Maps or similar).
3. On the contractor's map, zoom in on the job's pin.
4. **Expected:** the pin sits some distance from the true building — not on top of it. The offset is deterministic and bounded at 600m (`JOB_FUZZ_RADIUS_M` in `lib/map/location-privacy.ts`), so it'll be somewhere in that radius, in a consistent spot every time you reload — not jumping around between refreshes.

## Test 4 — no customer name anywhere on the job card

1. On the contractor account, open the job from both the map pin tap and the list view.
2. **Expected:** no customer name, phone number, or "posted by" text anywhere on the card. There's nothing being hidden by the UI — `public_jobs_nearby()` never returns `customer_id` or anything joined from the customer, so there's no data for a card to display even if one tried.

---

## If a job doesn't show up — check in this order

Cheapest and most likely first:

1. **`is_public`** — the single most common miss, since it's off by default and easy to forget to toggle.
   ```sql
   SELECT id, is_public FROM bookings WHERE id = '<job_id>';
   ```
   Must be `true`.

2. **`status` / `contractor_id`** — has to be pending and unclaimed.
   ```sql
   SELECT status, contractor_id FROM bookings WHERE id = '<job_id>';
   ```
   Must be `status = 'pending'` and `contractor_id IS NULL`. A job saved as a draft, or one that's already been claimed, will never show regardless of `is_public`.

3. **`request_expires_at`** — posted jobs expire.
   ```sql
   SELECT request_expires_at FROM bookings WHERE id = '<job_id>';
   ```
   Must be `NULL` or in the future. "Post Job" gives a 48h window, "Find a Contractor" gives 24h.

4. **`job_lat` / `job_lng`** — geocoding can fail silently.
   ```sql
   SELECT job_lat, job_lng FROM bookings WHERE id = '<job_id>';
   ```
   Both must be non-null. `create-job.tsx` swallows geocoding errors (`catch {}`), so an address that doesn't resolve just leaves these null with no user-facing error — try a more complete address (street number + city + state).

5. **Radius** — check the radius chip selected on the contractor's map (10/25/50mi) against the actual distance between the contractor's current location and the job's real coordinates. `public_jobs_nearby()` filters on the true coordinates before fuzzing, so this is a real distance check, not an artifact of the fuzz offset.

6. **Trade filter** — check whether a trade chip is active on the contractor's map, and that it exactly matches the job's `trade` value. The match is case-sensitive (`b.trade = trade_filter`) — `"HVAC"` will not match a filter of `"hvac"`.

7. **RLS / grants** — last resort, since this was verified working end-to-end before this change shipped. Confirm the contractor is actually signed in with a real session (`public_jobs_nearby()` is granted to `authenticated` only, not `anon` — a logged-out/guest browse will get a permission error, not an empty list). If it's still not working, confirm the grant hasn't regressed:
   ```sql
   SELECT grantee, privilege_type FROM information_schema.routine_privileges
   WHERE routine_name = 'public_jobs_nearby';
   ```
   Should list `authenticated`, `postgres`, `service_role` — not `anon`.
