// Resolves and validates the x-tradease-internal internal service-to-
// service secret, with a temporary second slot for zero-downtime
// rotation.
//
// INTERNAL_SECRET is the current value -- senders read it via
// getInternalSecret(). INTERNAL_SECRET_NEXT is optional and only present
// during a rotation window (a new secret has been generated and senders
// are being switched over one at a time); receivers use
// isValidInternalSecret() to accept either value until every sender has
// moved onto the new one, at which point the dual-accept goes away and
// this file goes back to checking a single value.

const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET')!;
const INTERNAL_SECRET_NEXT = Deno.env.get('INTERNAL_SECRET_NEXT');

export function getInternalSecret(): string {
  return INTERNAL_SECRET;
}

export function isValidInternalSecret(provided: string | null | undefined): boolean {
  if (!provided) return false;
  if (provided === INTERNAL_SECRET) return true;
  if (INTERNAL_SECRET_NEXT !== undefined && provided === INTERNAL_SECRET_NEXT) return true;
  return false;
}
