"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// One browser client per tab; the session lives in localStorage.
export function sb(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  return client;
}

// Call a server command with the signed-in user's token.
export async function cmd<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await sb().auth.getSession();
  const res = await fetch("/api/cmd", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ cmd: name, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}
