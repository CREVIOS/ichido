"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

let caller: SupabaseClient | null = null;
let staff: SupabaseClient | null = null;
let token: { value: string; exp: number } | null = null;
let pending: Promise<string | null> | null = null;
const REFRESH_S = 60;   // ask for a new staff token this long before the current one expires

// A staff member's Supabase token, minted from their Better Auth session (/api/auth/supabase-token) and kept only
// in memory. Null when there is no session that passed a second factor.
export function staffToken(): Promise<string | null> {
  if (token && token.exp - Date.now() / 1000 > REFRESH_S) return Promise.resolve(token.value);
  pending ??= fetch("/api/auth/supabase-token", { method: "POST", credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) return (token = null);
      const body = (await res.json()) as { token: string; expires_at: number };
      token = { value: body.token, exp: body.expires_at };
      return body.token;
    })
    .finally(() => { pending = null; });
  return pending;
}

// StaffGate calls this once a staff session has a second factor: from then on this tab reads as that staff member,
// PostgREST and Realtime alike, with the token refreshed before it expires.
export function enterStaffSession() {
  staff ??= createClient(URL_, KEY, { accessToken: async () => (await staffToken()) ?? "" });
}

export function leaveStaffSession() {
  if (staff) void staff.removeAllChannels();
  staff = null;
  token = null;
}

export const isStaffSession = () => staff !== null;

// The tab's database client: the staff client after StaffGate let someone in, otherwise the caller's own
// Supabase anonymous session (kept in localStorage, as before).
export function sb(): SupabaseClient {
  if (staff) return staff;
  caller ??= createClient(URL_, KEY);
  return caller;
}

// Call a server command: as staff with the minted token, as a caller with the anonymous session's token.
// With neither, the request still carries this site's staff session cookie, if any (the station page asks "mine").
export async function cmd<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const bearer = staff ? await staffToken() : (await sb().auth.getSession()).data.session?.access_token;
  const res = await fetch("/api/cmd", {
    method: "POST",
    headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ cmd: name, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}
