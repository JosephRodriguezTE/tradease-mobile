import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Who may move a work order from which status to which. This function writes
// with the service role, so the database's client-write guard
// (guard_work_order_client_write) doesn't apply here -- only the global
// transition graph does, and that graph allows moves no single party should
// make alone (in_progress -> completed skips the customer's approval). These
// tables mirror the guard's per-party rules; keep them in step.
const CONTRACTOR_MOVES: Record<string, string[]> = {
  submitted:            ["accepted", "cancelled"],
  accepted:             ["en_route", "cancelled"],
  deposit_secured:      ["en_route", "cancelled"],
  en_route:             ["arrived", "cancelled"],
  arrived:              ["in_progress", "cancelled"],
  in_progress:          ["waiting_for_customer", "materials_needed", "awaiting_approval"],
  waiting_for_customer: ["in_progress"],
  materials_needed:     ["in_progress"],
};

const CUSTOMER_MOVES: Record<string, string[]> = {
  awaiting_approval:    ["payment_releasing", "disputed"],
  payment_releasing:    ["completed"],
  in_progress:          ["disputed"],
  waiting_for_customer: ["disputed"],
  materials_needed:     ["disputed"],
};

const CUSTOMER_NOTIF: Record<string, { title: string; body: string }> = {
  en_route:             { title: "Your contractor is on the way!",            body: "Heading to your location now." },
  arrived:              { title: "Contractor has arrived",                     body: "Ready to start - check the app." },
  in_progress:          { title: "Work has started",                           body: "Your contractor has started the job." },
  waiting_for_customer: { title: "Contractor is waiting for you",             body: "Please respond in the app." },
  materials_needed:     { title: "Picking up materials",                      body: "They'll return once they have everything." },
  change_order_pending: { title: "Change order needs your approval",          body: "Open the app to review and approve." },
  awaiting_approval:    { title: "Work complete - please review and approve", body: "Tap to review and approve the job." },
  cancelled:            { title: "Job has been cancelled",                    body: "The contractor cancelled this job." },
};

