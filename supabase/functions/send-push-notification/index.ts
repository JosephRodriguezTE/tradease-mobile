import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";
import { isValidInternalSecret } from "../_shared/internalSecret.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Single source of truth for prefs enforcement -- resolved here, server
// side, not trusted to any client. The `notifications` row itself always
// gets written (the caller inserts it before this function ever runs);
// this only decides whether the *push* on top of it fires.
//
// Types not listed here default to sending (and log a warning below) --
// an unmapped type is a gap in this map, not a signal the user wants it
// suppressed. Keep this in sync as new types are added; see the mapping
// discussion (2026-09-22) for how each type was assigned.
const NEVER_SUPPRESSIBLE = new Set([
  "employee_invite",           // account/onboarding, one-time, actionable
  "refund_update",             // financial
  "wo_disputed",                // payment paused, time-sensitive, procedural
  "change_order",               // customer must act to unblock the job
  "change_order_approved",
  "change_order_rejected",
  "booking_approved",           // payment about to release
  "verification_approved",      // account status, gates going online
  "verification_rejected",
  "ops_realtime_partition_gap", // infra alert to admins, deliberately dedup'd upstream to fire once per incident -- must not be silently droppable
]);

const TYPE_TO_PREF_KEY: Record<string, string> = {
  // -- job accepted / confirmed --
  contractor_assigned:          "push_job_accepted",
  booking_new:                  "push_booking_confirmed",
  job_accepted:                 "push_booking_confirmed",

  // -- job completed --
  job_completed:                "push_job_completed",
  job_complete:                 "push_job_completed",   // release_payment_on_completion's near-duplicate of job_completed -- both map the same until that's reconciled
  booking_completed:            "push_job_completed",

  // -- general job status / progress --
  job_in_progress:              "push_job_status",
  job_declined:                 "push_job_status",
  direct_request_declined:      "push_job_status",   // same event as job_declined, direct-request variant
  photo_added:                  "push_job_status",
  quote_expired:                "push_job_status",
  wo_en_route:                  "push_job_status",
  wo_arrived:                   "push_job_status",
  wo_in_progress:               "push_job_status",
  wo_waiting_for_customer:      "push_job_status",
  wo_materials_needed:          "push_job_status",
  wo_change_order_pending:      "push_job_status",
  wo_awaiting_approval:         "push_job_status",
  wo_cancelled:                 "push_job_status",
  contractor_en_route:          "push_job_status",   // website's own naming for the same milestone as wo_en_route
  contractor_arrived:           "push_job_status",   // same as wo_arrived
  work_started:                 "push_job_status",   // same as wo_in_progress
  booking_accepted:             "push_job_status",

  // -- new job / lead --
  new_job_nearby:               "push_new_job",
  direct_request:               "push_direct_request",

  // -- messages --
  new_message:                  "push_new_message",

  // -- cancellations --
  booking_cancelled:            "push_job_cancelled",
  booking_cancelled_contractor: "push_job_cancelled",
  job_cancelled:                "push_job_cancelled",

  // -- early start --
  early_start_requested:        "push_early_start",
  early_start_approved:         "push_early_start",
  early_start_declined:         "push_early_start",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  // Internal-only: only the DB trigger (trigger_send_push_notification),
  // which knows this secret, may call this function. Closes the gap where
  // anyone with the URL could force-send a push for any guessed notification_id.
  const providedSecret = req.headers.get("x-tradease-internal");
  if (!isValidInternalSecret(providedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const notification_id: string | undefined = body?.notification_id;

    if (!notification_id) {
      return json({ error: "notification_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()
    );

    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .select("id, user_id, title, message, type, data, sent_push")
      .eq("id", notification_id)
      .single();

    if (notifErr || !notif) {
      return json({ error: "notification not found", detail: notifErr?.message }, 404);
    }

    if (notif.sent_push) {
      return json({ sent: false, reason: "already_sent" });
    }

    const [{ data: userRow }, { data: contractorRow }] = await Promise.all([
      supabase.from("users").select("push_token, allow_notifications, notification_prefs").eq("id", notif.user_id).maybeSingle(),
      supabase.from("contractors").select("push_token, allow_notifications, notification_prefs").eq("id", notif.user_id).maybeSingle(),
    ]);

    const recipient = userRow ?? contractorRow ?? null;
    const pushToken: string | null = recipient?.push_token ?? null;

    // This row is the one thing that always happens -- in-app history stays
    // complete regardless of what the checks below decide about the push.
    await supabase
      .from("notifications")
      .update({ sent_push: true })
      .eq("id", notification_id);

    if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
      return json({ sent: false, reason: "no_valid_token" });
    }

    if (!NEVER_SUPPRESSIBLE.has(notif.type)) {
      if (recipient?.allow_notifications === false) {
        return json({ sent: false, reason: "prefs_disabled", detail: "allow_notifications" });
      }

      const prefKey = TYPE_TO_PREF_KEY[notif.type];
      if (prefKey) {
        const prefs = (recipient?.notification_prefs ?? {}) as Record<string, unknown>;
        if (prefs[prefKey] === false) {
          return json({ sent: false, reason: "prefs_disabled", detail: prefKey });
        }
      } else {
        console.log(JSON.stringify({
          level: "warn",
          msg: "notification type has no prefs mapping -- defaulting to send",
          type: notif.type,
        }));
      }
    }

    const pushPayload = {
      to: pushToken,
      title: notif.title ?? "Tradease",
      body: notif.message,
      data: {
        ...(notif.data ?? {}),
        notification_id,
        type: notif.type,
      },
      sound: "default",
      badge: 1,
      priority: "high",
      channelId: "default",
    };

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(pushPayload),
    });

    const expoData = await expoRes.json();
    const ticket = Array.isArray(expoData?.data) ? expoData.data[0] : expoData?.data ?? expoData;
    const success = ticket?.status === "ok";

    return json({ sent: success, ticket });
  } catch (err: unknown) {
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
