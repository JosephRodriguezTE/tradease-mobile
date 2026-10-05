// Supabase Edge Function — send-email
// Deploy: supabase functions deploy send-email
// Secret required: RESEND_API_KEY (set via: supabase secrets set RESEND_API_KEY=re_xxx)
//
// TODO: Replace stub with real Resend API call once RESEND_API_KEY is set.
// Resend docs: https://resend.com/docs/api-reference/emails/send-email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isValidInternalSecret } from '../_shared/internalSecret.ts'
import { getServiceKey } from '../_shared/secretKey.ts'
import { SUPPORT_EMAIL } from '../_shared/contact.ts'

type EmailType =
  | 'booking_confirmation'
  | 'contractor_accepted'
  | 'verification_approved'
  | 'verification_rejected'
  | 'new_message'
  | 'job_completed'
  | 'job_accepted'
  | 'job_accepted_customer'
  | 'job_accepted_contractor'
  | 'job_cancelled'
  | 'new_job_nearby'
  | 'work_order_submitted'
  | 'review_received'
  | 'launch_signup_confirmation'
  | 'payment_approved'
  | 'report_submitted'
  | 'dispute_resolved'
  | 'otp_code'

// Postgres callers (send_email(), charge-customer) send `template` instead
// of `type` and don't pass `subject` at all — DEFAULT_SUBJECTS below covers
// those. Website callers pass `type` + `subject` explicitly and take
// precedence when both are present.
interface RawEmailPayload {
  // 'process_outbox': sent every minute by process_email_outbox() (cron)
  // when public.email_outbox has something due.
  action?: 'process_outbox'
  to: string
  subject?: string
  type?: EmailType
  template?: EmailType
  data: Record<string, unknown>
}

interface EmailPayload {
  to: string
  subject: string
  type: EmailType
  data: Record<string, unknown>
}

const DEFAULT_SUBJECTS: Partial<Record<EmailType, string>> = {
  booking_confirmation: 'Booking received',
  contractor_accepted: 'A contractor accepted your job',
  job_accepted: 'A contractor accepted your job',
  job_cancelled: 'A booking was cancelled',
  work_order_submitted: 'You have a new work order',
  review_received: 'You got a new review',
  dispute_resolved: 'Your dispute has been resolved',
  otp_code: 'Your Tradease verification code',
  job_accepted_customer: 'A contractor accepted your job',
  job_accepted_contractor: 'You accepted a new job',
  job_completed: 'Your job is complete',
  new_job_nearby: 'New job near you',
  new_message: 'New message on Tradease',
  payment_approved: 'Payment approved — funds on the way',
  verification_approved: 'Your verification was approved',
  verification_rejected: 'Verification update needed',
  report_submitted: 'New report on Tradease',
}

// Mail goes out from hello@tradease.tech; replies land in the support inbox.
// Every email's reply-to and footer address come from SUPPORT_EMAIL
// (../_shared/contact.ts) -- never write the address into a template.
const REPLY_TO = SUPPORT_EMAIL

const FROM = 'Tradease <hello@tradease.tech>'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const providedSecret = req.headers.get('x-tradease-internal')
  if (!isValidInternalSecret(providedSecret)) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS })
  }

  try {
    const raw: RawEmailPayload = await req.json()

    if (raw.action === 'process_outbox') {
      const result = await processOutbox()
      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const type = raw.type ?? raw.template
    const subject = raw.subject ?? (type ? DEFAULT_SUBJECTS[type] : undefined)

    if (!raw.to || !subject || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, type (or template)' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const payload: EmailPayload = { to: raw.to, subject, type, data: raw.data }

    const html = buildEmailHtml(payload)

    const sent = await sendViaResend(payload.to, payload.subject, html)
    if (!sent) {
      // No key set — log stub so nothing silently breaks in dev
      console.log('[send-email] STUB (no RESEND_API_KEY) — would send:', payload.to, payload.subject)
      return new Response(JSON.stringify({ success: true, stub: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-email] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})

// false = no RESEND_API_KEY (nothing sent); throws on a provider error.
async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [to], subject, html }),
  })
  if (!res.ok) {
    throw new Error(`Resend API error: ${await res.text()}`)
  }
  return true
}

