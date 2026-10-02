// supabase-js's FunctionsHttpError.message is a hardcoded generic string
// ("Edge Function returned a non-2xx status code") -- it never reads the
// response body. This project's edge functions (work-order-transition
// included) return a real, specific { error: "..." } JSON body on every
// failure; it's only reachable via error.context, the raw Response.
// Without this, every distinct server-side rejection (no payment hold,
// payment record not found, wrong payment status, not authorized, etc.)
// surfaces identically as the same meaningless generic message.
export async function extractFunctionErrorMessage(error: any): Promise<string> {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // context wasn't JSON -- fall through to whatever message we have
    }
  }
  return error?.message ?? 'Could not update status. Try again.';
}
