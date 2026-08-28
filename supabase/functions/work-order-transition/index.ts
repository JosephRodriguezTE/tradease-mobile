import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CUSTOMER_NOTIF: Record<string, { title: string; body: string }> = {
  en_route:             { title: "Your contractor is on the way!",            body: "Heading to your location now." },
  arrived:              { title: "Contractor has arrived",                     body: "Ready to start - check the app." },
  in_progress:          { title: "Work has started",                           body: "Your contractor has started the job." },
  waiting_for_customer: { title: "Contractor is waiting for you",             body: "Please respond in the app." },
  materials_needed:     { title: "Picking up materials",                      body: "They'll return once they have everything." },
  change_order_pending: { title: "Change order needs your approval",          body: "Open the app to review and approve." },
  awaiting_approval:    { title: "Work complete - please review and approve", body: "Tap to review the job and release payment." },
  cancelled:            { title: "Job has been cancelled",                    body: "The contractor cancelled this job." },
};

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
    const { work_order_id, new_status, extra_columns = {} } = body;

    if (!work_order_id || !new_status) throw new Error("work_order_id and new_status are required");

    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("*, booking:bookings(trade, customer_id, job_address, customer_name)")
      .eq("id", work_order_id)
      .single();

    if (woErr || !wo) throw new Error("Work order not found");

    if (new_status === "early_start_request") {
      if (wo.contractor_id !== user.id) throw new Error("Not authorized");
      await admin.from("work_orders").update({ early_start_requested: true }).eq("id", work_order_id);
      const cid = wo.customer_id ?? wo.booking?.customer_id;
      if (cid) {
        await admin.from("notifications").insert({
          user_id: cid, type: "early_start_requested",
          title: `${wo.contractor_name} wants to start early`,
          message: "Tap to approve or decline.",
          booking_id: wo.booking_id ?? null,
          data: { work_order_id, type: "early_start_requested" },
        });
      }
      return new Response(JSON.stringify({ success: true, action: "early_start_request" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
    }

    if (new_status === "early_start_approve") {
      const cid = wo.customer_id ?? wo.booking?.customer_id;
      if (cid !== user.id) throw new Error("Not authorized");
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
      return new Response(JSON.stringify({ success: true, action: "early_start_approve" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });
    }

    if (wo.contractor_id !== user.id) throw new Error("Not authorized");

    if (new_status === "in_progress") {
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

    const updatePayload: Record<string, unknown> = { wo_status: new_status, ...extra_columns };
    if (new_status === "awaiting_approval") {
      updatePayload.completed_at = new Date().toISOString();
      updatePayload.auto_approve_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    }

    const { data: updated, error: updateErr } = await admin
      .from("work_orders")
      .update(updatePayload)
      .eq("id", work_order_id)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    const customerId = wo.customer_id ?? wo.booking?.customer_id;
    const notif = CUSTOMER_NOTIF[new_status];
    if (notif && customerId) {
      await admin.from("notifications").insert({
        user_id: customerId, type: `wo_${new_status}`,
        title: notif.title, message: notif.body,
        booking_id: wo.booking_id ?? null,
        data: { work_order_id, booking_id: wo.booking_id ?? null, type: `wo_${new_status}` },
      });
    }

    return new Response(JSON.stringify({ success: true, work_order: updated }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 });
  }
});
