// Supabase Edge Function — process-account-deletions
//
// Internal-only: authenticated via x-tradease-internal, matching every
// other internal function in this project. Its only caller is
// sweep_account_deletions() (pg_cron, hourly), which fires one net.http_post
// per eligible request -- each invocation of this function handles exactly
// one account_deletion_requests row, independently of any other.
//
// Order matters and is deliberate:
//   1. process_account_deletion() (SQL, one transaction) -- anonymizes/
//      deletes everything that's pure DB state, and computes the exact
//      storage objects this user owns. Returns early with `deferred` if
//      the user has an active booking, a held/pending payment, or an open
//      dispute -- nothing is touched in that case, and the reason is
//      already logged to the request row by the SQL function itself.
//   2. auth.admin.updateUserById() -- the real Admin API call for the
//      email change + ban. Never done via direct SQL: GoTrue owns
//      auth.users' email-uniqueness and email_change-token invariants,
//      and bypassing that risks leaving them inconsistent.
//   3. Storage removal, per bucket, using the exact paths the SQL
//      function already resolved (no path-guessing here).
//   4. Only if 2 and 3 BOTH succeed: mark the request 'done'. If either
//      fails, the request stays 'pending' (scheduled_delete_at is already
//      in the past) so the next hourly sweep retries it -- safe, because
//      every step here is idempotent (re-running the RPC is a no-op past
//      the first success, re-banning/re-emailing is harmless, and
//      storage.remove() on an already-removed path is not an error).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";
import { isValidInternalSecret } from "../_shared/internalSecret.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = getServiceKey();

// GoTrue has no literal "forever" ban -- ~100 years is the conventional
// stand-in used for a permanent ban via ban_duration.
const PERMANENT_BAN = "876000h";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const providedSecret = req.headers.get("x-tradease-internal");
  if (!isValidInternalSecret(providedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { request_id } = await req.json();
    if (!request_id) return json({ error: "request_id required" }, 400);

    const { data: result, error: rpcErr } = await admin.rpc("process_account_deletion", {
      p_request_id: request_id,
    });
    if (rpcErr) {
      console.error("[process-account-deletions] RPC failed:", rpcErr);
      return json({ error: rpcErr.message }, 500);
    }

    if (result?.skipped) {
      return json({ skipped: true, reason: result.reason });
    }
    if (result?.deferred) {
      console.log(`[process-account-deletions] deferred ${request_id}: ${result.reason}`);
      return json({ deferred: true, reason: result.reason });
    }

    const userId: string = result.user_id;
    const errors: string[] = [];

    // Step 2 — Admin API: free the original email, ban future sign-in.
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      email: `deleted-${userId}@invalid`,
      email_confirm: true,
      ban_duration: PERMANENT_BAN,
    });
    if (authErr) {
      console.error("[process-account-deletions] auth admin update failed:", authErr);
      errors.push(`auth: ${authErr.message}`);
    }

    // Step 3 — storage cleanup, bucket by bucket, using the paths the SQL
    // function already resolved from storage.objects directly.
    const targets = (result.storage_targets ?? {}) as Record<string, string[]>;
    for (const [bucket, paths] of Object.entries(targets)) {
      if (!paths || paths.length === 0) continue;
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
      if (rmErr) {
        console.error(`[process-account-deletions] storage remove failed (${bucket}):`, rmErr);
        errors.push(`storage:${bucket}: ${rmErr.message}`);
      }
    }

    if (errors.length > 0) {
      // Leave status='pending' -- scheduled_delete_at is already past, so
      // the next hourly sweep retries automatically.
      await admin
        .from("account_deletion_requests")
        .update({ defer_reason: `retry pending — ${errors.join(" | ")}`, last_attempted_at: new Date().toISOString() })
        .eq("id", request_id);
      return json({ partial: true, errors }, 207);
    }

    const { error: doneErr } = await admin
      .from("account_deletion_requests")
      .update({ status: "done", processed_at: new Date().toISOString() })
      .eq("id", request_id);
    if (doneErr) {
      console.error("[process-account-deletions] mark-done failed:", doneErr);
      return json({ error: doneErr.message }, 500);
    }

    return json({ success: true, user_id: userId });
  } catch (err: unknown) {
    console.error("[process-account-deletions] error:", err);
    return json({ error: String(err) }, 500);
  }
});
