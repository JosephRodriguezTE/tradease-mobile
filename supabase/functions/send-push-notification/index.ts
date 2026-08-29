import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/secretKey.ts";
import { isValidInternalSecret } from "../_shared/internalSecret.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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
      supabase.from("users").select("push_token").eq("id", notif.user_id).maybeSingle(),
      supabase.from("contractors").select("push_token").eq("id", notif.user_id).maybeSingle(),
    ]);

    const pushToken: string | null =
      userRow?.push_token ?? contractorRow?.push_token ?? null;

    await supabase
      .from("notifications")
      .update({ sent_push: true })
      .eq("id", notification_id);

    if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
      return json({ sent: false, reason: "no_valid_token" });
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
