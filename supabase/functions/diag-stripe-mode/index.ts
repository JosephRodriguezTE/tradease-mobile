// Neutralized 2026-09-22 -- this was a temporary diagnostic that leaked
// live Stripe key mode (livemode true/false) and Stripe error details to
// any unauthenticated caller; its own comment said it would be deleted
// after use and never was. No delete-function tool was available, so
// this stub replaces it in place: no Stripe call, no env access, nothing
// to leak. verify_jwt: true also makes the platform gateway require a
// valid JWT before this body ever runs. Delete the function for real via
// the Supabase dashboard when convenient.
Deno.serve(() => new Response('Gone', { status: 410 }));