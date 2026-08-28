import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getServiceKey } from '../_shared/secretKey.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = getServiceKey();
const SYNTHETIC_DOMAIN = 'tradease-employee.local';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no_auth' }, 401);

    // Verify the caller using their bearer token
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'not_authenticated' }, 401);
    const ownerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { action } = body;

    // ── Fetch contractor (owner) ──────────────────────
    const { data: contractor, error: cErr } = await admin
      .from('contractors')
      .select('id, company_tag, company_pin_hash, next_employee_number, tag_locked, plan')
      .eq('id', ownerId)
      .single();
    if (cErr || !contractor) return json({ error: 'not_a_contractor' }, 403);
    if (!contractor.company_tag || !contractor.company_pin_hash) {
      return json({ error: 'set_company_credentials_first' }, 400);
    }

    // ── CREATE EMPLOYEE ───────────────────────────────
    if (action === 'create') {
      const displayName: string = (body.display_name ?? '').trim();

      // Get plan limit
      const { data: limitData } = await admin.rpc('employee_limit_for_plan', { p_plan: contractor.plan });
      const limit: number = limitData ?? 3;

      const { count } = await admin.from('employees').select('*', { count: 'exact', head: true }).eq('company_id', ownerId);
      if ((count ?? 0) >= limit) return json({ error: 'limit_reached', limit }, 400);

      // Get the company PIN — we'll need it as the password
      // But we only have the HASH stored. Can't reverse a bcrypt hash.
      // So: caller must pass the pin so we can set it as password.
      const pin: string = body.pin;
      if (!pin || !/^[0-9]{4,8}$/.test(pin)) return json({ error: 'pin_required' }, 400);

      // Verify the PIN matches stored hash by calling verify_employee_login style check
      const { data: pinCheck } = await admin.rpc('verify_company_pin', { p_company_id: ownerId, p_pin: pin });
      if (pinCheck !== true) {
        // Fallback: check via crypt() in SQL
        const { data: cryptCheck } = await admin
          .from('contractors')
          .select('id')
          .eq('id', ownerId)
          .filter('company_pin_hash', 'eq', null) // placeholder
          .maybeSingle();
        // We need a real verification — use a raw SQL query
        const { data: ok } = await admin.rpc('check_pin_matches', { p_company_id: ownerId, p_pin: pin });
        if (!ok) return json({ error: 'pin_mismatch' }, 400);
      }

      const empNum = contractor.next_employee_number ?? 1;
      const tagLower = contractor.company_tag.toLowerCase();
      const username = `${contractor.company_tag}${empNum}`;
      const email = `${tagLower}${empNum}@${SYNTHETIC_DOMAIN}`;

      // Create auth user
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
        user_metadata: { is_employee: true, company_id: ownerId, username },
      });
      if (createErr || !created.user) return json({ error: 'auth_create_failed', detail: createErr?.message }, 500);

      // Insert employee row
      const { data: emp, error: empErr } = await admin.from('employees').insert({
        company_id: ownerId,
        auth_user_id: created.user.id,
        employee_number: empNum,
        username,
        display_name: displayName || null,
        email_synthetic: email,
      }).select().single();

      if (empErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: 'employee_insert_failed', detail: empErr.message }, 500);
      }

      // Bump counter + lock tag
      await admin.from('contractors').update({
        next_employee_number: empNum + 1,
        tag_locked: true,
      }).eq('id', ownerId);

      return json({ success: true, employee: emp });
    }

    // ── DELETE EMPLOYEE ───────────────────────────────
    if (action === 'delete') {
      const employeeId: string = body.employee_id;
      if (!employeeId) return json({ error: 'employee_id_required' }, 400);

      const { data: emp } = await admin
        .from('employees')
        .select('id, auth_user_id, company_id')
        .eq('id', employeeId)
        .single();
      if (!emp || emp.company_id !== ownerId) return json({ error: 'not_authorized' }, 403);

      if (emp.auth_user_id) await admin.auth.admin.deleteUser(emp.auth_user_id);
      // Row cascades via FK

      // Unlock tag if no employees remain
      const { count } = await admin.from('employees').select('*', { count: 'exact', head: true }).eq('company_id', ownerId);
      if ((count ?? 0) === 0) {
        await admin.from('contractors').update({ tag_locked: false, next_employee_number: 1 }).eq('id', ownerId);
      }

      return json({ success: true });
    }

    // ── RESET PIN (logs out all employees, updates company pin) ─
    if (action === 'reset_pin') {
      const newPin: string = body.new_pin;
      if (!newPin || !/^[0-9]{4,8}$/.test(newPin)) return json({ error: 'pin_invalid' }, 400);

      // Update each employee's auth password to the new PIN
      const { data: emps } = await admin.from('employees').select('auth_user_id').eq('company_id', ownerId);
      for (const e of emps ?? []) {
        if (e.auth_user_id) {
          await admin.auth.admin.updateUserById(e.auth_user_id, { password: newPin });
        }
      }

      // Update stored hash on contractor row
      const { error: hashErr } = await admin.rpc('update_company_pin_hash', { p_pin: newPin });
      if (hashErr) return json({ error: 'hash_update_failed', detail: hashErr.message }, 500);

      return json({ success: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('manage-employee error:', err);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});