// Subjects for queued emails, which (unlike direct callers) don't pass one.
// The digest knows how many messages are still unread (claim_email_outbox()
// counts them at send time).
function subjectFor(type: EmailType, data: Record<string, unknown>): string | undefined {
  const trade = data.trade ? String(data.trade) : 'job'
  switch (type) {
    case 'new_message': {
      const n = Number(data.unreadCount) || 1
      const sender = String(data.senderName ?? 'Someone')
      return n > 1 ? `${n} new messages from ${sender}` : `New message from ${sender}`
    }
    case 'booking_confirmation':
      return `Booking received — ${trade}`
    case 'job_completed':
      return `${data.contractorName ?? 'Your contractor'} finished your ${trade} job — please review`
    case 'job_cancelled':
      return data.cancelledBy === 'contractor'
        ? `Your contractor cancelled your ${trade} booking`
        : `${data.customerName ?? 'The customer'} cancelled the ${trade} booking`
    case 'work_order_submitted':
      return `${data.contractorName ?? 'Your contractor'} sent you a work order`
    case 'review_received':
      return `You got a new ${clampRating(data.rating)}-star review`
    case 'dispute_resolved':
      return `Dispute resolved — your ${trade} job`
  }
  return (typeof data.subject === 'string' && data.subject) || DEFAULT_SUBJECTS[type]
}

function clampRating(value: unknown): number {
  return Math.min(5, Math.max(1, Number(value) || 5))
}

// Customers are on Long Island, so deadlines are shown in Eastern time.
function formatDeadline(value: unknown): string | null {
  if (!value) return null
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short',
  })
}

interface OutboxRow {
  id: number
  to_address: string
  template: string
  data: Record<string, unknown>
  attempts: number
}

