import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";
import { isValidInternalSecret } from "../_shared/internalSecret.ts";

const TRADE_CATEGORIES = [
  "Electrical", "Plumbing", "HVAC", "Handyman", "Roofing",
  "Cleaning", "Mechanical", "Painting", "Carpentry", "Landscaping",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  // Internal-only: only trigger_job_matching, which knows this secret, may
  // call this function. Previously had no application-level check at all —
  // verify_jwt: true let any valid JWT through, including the public anon
  // key, which triggers a real Anthropic API call and a bookings write.
  const providedSecret = req.headers.get("x-tradease-internal");
  if (!isValidInternalSecret(providedSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = getServiceKey();
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  const db = createClient(supabaseUrl, serviceKey);

  try {
    const body       = await req.json();
    // Supports both direct call ({ booking_id }) and trigger payload ({ record: { id } })
    const bookingId  = body?.booking_id  ?? body?.record?.id;
    const customerId = body?.customer_id ?? body?.record?.customer_id;

    if (!bookingId) return Response.json({ error: "booking_id required" }, { status: 400 });

    // Fetch booking details
    const { data: booking, error: bookingErr } = await db
      .from("bookings")
      .select("id, trade, description, notes, customer_id, title")
      .eq("id", bookingId)
      .single();

    if (bookingErr || !booking) return Response.json({ skipped: true, reason: "booking_not_found" });

    const query = [booking.description, booking.notes].filter(Boolean).join(" ").trim();

    if (!query) return Response.json({ skipped: true, reason: "no_description" });

    if (!anthropicKey) {
      console.warn("ANTHROPIC_API_KEY not set — skipping AI classification");
      return Response.json({ skipped: true, reason: "no_api_key" });
    }

    // Classify with Anthropic claude-haiku-4-5
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system: `You are a trade classifier for a home-services contractor marketplace called Tradease. Classify job requests into exactly one of these categories: ${TRADE_CATEGORIES.join(", ")}. Respond with ONLY valid JSON — no markdown, no explanation.`,
        messages: [{
          role: "user",
          content: `Job request: "${query}"\n\n{"category":"<one of the valid categories>","confidence":<float 0.0-1.0>,"job_title":"<3-6 word title>","extracted_details":"<one sentence>"}`,
        }],
      }),
    });

    if (!aiRes.ok) {
      console.error("Anthropic error:", await aiRes.text());
      return Response.json({ skipped: true, reason: "ai_error" });
    }

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text ?? "";

    let parsed: any;
    try {
      parsed = JSON.parse(rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim());
    } catch {
      console.error("Parse error:", rawText);
      return Response.json({ skipped: true, reason: "parse_error" });
    }

    const uid = booking.customer_id ?? customerId;
    if (!uid) return Response.json({ skipped: true, reason: "no_user_id" });

    // Log classification to job_match_logs
    await db.from("job_match_logs").insert({
      user_id:      uid,
      query,
      category:     parsed.category,
      confidence:   parsed.confidence,
      job_title:    parsed.job_title,
      raw_response: aiData,
    });

    // If AI has high confidence and user left trade blank, update it
    if ((parsed.confidence ?? 0) >= 0.85 && !booking.trade && parsed.category) {
      await db.from("bookings")
        .update({ trade: parsed.category })
        .eq("id", bookingId);
    }

    return Response.json({
      success:    true,
      category:   parsed.category,
      confidence: parsed.confidence,
    });

  } catch (err: any) {
    console.error("on-booking-created error:", err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
});
