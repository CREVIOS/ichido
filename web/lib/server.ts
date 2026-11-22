import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/content/catalogue";

// Service-role client: bypasses RLS, so only use it after checking who the actor is.
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const priv = () => admin.schema("ichido");

export type Actor =
  | { kind: "staff"; uid: string; role: "operator" | "field" | "manager"; name: string }
  | { kind: "caller"; uid: string; incident: string | null; lang: Lang | null; expires: string | null }
  | { kind: "none" };

// Derive the actor from the bearer token only; never trust role or incident fields in the body.
export async function actorFrom(req: Request): Promise<Actor> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { kind: "none" };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { kind: "none" };
  const uid = data.user.id;
  const { data: staff } = await priv().from("staff").select("role, display_name").eq("uid", uid).maybeSingle();
  if (staff) return { kind: "staff", uid, role: staff.role, name: staff.display_name };
  if (!data.user.is_anonymous) return { kind: "none" };
  const { data: b } = await priv()
    .from("binding").select("incident, lang, expires").eq("uid", uid).gt("expires", new Date().toISOString()).maybeSingle();
  return { kind: "caller", uid, incident: b?.incident ?? null, lang: b?.lang ?? null, expires: b?.expires ?? null };
}

// An ESP32 Help Point authenticates with a per-station secret: Authorization: Bearer <secret>, X-Station: <id>.
// Returns the station id, or null with the reason for logs; `station` is set only for configured ids,
// so an arbitrary X-Station header never reaches the logs.
type DeviceAuth = { id: string } | { id: null; reason: "no_secret" | "unknown_station" | "bad_secret"; station?: string };
export function deviceStation(req: Request): DeviceAuth {
  const id = req.headers.get("x-station") ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer(\s+|$)/i, "");
  const secrets = JSON.parse(process.env.DEVICE_SECRETS_JSON ?? "{}") as Record<string, string>;
  const expected = Object.hasOwn(secrets, id) ? secrets[id] : undefined;
  if (!expected) return { id: null, reason: "unknown_station" };
  if (!given) return { id: null, reason: "no_secret", station: id };
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected)) ? { id } : { id: null, reason: "bad_secret", station: id };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

// SQL commands raise a stable code (supabase/migrations/*_commands.sql); map it to HTTP.
const STATUS: Record<string, number> = { forbidden: 403, not_found: 404, conflict: 409, bad_request: 400, rate_limited: 429 };
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    if (Object.hasOwn(STATUS, error.message)) fail(STATUS[error.message], error.message);
    throw error;
  }
  return data as T;
}

export function reply(status: number, body: object): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function event(incident: string, actor: string, kind: string, data: Record<string, unknown>, actor_name?: string) {
  const { error } = await admin.from("case_event").insert({ incident, actor, kind, data, actor_name });
  if (error) throw error;
}

export async function setLight(station: string, state: string) {
  const { error } = await admin.from("light").upsert({ station, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}
