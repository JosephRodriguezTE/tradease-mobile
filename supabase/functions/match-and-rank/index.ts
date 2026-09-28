import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Classifies a free-text job search into a trade category (via
// agent-job-match) for the home tab, which then navigates to Find Contractor
// with that category. It used to also return a ranked contractor list from
// get_ranked_contractors() -- via the service-role client -- that no caller
// ever read (app/(tabs)/index.tsx only destructures { match, agent_failed },
// in every version since the call was added). Removed along with the
// service-role client it was the only use of.

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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const body  = await req.json();
    const query = (body?.query ?? "").toString().trim();

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

    return Response.json({
      match,
      agent_failed: agentFailed,
    }, { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("match-and-rank error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: CORS });
  }
});
