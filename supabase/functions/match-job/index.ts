// Supabase Edge Function — match-job
// Triggered by a Database Webhook on bookings INSERT (status = 'pending').
//
// Webhook setup (Dashboard → Database → Webhooks):
//   Table: bookings | Event: INSERT
//   URL: {SUPABASE_URL}/functions/v1/match-job
//   Headers: Authorization: Bearer <resolved via _shared/secretKey.ts>
//
// OR trigger via pg_net — see migration file.
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getServiceKey } from '../_shared/secretKey.ts'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = getServiceKey()
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const TOP_N = 5        // max contractors to notify
const SCORE_FROM = 30  // score pool size fed to Claude

interface Booking {
  id: string
  trade: string | null
  title: string | null
  description: string | null
  job_address: string | null
  job_lat: number | null
  job_lng: number | null
  urgency: string | null
  price_estimate: number | null
  payout_max: number | null
  specializations: string[] | null
  status: string | null
}

interface NearbyRow {
  id: string
  company_name: string | null
  is_available: boolean
  verification_status: string
  distance_miles: number | null
}

interface ContractorDetail {
  id: string
  rating: number | null
  total_bookings: number | null
  plan: string | null
  experience: string | null
  email: string | null
  push_token: string | null
  notification_prefs: Record<string, unknown> | null
  allow_notifications: boolean
}

interface MatchResult {
  contractor_id: string
  score: number
  reason: string
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = await req.json()
    // Accept both DB webhook format ({ record: {...} }) and direct call ({ booking_id })
    const bookingId: string | undefined =
      payload.booking_id ?? payload.record?.id

    if (!bookingId) {
      console.error('[match-job] Missing booking_id in payload')
      return new Response(JSON.stringify({ error: 'missing_booking_id' }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ── 1. Fetch booking ───────────────────────────────────────────────────────────────────
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, trade, title, description, job_address, job_lat, job_lng, urgency, price_estimate, payout_max, specializations, status')
      .eq('id', bookingId)
      .single()

    if (bookingErr || !booking) {
      console.error('[match-job] Booking not found:', bookingId)
      return new Response(JSON.stringify({ error: 'booking_not_found' }), { status: 404 })
    }

    if (booking.status !== 'pending') {
      console.log('[match-job] Skipping — booking status is', booking.status)
      return new Response(JSON.stringify({ skipped: true, reason: 'not_pending' }), { status: 200 })
    }

    // ── 2. Resolve coordinates (geocode if missing) ──────────────────────────────
    let lat = booking.job_lat != null ? Number(booking.job_lat) : null
    let lng = booking.job_lng != null ? Number(booking.job_lng) : null

    if ((lat === null || lng === null) && booking.job_address) {
      console.log('[match-job] Geocoding:', booking.job_address)
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(booking.job_address)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'Tradease/1.0' } }
        )
        const geoJson = await geoRes.json()
        if (Array.isArray(geoJson) && geoJson.length > 0) {
          lat = parseFloat(geoJson[0].lat)
          lng = parseFloat(geoJson[0].lon)
          await supabase.from('bookings').update({ job_lat: lat, job_lng: lng }).eq('id', booking.id)
          console.log('[match-job] Geocoded →', lat, lng)
        }
      } catch (geoErr) {
        console.warn('[match-job] Geocoding failed:', geoErr)
      }
    }

    if (lat === null || lng === null) {
      console.log('[match-job] No coordinates — cannot match')
      return new Response(JSON.stringify({ skipped: true, reason: 'no_coords' }), { status: 200 })
    }

    // ── 3. Find nearby contractors via RPC ────────────────────────────────────
    const { data: nearby, error: rpcErr } = await supabase.rpc('contractors_nearby', {
      user_lat: lat,
      user_lng: lng,
      max_miles: 50,
      trade_filter: booking.trade ?? null,
      specialty_filter: null,
    })

    if (rpcErr) {
      console.error('[match-job] contractors_nearby RPC error:', rpcErr)
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500 })
    }

    const eligible: NearbyRow[] = ((nearby ?? []) as NearbyRow[])
      .filter(c => c.is_available === true && c.verification_status === 'approved')
      .slice(0, SCORE_FROM)

    if (eligible.length === 0) {
      console.log('[match-job] No eligible contractors within range')
      return new Response(JSON.stringify({ success: true, matched: 0 }), { status: 200 })
    }

    // ── 4. Fetch rating / plan / experience for scoring ─────────────────────────
    const { data: details } = await supabase
      .from('contractors')
      .select('id, rating, total_bookings, plan, experience, email, push_token, notification_prefs, allow_notifications')
      .in('id', eligible.map(c => c.id))

    const detailMap = Object.fromEntries(
      ((details ?? []) as ContractorDetail[]).map(d => [d.id, d])
    )

    const contractors = eligible.map(c => ({
      ...c,
      rating: null as number | null,
      total_bookings: null as number | null,
      plan: null as string | null,
      experience: null as string | null,
      email: null as string | null,
      push_token: null as string | null,
      notification_prefs: null as Record<string, unknown> | null,
      allow_notifications: true,
      ...detailMap[c.id],
    }))

    // ── 5. Score with Claude ──────────────────────────────────────────────────
    const prompt = `You are a job-matching engine for a contractor marketplace.

JOB:
- Trade: ${booking.trade ?? 'Not specified'}
- Title: ${booking.title ?? 'Not specified'}
- Specializations needed: ${booking.specializations?.join(', ') || 'Not specified'}
- Budget: ${booking.price_estimate ? `$${booking.price_estimate}` : booking.payout_max ? `up to $${booking.payout_max}` : 'Not specified'}
- Urgency: ${booking.urgency ?? 'Flexible'}
- Description: ${booking.description ?? 'No description'}

AVAILABLE CONTRACTORS:
${contractors.map((c, i) => `
${i + 1}. ID: ${c.id}
   Company: ${c.company_name ?? 'Unknown'}
   Rating: ${c.rating != null ? `${c.rating}/5` : 'No rating'}
   Jobs completed: ${c.total_bookings ?? 0}
   Plan: ${c.plan ?? 'free'}
   Distance: ${c.distance_miles != null ? `${Number(c.distance_miles).toFixed(1)} miles` : 'Unknown'}
   Experience: ${c.experience ?? 'Not listed'}
