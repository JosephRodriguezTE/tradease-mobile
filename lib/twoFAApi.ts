import { supabase } from './supabase';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

function requireApiBase() {
  if (!API_BASE) throw new Error('2FA service is not yet available.');
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function twoFASend(
  purpose: '2fa_login' | '2fa_setup',
  method?: 'email' | 'phone',
  phone?: string,
): Promise<{ method: string; masked: string }> {
  requireApiBase();
  const res = await fetch(`${API_BASE}/api/2fa/send`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ purpose, method, phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to send code.');
  return data;
}

export async function twoFAVerify(
  code: string,
  purpose: '2fa_login' | '2fa_setup',
  method?: string,
  phone?: string,
): Promise<void> {
  requireApiBase();
  const res = await fetch(`${API_BASE}/api/2fa/verify`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code, purpose, method, phone }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? 'Incorrect code. Try again.');
  }
}

export async function twoFADisable(): Promise<void> {
  requireApiBase();
  const res = await fetch(`${API_BASE}/api/2fa/disable`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? 'Failed to disable 2FA.');
  }
}
