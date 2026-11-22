import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS, so only use it after checking who the actor is.
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const priv = () => admin.schema("ichido");

export type Actor =
  | { kind: "staff"; uid: string; role: "operator" | "field" | "manager"; name: string }
  | { kind: "caller"; uid: string; incident: string | null; lang: "bn" | "en" | "ja" | null }
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
    .from("binding").select("incident, lang").eq("uid", uid).gt("expires", new Date().toISOString()).maybeSingle();
  return { kind: "caller", uid, incident: b?.incident ?? null, lang: b?.lang ?? null };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

export function reply(status: number, body: object): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function event(incident: string, actor: string, kind: string, detail_ja: string, actor_name?: string) {
  const { error } = await admin.from("case_event").insert({ incident, actor, kind, detail_ja, actor_name });
  if (error) throw error;
}

export async function setLight(station: string, state: string) {
  const { error } = await admin.from("light").upsert({ station, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}
