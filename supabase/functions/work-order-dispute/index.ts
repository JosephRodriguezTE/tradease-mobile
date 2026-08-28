import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { work_order_id, reason } = body;
    if (!work_order_id || !reason) throw new Error("work_order_id and reason are required");

    const { data: wo, error: woErr } = await admin
      .from("work_orders")
      .select("id, booking_id, customer_id, contractor_id, work_order_number")
      .eq("id", work_order_id)
      .single();

    if (woErr || !wo) throw new Error("Work order not found");

    const isCustomer = wo.customer_id === user.id;
    const isContractor = wo.contractor_id === user.id;
    if (!isCustomer && !isContractor) throw new Error("Not authorized");

    // Duplicate guard: don't open a second dispute on the same booking while one is already active.
    const { data: existingDisputes, error: existingErr } = await admin
      .from("disputes")
      .select("id")
      .eq("booking_id", wo.booking_id)
      .in("status", ["open", "under_review"])
      .limit(1);

    if (existingErr) throw new Error(existingErr.message);

    if (existingDisputes && existingDisputes.length > 0) {
      return new Response(
        JSON.stringify({ success: true, already_open: true, dispute_id: existingDisputes[0].id }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { error: disputeErr } = await admin.from("disputes").insert({
      booking_id: wo.booking_id,
      customer_id: wo.customer_id,
      contractor_id: wo.contractor_id,
      reason,
      status: "open",
    });
    if (disputeErr) throw new Error(disputeErr.message);

    const { error: updateErr } = await admin
      .from("work_orders")
      .update({ wo_status: "disputed" })
      .eq("id", work_order_id);
    if (updateErr) throw new Error(updateErr.message);

    const otherPartyId = isCustomer ? wo.contractor_id : wo.customer_id;
    if (otherPartyId) {
      await admin.from("notifications").insert({
        user_id: otherPartyId,
        type: "wo_disputed",
        title: `Dispute opened — WO#${wo.work_order_number}`,
        message: "Tradease is reviewing this job. Payment is paused until it's resolved.",
        booking_id: wo.booking_id ?? null,
        data: { work_order_id, booking_id: wo.booking_id ?? null, type: "wo_disputed" },
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 });
  }
});
