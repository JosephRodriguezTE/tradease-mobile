# 2FA is bypassable — stopgap applied, real fix backlogged

Written 2026-09-27, both repos.

## The bug

`signInWithPassword()` creates a real, valid Supabase session immediately.
The 2FA check only runs *after* that, purely in application code (website
`app/login/page.tsx`, mobile `app/login.tsx` → `check2FA()`), and only
decides which screen to navigate to next. Nothing server-side blocks access
before the code is entered — a user who has 2FA enabled can complete
`signInWithPassword`, then navigate straight to a dashboard URL instead of
following the app's own redirect, and skip the code entirely. The
`tradease_2fa` cookie mentioned in the original report is set and never
read by anything — dead weight, not an enforcement mechanism.

## Stopgap applied today

Confirmed live (`SELECT count(*) FILTER (WHERE two_factor_enabled) FROM
users` → 0 of 4 total users) that nobody is enrolled, so there is no
existing exposure to protect against — the only real problem was offering a
security feature that doesn't work. Hid the enrollment toggle so no one can
newly enroll into a broken guarantee:

- Website: removed the "Two-Factor Authentication" card from
  `app/dashboard/_settings/SecuritySection.tsx`, and removed the automatic
  post-signup `TwoFAEnrollModal` prompt from `app/signup/page.tsx`.
- Mobile: replaced the interactive 2FA card in `app/profile/security.tsx`
  with a static "Coming soon" state, and removed the automatic
  once-per-user `TwoFAEnrollSheet` prompt from `app/(tabs)/_layout.tsx`.

Left in place, deliberately, so nothing breaks: `/api/2fa/send`,
`/api/2fa/verify`, `/api/2fa/disable`, the `otp_codes` table, the
`users.two_factor_enabled`/`two_factor_method` columns, the login-time
`check2FA()` path on both platforms, and the now-unreferenced
`components/TwoFAEnrollSheet.tsx` (mobile) / `components/TwoFAEnrollModal.tsx`
(website) files. None of this is reachable without the enrollment entry
points, and all of it is superseded by the rebuild below rather than worth
patching in place.

## Recommendation for the real fix (not built yet)

**Move to Supabase Auth MFA, enforced at AAL2, authenticator apps (TOTP)
only — not the current custom email/SMS OTP design.**

Why this over patching the existing flow: the underlying weakness isn't
just "the check runs client-side too late" — it's that the whole mechanism
lives in application code with no way for RLS or any other server-side gate
to know a login is mid-verification. Supabase's own MFA sits at the auth
layer: a session's AAL (Authentication Assurance Level) is a real, signed
claim the JWT carries, and RLS policies can require `auth.jwt()->>'aal' =
'aal2'` directly — the guarantee is enforced by Postgres itself, not by
which screen the client app happens to navigate to next. TOTP over
email/SMS OTP removes the two dependencies this custom implementation has
on send reliability (email deliverability, SMS cost/carrier issues) and
matches what users already expect from an authenticator app.

**As part of that migration, delete:**
- `otp_codes` table
- `/api/2fa/send`, `/api/2fa/verify`, `/api/2fa/disable` routes
- `users.two_factor_enabled`, `users.two_factor_method` columns
- `components/TwoFAEnrollSheet.tsx`, `components/TwoFAEnrollModal.tsx`
- The `tradease_2fa` cookie reference and the login-time `check2FA()` /
  `/2fa-verify` custom flow on both platforms, replaced by Supabase's own
  challenge/verify calls gated on AAL2.

**Cross-repo dependency:** mobile calls the same `/api/2fa/*` endpoints the
website hosts (`lib/twoFAApi.ts`, via `EXPO_PUBLIC_API_URL` — there is no
separate mobile backend). The two apps share one auth backend and must
switch to Supabase MFA together in the same change window; shipping one
side without the other leaves the other calling routes that no longer
exist.

Not scheduled. This document exists so the recommendation survives until
someone picks it up — do not re-derive it from scratch.
