---
name: grill-me
description: A relentless interrogation that hunts for security holes, broken logic, and unjustified assumptions in a plan, design, or codebase. For Tradease, applies to the Expo app and the Next.js website. Use when asked to "grill this", "find the holes", "audit this", "stress-test this", or before shipping anything to real users.
metadata:
  argument-hint: <file-or-pattern-or-flow-description>
disable-model-invocation: true
---

# Grill Me

This is not a friendly code review. The job is to find what breaks, what's exploitable, and what nobody actually verified — by asking the same questions a hostile reviewer, a malicious user, or an unlucky production incident would ask. A clean pass that didn't survive real interrogation is not a clean pass.

## How to run this

1. Identify the target — a specific file/folder, a feature, a flow ("job acceptance", "employee invites", "the booking flow"), or the whole app/website if the user just says "grill the app" or "grill the website".
2. Read every file actually involved before asking a single question. Do not interrogate code you have not read.
3. Work through the relevant categories below.
4. For every category, ask the listed questions against the real code — not in the abstract. If the answer is "nothing stops this" or "I'm not sure," that is a finding.
5. Do not soften findings. Do not lead with what's good. State the hole, where it lives, why it's exploitable or breakable, and what it would take to actually break it — a concrete reproduction, not a vague worry.
6. Rank severity honestly: Critical (money, data, or account takeover), High (broken core flow, real users will hit this), Medium (edge case that will eventually bite), Low (sloppy but not dangerous).

## Categories to interrogate

### 1. Auth & Role Resolution
- Can a customer account ever see `isContractor = true` or vice versa? Walk the exact resolution order in `useRole()` and find the gap.
- Can an employee account impersonate the owner — does anything check `isOwner` server-side, or only client-side in the UI?
- What happens if `employerContractorId` is null but `isEmployee` is true?
- Can a suspended or removed employee (`status = 'suspended'`) still hit a Supabase query successfully because the RLS policy only checks `user_id` and not `status`?
- Is there any client-side-only gate that isn't also enforced by an RLS policy or DB trigger? If the only thing stopping an unverified contractor from accepting jobs is a UI modal, write the exact `bookings` UPDATE that bypasses it.

### 2. Row Level Security & Database
- For every table: does the policy check `auth.uid()` correctly, or does it trust a client-supplied column for an authorization decision?
- Is there a single table without RLS enabled? Name it.
- Do any `SECURITY DEFINER` functions skip re-checking permissions inside the function body, so anyone who can call them inherits elevated privilege?
- Can a contractor `UPDATE` a booking belonging to another contractor by guessing or enumerating IDs?
- Can any trigger be abused by repeatedly toggling a status the client controls?

### 3. Payment & Billing Logic
- Walk the exact fee-tier calculation. What happens at the exact boundary between tiers — off-by-one in either direction?
- Can a contractor edit a line item to negative, zero, or an absurd number, and does the trigger recompute correctly or trust the submitted total?
- Race condition: two contractors tap Accept on the same job within the same second. Does `UPDATE ... WHERE contractor_id IS NULL` actually prevent both from succeeding?
- The 24-hour auto-approve window — what timezone, and what if client/server clocks disagree?
- Can a customer dispute after a work order is already `approved`? What state does billing end up in?

### 4. Edge Functions & Secrets
- For every deployed Edge Function: if `verify_jwt` is false, does the function body implement its own auth check, or is it open to anyone with the URL?
- Does any function log or return a raw error that leaks a secret, a stack trace, or internal table structure?
- Is any API key or service role key ever sent to the client instead of staying server-side?

### 5. Plan Gating & Verification Bypass
- Are photo/employee limits enforced only in a React constant, or also by a database trigger? If only client-side, what's the exact direct Supabase call that bypasses it?
- Can a contractor set `plan = 'pro'` directly without going through the real upgrade flow?
- Can an unverified contractor still appear in the job feed or nearby-contractor queries because a filter was forgotten somewhere?

### 6. Messaging & Privacy
- Can User A subscribe to a `chat_id` that doesn't include their own ID, by guessing the sorted-pair format?
- Is the 3-message-before-booking limit enforced server-side, or only by hiding the input box — meaning a raw insert still works after message 3?
- Can an employee account see the owner's private customer conversations?

### 7. Concurrency & State
- Contractor accepts a job, then loses connection before the system message insert completes — is the job left in a half-accepted state?
- Customer cancels the instant a contractor accepts — which write wins, and does the loser get a silent failure?
- If a job's scheduled date changes after a calendar entry was created, does the entry update or go stale?

### 8. UX Reliability (especially the website)
- Walk every route. Any route with nothing linking to it, or a link pointing to a route that doesn't exist?
- Does every Supabase query in a Server Component handle the null/error case, or does a failed fetch produce a blank page or unhandled exception?
- Any component reading `Date.now()`, `Math.random()`, or browser-only APIs during server render that will mismatch on hydration?
- Can any form's submit button be double-tapped to submit twice?

### 9. The Unjustified Assumption Hunt
Find every place the code assumes a value exists (`data.foo` with no null check, `.single()` with no error handling, a `!` non-null assertion) and ask what happens in production the day that assumption is wrong.

## Output format

Group by severity, not by file. Inside each severity: `file:line — what breaks — how to actually trigger it`.

\```
## Critical

lib/bookingService.ts:84 — two contractors can accept the same job — near-simultaneous UPDATE requests with contractor_id IS NULL; no unique constraint or row lock backs the check

## High

hooks/useRole.ts:41 — employerContractorId can be null while isEmployee is true — queries using it as a foreign key silently return nothing instead of erroring

## Medium
...

## Low
...
\```

If a category was checked and nothing broke, say so in one line: `## Messaging & Privacy — no holes found, server-side checks confirmed`. Don't pad it with praise.

End with one direct sentence: the single worst thing in this audit, and what it would cost — money, data, or trust — if a real user hit it first.