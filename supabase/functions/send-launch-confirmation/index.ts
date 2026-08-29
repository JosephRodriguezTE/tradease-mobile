// Supabase Edge Function — send-launch-confirmation
// Triggered by public.trigger_send_launch_confirmation() (AFTER INSERT trigger
// on launch_signups), via net.http_post — not a platform Database Webhook.
// See supabase/migrations for the trigger function; it reads the internal
// secret from Vault at fire time rather than baking a JWT into the trigger
// definition.
//
// Internal-only: authenticated via x-tradease-internal, matching
// charge-customer and send-push-notification. Deployed with verify_jwt:
// false — the platform's JWT gate would otherwise reject this header
// before the function body ever runs, since x-tradease-internal isn't a
// JWT and isn't sent as Authorization.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { getServiceKey } from '../_shared/secretKey.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = getServiceKey()
const INTERNAL_SECRET = 'trd_int_8f3a9c2e7b41d6f0a5c8e2b9d4f7a1c3e6b8d0f2a4c7e9b1d3f5a7c9e1b3d5f7'

interface LaunchSignup {
  id: string
  email: string | null
  phone: string | null
  name: string | null
  role: string | null
  zip: string | null
}

function mask(s: string | null | undefined): string {
  if (!s) return '(empty)'
  return `len=${s.length} starts="${s.slice(0, 12)}" ends="${s.slice(-6)}"`
}

serve(async (req: Request) => {
  console.log('[send-launch-confirmation] Incoming request — method:', req.method)

  if (req.method !== 'POST') {
    console.error('[send-launch-confirmation] REJECTED — wrong method:', req.method)
    return new Response('Method Not Allowed', { status: 405 })
  }

  const providedSecret = req.headers.get('x-tradease-internal')
  if (providedSecret !== INTERNAL_SECRET) {
    console.error(
      '[send-launch-confirmation] REJECTED — internal secret mismatch. received:',
      mask(providedSecret),
      'expected:',
      mask(INTERNAL_SECRET),
    )
    return new Response('Unauthorized', { status: 401 })
  }
  console.log('[send-launch-confirmation] Auth OK')

  try {
    const webhook = await req.json()
    console.log('[send-launch-confirmation] Raw payload:', JSON.stringify(webhook))

    // Trigger sends { record: {...} }, matching the old Database Webhook envelope shape.
    const signup: LaunchSignup = webhook.record ?? webhook
    console.log('[send-launch-confirmation] Resolved signup row:', JSON.stringify(signup))

    if (!signup?.id) {
      console.error('[send-launch-confirmation] No signup record in payload — check the raw payload logged above, the record shape may not match what this function expects')
      return new Response(JSON.stringify({ error: 'missing_record' }), { status: 400 })
    }

    // Phone-only signups get nothing yet — texting isn't live.
    if (!signup.email) {
      console.log('[send-launch-confirmation] DECISION: skip — no email on signup', signup.id, 'email value was:', JSON.stringify(signup.email))
      return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), { status: 200 })
    }
    console.log('[send-launch-confirmation] DECISION: send — email present:', signup.email, 'role:', signup.role)

    console.log('[send-launch-confirmation] Invoking send-email for', signup.id)
    // Plain fetch with an explicit Authorization header, not
    // supabase.functions.invoke() -- invoke() did not reproduce a
    // matching Authorization: Bearer <SERVICE_KEY> header for send-email's
    // own manual string-comparison auth check once SERVICE_KEY became an
    // sb_secret_ value, and returned a 401 with no other explanation.
    // A direct fetch removes the SDK's own header handling as a variable.
    const sendEmailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        to: signup.email,
        subject: "You're on the Tradease launch list.",
        type: 'launch_signup_confirmation',
        data: {
          name: signup.name,
          role: signup.role,
          zip: signup.zip,
        },
      }),
    })
    const data = await sendEmailRes.json().catch(() => null)
    console.log('[send-launch-confirmation] send-email returned — status:', sendEmailRes.status, 'data:', JSON.stringify(data))

    if (!sendEmailRes.ok) {
      console.error('[send-launch-confirmation] send-email call failed:', sendEmailRes.status, JSON.stringify(data))
      return new Response(JSON.stringify({ error: (data as { error?: string })?.error ?? `send-email returned ${sendEmailRes.status}` }), { status: 502 })
    }
    if (data && (data as { stub?: boolean }).stub) {
      console.warn('[send-launch-confirmation] send-email responded with stub:true — RESEND_API_KEY was not visible to send-email at send time, no real email went out')
    }

    console.log('[send-launch-confirmation] Sent to', signup.id)
    return new Response(JSON.stringify({ success: true, sendEmailResult: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-launch-confirmation] Fatal error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