// Claim due rows (address, preference and unread check are resolved in the
// claim), send each, record the outcome. A failed row goes back to pending
// with backoff; finish_email_outbox() gives up after 5 attempts.
async function processOutbox(): Promise<{ sent: number; failed: number }> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, getServiceKey(), {
    auth: { persistSession: false },
  })
  let sent = 0
  let failed = 0
  // A few batches per run; anything left is picked up by the next minute's run.
  for (let batch = 0; batch < 4; batch++) {
    const { data: rows, error } = await admin.rpc('claim_email_outbox', { p_limit: 25 })
    if (error) throw new Error(`claim_email_outbox: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows as OutboxRow[]) {
      let failure: string | null = null
      try {
        const type = row.template as EmailType
        const data = row.data ?? {}
        const subject = subjectFor(type, data)
        if (!subject) throw new Error(`No subject for template "${row.template}"`)
        const html = buildEmailHtml({ to: row.to_address, subject, type, data })
        if (!(await sendViaResend(row.to_address, subject, html))) failure = 'RESEND_API_KEY not set'
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err)
      }
      const { error: finishError } = await admin.rpc('finish_email_outbox', { p_id: row.id, p_error: failure })
      if (finishError) console.error('[send-email] finish_email_outbox:', row.id, finishError.message)
      if (failure) {
        failed++
        console.error('[send-email] outbox row failed:', row.id, row.template, failure)
      } else {
        sent++
      }
    }
  }
  return { sent, failed }
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function buildEmailHtml(payload: EmailPayload): string {
  const { type, data } = payload

  const wrapper = (content: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(payload.subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#0D0D0D;font-family:Inter,-apple-system,sans-serif;color:#F0F0F0;">
      <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
        <div style="margin-bottom:32px;">
          <span style="font-size:24px;">🔨</span>
          <span style="font-size:18px;font-weight:800;color:#F0F0F0;margin-left:8px;letter-spacing:-0.5px;">Tradease</span>
        </div>
        <div style="background:#1A1A1A;border:1px solid #2E2E2E;border-radius:16px;padding:32px 28px;">
          ${content}
        </div>
        <p style="font-size:12px;color:#555;margin-top:24px;text-align:center;line-height:1.6;">
          Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#FF6200;text-decoration:none;">${SUPPORT_EMAIL}</a>.<br>
          © ${new Date().getFullYear()} Tradease · <a href="https://tradease.tech" style="color:#FF6200;text-decoration:none;">tradease.tech</a>
        </p>
      </div>
    </body>
    </html>
  `

  switch (type) {
    case 'booking_confirmation':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Booking received ✅</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">Hi ${escapeHtml(data.customerName ?? 'there')}, your booking has been received.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>Trade:</strong> ${escapeHtml(data.trade ?? '—')}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Address:</strong> ${escapeHtml(data.jobAddress ?? '—')}</p>
          ${data.bookingDate ? `<p style="margin:0;font-size:14px;"><strong>Date:</strong> ${escapeHtml(data.bookingDate)}</p>` : ''}
        </div>
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Dashboard →
        </a>
      `)

    case 'contractor_accepted':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Contractor Matched 🤝</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">Great news, ${escapeHtml(data.customerName ?? 'there')}! A contractor has accepted your job.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>Contractor:</strong> ${escapeHtml(data.contractorName ?? '—')}</p>
          <p style="margin:0;font-size:14px;"><strong>Trade:</strong> ${escapeHtml(data.trade ?? '—')}</p>
        </div>
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Job →
        </a>
      `)

    case 'verification_approved':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#22C55E;">Verification Approved 🏆</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">Congratulations ${escapeHtml(data.companyName ?? 'there')}! Your profile is now verified on Tradease.</p>
        <p style="color:#9A9A9A;font-size:14px;margin:0 0 24px;">Your verified badge is now visible to customers searching for contractors.</p>
        <a href="https://tradease.tech" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Your Profile →
        </a>
      `)

    case 'verification_rejected':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Verification Update</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">Hi ${escapeHtml(data.companyName ?? 'there')}, we reviewed your verification submission.</p>
        ${data.reviewerNotes ? `
          <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#9A9A9A;"><strong style="color:#F0F0F0;">Notes from our team:</strong><br>${escapeHtml(data.reviewerNotes)}</p>
          </div>
        ` : ''}
        <p style="color:#9A9A9A;font-size:14px;margin:0 0 24px;">Please resubmit with the corrected documents.</p>
        <a href="https://tradease.tech" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          Resubmit Documents →
        </a>
      `)

    case 'new_message':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">New Message 💬</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;"><strong style="color:#F0F0F0;">${escapeHtml(data.senderName ?? 'Someone')}</strong> sent you ${Number(data.unreadCount) > 1 ? `${Number(data.unreadCount)} messages` : 'a message'}.</p>
        ${data.messagePreview ? `
          <div style="background:#222;border-left:3px solid #FF6200;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#C0C0C0;font-style:italic;">"${escapeHtml(data.messagePreview)}"</p>
          </div>
        ` : ''}
        <a href="${escapeHtml(data.chatUrl ?? 'https://tradease.tech/dashboard')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          Reply →
        </a>
      `)

    case 'job_completed':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Your job is complete ✅</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">Hi ${escapeHtml(data.customerName ?? 'there')}, <strong style="color:#F0F0F0;">${escapeHtml(data.contractorName ?? 'Your contractor')}</strong> has marked your job complete and submitted the work order.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;width:90px;">Trade</td>
              <td style="padding:5px 0;font-size:13px;color:#F0F0F0;font-weight:600;">${escapeHtml(data.trade ?? '—')}</td>
            </tr>
            ${data.total ? `<tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;">Total</td>
              <td style="padding:5px 0;font-size:13px;color:#22C55E;font-weight:700;">$${Number(data.total).toLocaleString()}</td>
            </tr>` : ''}
          </table>
        </div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:12px 16px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#F59E0B;">⏱ Please review it ${formatDeadline(data.autoApproveAt) ? `by ${escapeHtml(formatDeadline(data.autoApproveAt))}` : 'within 72 hours'}. If you don't respond by then, it's approved automatically.</p>
        </div>
        <a href="${escapeHtml(data.workOrderUrl ?? 'https://tradease.tech/dashboard')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          Review &amp; Approve →
        </a>
      `)

    case 'job_accepted':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Contractor Matched 🤝</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">${escapeHtml(data.contractorName ?? 'A contractor')} accepted your job. They will be in touch to confirm details.</p>
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Job →
        </a>
      `)

    case 'job_accepted_customer':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Contractor Matched 🤝</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">${escapeHtml(data.contractorName ?? 'A contractor')} accepted your ${escapeHtml(data.trade ?? '')} job at ${escapeHtml(data.address ?? 'your address')}.</p>
        ${data.priceEstimate ? `<p style="color:#9A9A9A;font-size:14px;margin:0 0 24px;"><strong style="color:#F0F0F0;">Estimate:</strong> ${escapeHtml(data.priceEstimate)}</p>` : ''}
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Job →
        </a>
      `)

    case 'job_accepted_contractor':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">You accepted a job ✅</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">You're confirmed for a ${escapeHtml(data.trade ?? '')} job at ${escapeHtml(data.address ?? 'the customer’s address')} for ${escapeHtml(data.customerName ?? 'the customer')}.</p>
        ${data.priceEstimate ? `<p style="color:#9A9A9A;font-size:14px;margin:0 0 24px;"><strong style="color:#F0F0F0;">Estimate:</strong> ${escapeHtml(data.priceEstimate)}</p>` : ''}
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Job →
        </a>
      `)

    case 'payment_approved':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#22C55E;">Payment approved 💰</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">${escapeHtml(data.customerName ?? 'Your customer')} approved payment for the ${escapeHtml(data.trade ?? '')} job. Funds are on the way.</p>
        ${data.amount ? `<div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;"><p style="margin:0;font-size:14px;"><strong>Amount:</strong> <span style="color:#22C55E;font-weight:700;">$${escapeHtml(data.amount)}</span></p></div>` : ''}
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Details →
        </a>
      `)

    case 'job_cancelled':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Booking Cancelled</h1>
        <p style="color:#9A9A9A;margin:0 0 24px;">${data.cancelledBy === 'contractor'
          ? `${escapeHtml(data.contractorName ?? 'Your contractor')} cancelled your ${escapeHtml(data.trade ?? '')} booking. We're finding you a new contractor — check your bookings.`
          : `${escapeHtml(data.customerName ?? 'The customer')} cancelled the ${escapeHtml(data.trade ?? '')} booking.`}</p>
        <a href="${escapeHtml(data.bookingUrl ?? 'https://tradease.tech/dashboard')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Dashboard →
        </a>
      `)

    case 'new_job_nearby':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">New job near you 📍</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">Hi ${escapeHtml(data.contractorName ?? 'there')}, a new job matching your trade just posted in your area.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;width:90px;">Trade</td>
              <td style="padding:5px 0;font-size:13px;color:#F0F0F0;font-weight:600;">${escapeHtml(data.trade ?? '—')}</td>
            </tr>
            ${data.distance ? `<tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;">Distance</td>
              <td style="padding:5px 0;font-size:13px;color:#F0F0F0;font-weight:600;">${escapeHtml(data.distance)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;">Budget</td>
              <td style="padding:5px 0;font-size:13px;color:#22C55E;font-weight:700;">${escapeHtml(data.price ?? 'TBD')}</td>
            </tr>
            ${data.location ? `
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;">Location</td>
              <td style="padding:5px 0;font-size:13px;color:#F0F0F0;">${escapeHtml(data.location)}</td>
            </tr>` : ''}
          </table>
        </div>
        <a href="${escapeHtml(data.jobBoardUrl ?? 'https://tradease.tech/dashboard/contractor/job-board')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Job Board →
        </a>
        <p style="font-size:12px;color:#444;margin-top:20px;">
          You're receiving this because you have email notifications enabled.
          Update your preferences in your <a href="https://tradease.tech/dashboard/contractor/settings" style="color:#FF6200;text-decoration:none;">dashboard settings</a>.
        </p>
      `)

    case 'work_order_submitted':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Work order submitted 📋</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">Hi ${escapeHtml(data.customerName ?? 'there')}, <strong style="color:#F0F0F0;">${escapeHtml(data.contractorName ?? 'Your contractor')}</strong> has created a work order for your job.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;width:90px;">Trade</td>
              <td style="padding:5px 0;font-size:13px;color:#F0F0F0;font-weight:600;">${escapeHtml(data.trade ?? '—')}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#9A9A9A;">Total</td>
              <td style="padding:5px 0;font-size:13px;color:${data.total ? '#22C55E' : '#9A9A9A'};font-weight:${data.total ? '700' : '400'};">${data.total ? `$${Number(data.total).toLocaleString()}` : 'To be confirmed'}</td>
            </tr>
          </table>
        </div>
        <p style="color:#9A9A9A;font-size:13px;margin:0 0 24px;">You'll receive another notification once the work is marked complete and ready for your approval.</p>
        <a href="${escapeHtml(data.workOrderUrl ?? 'https://tradease.tech/dashboard')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Work Order →
        </a>
      `)

    case 'review_received':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">You got a new review ${'⭐'.repeat(Math.min(5, Math.max(1, Number(data.rating) || 5)))}</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">Hi ${escapeHtml(data.contractorName ?? 'there')}, <strong style="color:#F0F0F0;">${escapeHtml(data.reviewerName ?? 'A customer')}</strong> left you a review.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:12px;padding:20px 22px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:${data.reviewText ? '14px' : '0'};">
            <div style="width:36px;height:36px;border-radius:50%;background:#FF6200;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;flex-shrink:0;">
              ${escapeHtml(String(data.reviewerName ?? 'A')[0].toUpperCase())}
            </div>
            <div>
              <p style="margin:0;font-size:14px;font-weight:700;color:#F0F0F0;">${escapeHtml(data.reviewerName ?? 'Anonymous')}</p>
              <p style="margin:2px 0 0;font-size:20px;letter-spacing:1px;">${'★'.repeat(Math.min(5, Math.max(1, Number(data.rating) || 5)))}${'☆'.repeat(5 - Math.min(5, Math.max(1, Number(data.rating) || 5)))}</p>
            </div>
          </div>
          ${data.reviewText ? `<p style="margin:0;font-size:14px;color:#C0C0C0;line-height:1.7;font-style:italic;border-top:1px solid #2E2E2E;padding-top:14px;">"${escapeHtml(data.reviewText)}"</p>` : ''}
        </div>
        <a href="${escapeHtml(data.profileUrl ?? 'https://tradease.tech')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Your Profile →
        </a>
      `)

    case 'launch_signup_confirmation': {
      const roleLabel = data.role === 'contractor' ? 'contractor' : 'customer'
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">You're on the list 🎉</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">Hi ${escapeHtml(data.name ?? 'there')}, you're confirmed on the Tradease launch list as a ${escapeHtml(roleLabel)}${data.zip ? ` in the ${escapeHtml(data.zip)} area` : ''}.</p>
        <p style="color:#9A9A9A;font-size:14px;margin:0 0 24px;">We'll email you the moment we go live — no spam before then.</p>
        <a href="https://tradease.tech" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          Visit Tradease →
        </a>
      `)
    }

    // To the support inbox (report_inbox()), from notify_report_submitted.
    case 'report_submitted':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">New report: ${escapeHtml(data.topic ?? 'Other')}</h1>
        <p style="color:#9A9A9A;margin:0 0 16px;">From ${escapeHtml(data.name ?? 'unknown')}${data.email ? ` &lt;${escapeHtml(data.email)}&gt;` : ''}</p>
        <div style="background:#111;border:1px solid #2E2E2E;border-radius:10px;padding:16px;margin:0 0 24px;color:#F0F0F0;font-size:14px;white-space:pre-wrap;">${escapeHtml(data.message ?? '')}</div>
        <a href="${escapeHtml(data.adminUrl ?? 'https://tradease.tech/admin/reports')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          Open in Admin →
        </a>
      `)

    case 'dispute_resolved':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Dispute resolved</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">The dispute on your ${escapeHtml(data.trade ?? '')} job has been resolved ${escapeHtml(data.outcome ?? '')}.</p>
        ${data.resolution ? `
          <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#9A9A9A;"><strong style="color:#F0F0F0;">From our team:</strong><br>${escapeHtml(data.resolution)}</p>
          </div>
        ` : ''}
        <a href="${escapeHtml(data.bookingUrl ?? 'https://tradease.tech/dashboard')}" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          View Job →
        </a>
      `)

    // Sent directly (not queued) by the website's /api/2fa/send.
    case 'otp_code':
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;color:#F0F0F0;">Your verification code</h1>
        <p style="color:#9A9A9A;margin:0 0 20px;">Enter this code to finish signing in to Tradease.</p>
        <div style="background:#222;border:1px solid #2E2E2E;border-radius:10px;padding:18px;margin-bottom:20px;text-align:center;">
          <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#F0F0F0;">${escapeHtml(data.code ?? '')}</span>
        </div>
        <p style="color:#9A9A9A;font-size:13px;margin:0;">It expires in ${escapeHtml(data.expiresInMinutes ?? 10)} minutes. Never share it — Tradease will never ask you for it. If you didn't try to sign in, change your password.</p>
      `)

    default:
      return wrapper(`
        <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;color:#F0F0F0;">${escapeHtml(payload.subject)}</h1>
        <a href="https://tradease.tech/dashboard" style="display:inline-block;background:#FF6200;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:14px;">
          Open Tradease →
        </a>
      `)
  }
}