`).join('')}
Score each contractor 0–100:
- Rating (higher = better; no rating = 50 baseline)
- Jobs completed (more experience = better)
- Plan tier (pro = +15pts, leads = +5pts, free = 0)
- Distance (closer = better; under 10 miles = +10pts)
- Experience match to job description

Return ONLY a JSON array, no markdown, no explanation:
[{"contractor_id":"uuid","score":85,"reason":"one concise sentence"}, ...]

Include only the top ${TOP_N} by score.`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      console.error('[match-job] Claude API error:', await claudeRes.text())
      return new Response(JSON.stringify({ error: 'claude_error' }), { status: 502 })
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text ?? '[]'

    let matches: MatchResult[] = []
    try {
      // Strip markdown fences if Claude adds them
      const json = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      matches = JSON.parse(json)
    } catch {
      console.error('[match-job] Claude returned invalid JSON:', rawText)
      return new Response(JSON.stringify({ error: 'invalid_claude_response' }), { status: 500 })
    }

    if (!Array.isArray(matches) || matches.length === 0) {
      console.log('[match-job] No matches returned by Claude')
      return new Response(JSON.stringify({ success: true, matched: 0 }), { status: 200 })
    }

    // ── 6. Insert notifications + push for matched contractors ─────────────
    const priceStr = booking.price_estimate
      ? `$${booking.price_estimate.toLocaleString()}`
      : booking.payout_max
      ? `up to $${booking.payout_max.toLocaleString()}`
      : 'Price TBD'

    let notified = 0

    await Promise.allSettled(
      matches.map(async (match) => {
        const contractor = contractors.find(c => c.id === match.contractor_id)
        if (!contractor) return

        const distStr = contractor.distance_miles != null
          ? `${Number(contractor.distance_miles).toFixed(1)} miles away`
          : 'nearby'

        const message = `${booking.trade ?? 'General'} job ${distStr} — ${match.score}% match. ${match.reason}`

        const { data: notif, error: notifErr } = await supabase
          .from('notifications')
          .insert({
            user_id: match.contractor_id,
            type: 'new_job_nearby',
            title: `New job match — ${match.score}% fit`,
            message,
            booking_id: booking.id,
            icon: 'briefcase-outline',
            data: {
              booking_id: booking.id,
              trade: booking.trade,
              distance_miles: contractor.distance_miles,
              price_estimate: booking.price_estimate,
              match_score: match.score,
              match_reason: match.reason,
            },
          })
          .select('id')
          .single()

        if (notifErr) {
          console.warn(`[match-job] Notification insert failed for ${match.contractor_id}:`, notifErr.message)
          return
        }

        // Fire push notification
        if (notif?.id && contractor.push_token) {
          supabase.functions
            .invoke('send-push-notification', {
              body: {
                notification_id: notif.id,
                contractor_id: match.contractor_id,
                push_token: contractor.push_token,
                title: `New ${booking.trade ?? 'job'} match — ${match.score}%`,
                body: message,
              },
            })
            .catch(err => console.warn('[match-job] Push invoke failed:', err))
        }

        // Email (check prefs)
        const prefs = (contractor.notification_prefs ?? {}) as Record<string, unknown>
        if (prefs.email_new_job !== false && contractor.email) {
          supabase.functions
            .invoke('send-email', {
              body: {
                to: contractor.email,
                subject: `New ${booking.trade ?? 'job'} near you — ${match.score}% match`,
                type: 'new_job_nearby',
                data: {
                  contractorName: contractor.company_name ?? 'Contractor',
                  trade: booking.trade ?? 'General',
                  distance: distStr,
                  price: priceStr,
                  matchScore: match.score,
                  matchReason: match.reason,
                  jobAddress: booking.job_address ?? '',
                  jobBoardUrl: 'https://tradease.tech/dashboard/contractor/job-board',
                  bookingId: booking.id,
                },
              },
            })
            .catch(err => console.warn('[match-job] Email invoke failed:', err))
        }

        notified++
      })
    )

    // ── 7. Stamp matched contractor IDs on the booking ─────────────────────────
    const matchedIds = matches.map(m => m.contractor_id)
    await supabase
      .from('bookings')
      .update({ matched_contractor_ids: matchedIds })
      .eq('id', booking.id)

    console.log(`[match-job] Done — notified ${notified}/${matches.length} top matches from ${eligible.length} eligible contractors`)
    return new Response(
      JSON.stringify({ success: true, matched: notified, scored: eligible.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[match-job] Fatal error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