// Sent to the contractor when the customer moves the work order. Types are
// ones send-push-notification already classifies: booking_approved (same
// event the website sends on approval) and wo_disputed are never-suppressible,
// job_completed maps to push_job_completed.
const CONTRACTOR_NOTIF: Record<string, { type: string; title: string; body: string }> = {
  payment_releasing: { type: "booking_approved",     title: "Customer approved the work", body: "Payment capture isn't live yet." },
  completed:         { type: "job_completed",        title: "Job completed",              body: "The customer has confirmed the job is complete." },
  disputed:          { type: "wo_disputed",          title: "Customer opened a dispute",  body: "Open the app to see the details." },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" }, status });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const body = await req.json();
    const { work_order_id, new_status, extra_columns } = body;

    if (!work_order_id || !new_status) throw new Error("work_order_id and new_status are required");
    // Was spread straight into a service-role update, letting a caller set
    // billing, customer_id or anything else. Installed apps send {}; refuse
    // anything else rather than silently dropping it.
    if (extra_columns && Object.keys(extra_columns).length > 0) {
      throw new Error("extra_columns is no longer accepted");
    }

    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("*, booking:bookings(trade, customer_id, job_address, customer_name)")
      .eq("id", work_order_id)
      .single();

    if (woErr || !wo) throw new Error("Work order not found");

    const customerId = wo.customer_id ?? wo.booking?.customer_id;

    if (new_status === "early_start_request") {
      if (wo.contractor_id !== user.id) throw new Error("Not authorized");
      await admin.from("work_orders").update({ early_start_requested: true }).eq("id", work_order_id);
      if (customerId) {
        await admin.from("notifications").insert({
          user_id: customerId, type: "early_start_requested",
          title: `${wo.contractor_name} wants to start early`,
          message: "Tap to approve or decline.",
          booking_id: wo.booking_id ?? null,
          data: { work_order_id, type: "early_start_requested" },
        });
      }
      return json({ success: true, action: "early_start_request" });
    }

    if (new_status === "early_start_decline") {
      if (customerId !== user.id) throw new Error("Not authorized");
      const { data: declined, error: declineErr } = await admin
        .from("work_orders")
        .update({ early_start_requested: false })
        .eq("id", work_order_id)
        .select("early_start_requested")
        .single();
      if (declineErr || !declined || declined.early_start_requested !== false) {
        throw new Error("Could not decline early start.");
      }
      if (wo.contractor_id) {
        await admin.from("notifications").insert({
          user_id: wo.contractor_id, type: "early_start_declined",
          title: "Customer declined your early start request",
          message: "The scheduled start time is unchanged.",
          booking_id: wo.booking_id ?? null,
          data: { work_order_id, type: "early_start_declined" },
        });
      }
      return json({ success: true, action: "early_start_decline" });
    }

    if (new_status === "early_start_approve") {
      if (customerId !== user.id) throw new Error("Not authorized");
      await admin.from("work_orders").update({ early_start_approved: true }).eq("id", work_order_id);
      if (wo.contractor_id) {
        await admin.from("notifications").insert({
          user_id: wo.contractor_id, type: "early_start_approved",
          title: "Customer approved your early start",
          message: "You can start driving now.",
          booking_id: wo.booking_id ?? null,
          data: { work_order_id, type: "early_start_approved" },
        });
      }
      return json({ success: true, action: "early_start_approve" });
    }

    const from: string = wo.wo_status ?? wo.status;
    const isContractor = wo.contractor_id === user.id;
    const isCustomer = customerId === user.id;

    let actor: "contractor" | "customer";
    if (isContractor && (CONTRACTOR_MOVES[from] ?? []).includes(new_status)) {
      actor = "contractor";
    } else if (isCustomer && (CUSTOMER_MOVES[from] ?? []).includes(new_status)) {
      actor = "customer";
    } else if (!isContractor && !isCustomer) {
      throw new Error("Not authorized");
    } else {
      throw new Error(`You can't move this work order from ${from} to ${new_status}`);
    }

    if (actor === "contractor" && new_status === "in_progress") {
      if (!wo.payment_intent_id) throw new Error("Cannot start job: no payment hold on file. Customer must secure payment first.");
      const { data: pi, error: piErr } = await admin.from("payment_intents").select("status").eq("id", wo.payment_intent_id).single();
      if (piErr || !pi) throw new Error("Cannot start job: payment record not found.");
      if (pi.status !== "held") {
        if (pi.status === "hold_failed") {
          await admin.from("work_orders").update({ hold_failed_at: new Date().toISOString() }).eq("id", work_order_id);
        }
        throw new Error(pi.status === "hold_failed" ? "Payment hold failed. Customer must update their payment method." : `Payment status is '${pi.status}' (must be 'held').`);
      }
    }

    const updatePayload: Record<string, unknown> = { wo_status: new_status };
    if (new_status === "awaiting_approval") {
      updatePayload.completed_at = new Date().toISOString();
      updatePayload.auto_approve_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    }

    // The transition guard still runs on this write: completing a work order
    // that has had a payment fails with "payment must be captured first"
    // until a capture exists (see docs/PAYMENT_LAUNCH_BLOCKER.md).
    const { data: updated, error: updateErr } = await admin
      .from("work_orders")
      .update(updatePayload)
      .eq("id", work_order_id)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    if (actor === "contractor") {
      const notif = CUSTOMER_NOTIF[new_status];
      if (notif && customerId) {
        await admin.from("notifications").insert({
          user_id: customerId, type: `wo_${new_status}`,
          title: notif.title, message: notif.body,
          booking_id: wo.booking_id ?? null,
          data: { work_order_id, booking_id: wo.booking_id ?? null, type: `wo_${new_status}` },
        });
      }
    } else {
      const notif = CONTRACTOR_NOTIF[new_status];
      if (notif && wo.contractor_id) {
        await admin.from("notifications").insert({
          user_id: wo.contractor_id, type: notif.type,
          title: notif.title, message: notif.body,
          booking_id: wo.booking_id ?? null,
          data: { work_order_id, booking_id: wo.booking_id ?? null, type: notif.type },
        });
      }
    }

    return json({ success: true, work_order: updated });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 400);
  }
});
