import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";

const PRO_PRIORITY_WITHIN_FEATURED = false;

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = getServiceKey();

    const userClient    = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const body  = await req.json();
    const query = (body?.query ?? "").toString().trim();
    const area  = body?.area ?? null;

    if (!query) {
      return Response.json({ error: "query is required" }, { status: 400, headers: CORS });
    }

    // Step 1 — classify with AI agent
    let match: any = { category: null, confidence: 0, job_title: null, extracted_details: null, clarifying_question: null };
    let agentFailed = false;

    try {
      const agentRes = await fetch(`${supabaseUrl}/functions/v1/agent-job-match`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type":  "application/json",
          "apikey":        anonKey,
        },
        body: JSON.stringify({ query }),
      });

      if (agentRes.ok) {
        match = await agentRes.json();
        if (match.error === "rate_limited") {
          return Response.json(match, { status: 429, headers: CORS });
        }
        if (match.error) {
          agentFailed = true;
          match = { category: null, confidence: 0, job_title: null, extracted_details: null, clarifying_question: null };
        }
      } else {
        agentFailed = true;
      }
    } catch {
      agentFailed = true;
    }

    // Step 2 — ranked contractors from RPC (server-side random() shuffle)
    const { data: contractors, error: rpcError } = await serviceClient.rpc(
      "get_ranked_contractors",
      {
        p_category:              match.category,
        p_area:                  area,
        p_pro_priority_featured: PRO_PRIORITY_WITHIN_FEATURED,
      }
    );

    if (rpcError) console.error("get_ranked_contractors error:", rpcError);

    return Response.json({
      match,
      contractors:  contractors ?? [],
      agent_failed: agentFailed,
    }, { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("match-and-rank error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
});
