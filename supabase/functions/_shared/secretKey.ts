// Resolves the Supabase service/secret key, preferring the new
// sb_secret_ key system (SUPABASE_SECRET_KEYS) over the legacy JWT
// (SUPABASE_SERVICE_ROLE_KEY). Import this instead of reading either
// env var directly -- every function migrates through one place, and
// rollback is deleting an env var, not a redeploy.
//
// Fallback to legacy only happens when the new system genuinely isn't
// configured (var unset, or not valid JSON) -- an expected state
// mid-migration. If the var IS set and IS valid JSON but the resolved
// value is missing, empty, or doesn't look like a real secret key,
// this throws instead of silently falling back. A structurally-present
// but broken new-key config must never be masked by a fallback that
// makes it look like nothing's wrong.
//
// Logs which path was used, at info level, on every call -- never the
// key itself, just { key_source: "sb_secret" | "legacy" } -- so a
// caller reading logs can tell which key actually served a request
// instead of inferring it from a successful response alone.

export type KeySource = 'sb_secret' | 'legacy';

const SECRET_KEY_NAME = 'default';

function logResolution(source: KeySource): void {
  console.log(JSON.stringify({ level: 'info', msg: 'resolved service key', key_source: source }));
}

export function getServiceKey(): string {
  const rawSecretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (rawSecretKeys === undefined) {
    if (!legacyKey) {
      throw new Error('Neither SUPABASE_SECRET_KEYS nor SUPABASE_SERVICE_ROLE_KEY is set.');
    }
    logResolution('legacy');
    return legacyKey;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawSecretKeys);
  } catch {
    console.warn(JSON.stringify({
      level: 'warn',
      msg: 'SUPABASE_SECRET_KEYS is set but is not valid JSON -- falling back to legacy key',
    }));
    if (!legacyKey) {
      throw new Error('SUPABASE_SECRET_KEYS is unparseable and SUPABASE_SERVICE_ROLE_KEY is not set -- no usable key.');
    }
    logResolution('legacy');
    return legacyKey;
  }

  const candidate = parsed[SECRET_KEY_NAME];

  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error(
      `SUPABASE_SECRET_KEYS is set and parses as JSON, but has no usable "${SECRET_KEY_NAME}" entry. ` +
      `This is a misconfiguration, not a not-yet-migrated case -- not falling back to legacy. Fix the env var.`
    );
  }

  if (!candidate.startsWith('sb_secret_')) {
    throw new Error(
      `SUPABASE_SECRET_KEYS["${SECRET_KEY_NAME}"] does not look like a secret key (expected an "sb_secret_" prefix). ` +
      `This is a misconfiguration -- not falling back to legacy. Fix the env var.`
    );
  }

  logResolution('sb_secret');
  return candidate;
}
