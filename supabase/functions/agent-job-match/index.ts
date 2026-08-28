import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";

const TRADE_CATEGORIES = [
  "Electrical", "Plumbing", "HVAC", "Handyman", "Roofing",
  "Cleaning", "Mechanical", "Painting", "Carpentry", "Landscaping",
] as const;

type TradeCategory = typeof TRADE_CATEGORIES[number];

const RATE_LIMIT = 10;
const RATE_WINDOW_MINUTES = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const serviceKey      = getServiceKey();
    const anonKey         = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anthropicKey    = Deno.env.get("ANTHROPIC_API_KEY");

    const userClient    = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    // Rate limit: count calls in the last 5 minutes
    const windowStart = new Date(Date.now() - RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await serviceClient
      .from("job_match_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= RATE_LIMIT) {
      return Response.json(
        { error: "rate_limited", message: "Too many searches. Wait a moment and try again." },
        { status: 429, headers: CORS }
      );
    }

    const body  = await req.json();
    const query = (body?.query ?? "").toString().trim();
    if (!query) {
      return Response.json({ error: "query is required" }, { status: 400, headers: CORS });
    }

    if (!anthropicKey) {
      return Response.json({ error: "AI service not configured" }, { status: 503, headers: CORS });
    }

    const prompt = `You are a trade classifier for a home-services contractor marketplace.
Classify the job request into exactly one of these categories: ${TRADE_CATEGORIES.join(", ")}.

Job request: "${query}"

Respond with ONLY valid JSON, no markdown fences:
{
  "category": "<one of the listed categories>",
  "confidence": <float 0.0-1.0>,
  "job_title": "<3-6 word descriptive title>",
  "extracted_details": "<key problem or task, 1 sentence>",
  "clarifying_question": <null, or a short clarifying question if confidence < 0.6>
}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error:", errText);
      return Response.json({ error: "AI classification failed" }, { status: 502, headers: CORS });
    }

    const aiData     = await aiRes.json();
    const rawContent = aiData.content?.[0]?.text ?? "";

    let parsed: any;
    try {
      const clean = rawContent
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error("Parse error for AI output:", rawContent);
      return Response.json({ error: "AI response parse error" }, { status: 502, headers: CORS });
    }

    // Validate category
    if (!TRADE_CATEGORIES.includes(parsed.category as TradeCategory)) {
      parsed.category   = null;
      parsed.confidence = 0;
    }

    // Log (service role bypasses RLS)
    await serviceClient.from("job_match_logs").insert({
      user_id:      user.id,
      query,
      category:     parsed.category,
      confidence:   parsed.confidence,
      job_title:    parsed.job_title,
      raw_response: aiData,
    });

    return Response.json({
      category:            parsed.category,
      confidence:          parsed.confidence,
      job_title:           parsed.job_title,
      extracted_details:   parsed.extracted_details,
      clarifying_question: parsed.confidence < 0.6 ? (parsed.clarifying_question ?? null) : null,
    }, { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("agent-job-match error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
});
