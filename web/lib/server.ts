import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Lang } from "@/content/catalogue";
import { can, isRole, type Access, type Permission, type Role } from "@/lib/rbac";
import { verifyStaffToken } from "@/lib/staff-jwt";

// Service-role client: bypasses RLS, so only use it after checking who the actor is.
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const priv = () => admin.schema("ichido");

export type Staff = { kind: "staff"; uid: string; role: Role; name: string; aal: "aal1" | "aal2"; session: string };
export type Actor =
  | Staff
  | { kind: "caller"; uid: string; incident: string | null; lang: Lang | null; expires: string | null; voiceRoom: string | null }
  | { kind: "none" };

// Derive the actor from credentials only; never trust role or incident fields in the body.
// Staff: a token minted by /api/auth/supabase-token (bearer), or the Better Auth session cookie from this site.
// Callers: a Supabase anonymous user's access token. The role always comes from the database.
export async function actorFrom(req: Request): Promise<Actor> {
  const token = bearer(req);
  if (token) {
    const claims = verifyStaffToken(token);
    return claims ? staffSession(claims.sub, claims.session_id) : callerFrom(token);
  }
  if (!SESSION_COOKIE.test(req.headers.get("cookie") ?? "") || !sameSite(req)) return { kind: "none" };
  const { auth } = await import("@/lib/auth");
  const s = await auth.api.getSession({ headers: req.headers });
  return s ? staffSession(s.user.id, s.session.id) : { kind: "none" };
}
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?ichido\.session_token=/;

// A live, unbanned Better Auth session of a staff member, with the role from ichido.staff.
async function staffSession(uid: string, session: string): Promise<Actor> {
  const { pool } = await import("@/lib/auth");
  const { rows } = await pool.query(
    `select s.role::text as role, s.display_name as name, x.aal from auth_ba."session" x
       join auth_ba."user" u on u.id = x."userId" join ichido.staff s on s.uid = u.id
      where x.id = $1::uuid and x."userId" = $2::uuid and x."expiresAt" > now() and not u.banned`, [session, uid]);
  const r = rows[0];
  return r && isRole(r.role) ? { kind: "staff", uid, role: r.role, name: r.name, aal: r.aal === "aal2" ? "aal2" : "aal1", session } : { kind: "none" };
}

async function callerFrom(token: string): Promise<Actor> {
  const { data, error } = await admin.auth.getUser(token);
  if (error && (!error.status || error.status >= 500 || error.status === 429)) throw error;
  if (error || !data.user?.is_anonymous) return { kind: "none" };
  const uid = data.user.id;
  const { data: b, error: bindingError } = await priv()
    .from("binding").select("incident, lang, expires, voice_room").eq("uid", uid).gt("expires", new Date().toISOString()).maybeSingle();
  if (bindingError) throw bindingError;
  return { kind: "caller", uid, incident: b?.incident ?? null, lang: b?.lang ?? null, expires: b?.expires ?? null, voiceRoom: b?.voice_room ?? null };
}

// Cookie-authenticated requests must come from this site (CSRF): browsers send Origin on every POST.
// A request with no Origin and no Fetch Metadata is not from a browser (the mobile app, scripts).
export function sameSite(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const own = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : null;
  return origin === new URL(req.url).origin || origin === own;
}

// Deny by default: what a command or route needs (lib/rbac.ts), checked against the actor from actorFrom.
// Every staff permission needs a session that passed a second factor.
export function authorize(a: Actor, access: Access | undefined): void {
  if (access === "any") return;
  if (access === "caller") {
    if (a.kind !== "caller") fail(403, "forbidden");
    return;
  }
  if (!access || a.kind !== "staff") return fail(403, "forbidden");
  if (a.aal !== "aal2") fail(403, "mfa_required");
  if (!can(a.role, access)) fail(403, "forbidden");
}

// A staff member allowed `permission`, or a thrown 403.
export function staffWith(a: Actor, permission: Permission): Staff {
  authorize(a, permission);
  return a as Staff;
}

function bearer(req: Request) {
  return /^Bearer ([^\s]+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
}

// The request's bearer equals a configured secret (constant time; an unset secret never matches).
export function bearerIs(req: Request, expected: unknown): boolean {
  const given = bearer(req);
  const hash = (value: string) => createHash("sha256").update(value).digest();
  const match = timingSafeEqual(hash(given), hash(typeof expected === "string" ? expected : ""));
  return match && Boolean(given) && typeof expected === "string";
}

export function deviceStation(req: Request): string | null {
  const id = req.headers.get("x-station") ?? "";
  const secrets: Record<string, unknown> = JSON.parse(process.env.DEVICE_SECRETS_JSON ?? "{}");
  return bearerIs(req, Object.hasOwn(secrets, id) ? secrets[id] : null) ? id : null;
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
