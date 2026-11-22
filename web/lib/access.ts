import "server-only";
import { createHash, randomInt } from "node:crypto";
import { DEVICE_FAULT } from "@/content/catalogue";
import { admin, priv, fail, event, HttpError, type Actor } from "@/lib/server";

// The path with no voice. A deaf or speech-impaired caller presses "I can't hear / I can't speak" on the sticker
// page; the case is flagged text-only; the operator shows the single-use code on the Help Point's own display
// instead of saying it over the handset. The device reads it on its status poll (/api/device, X-Display: 1).

export type Body = Record<string, unknown>;
export type Command = (a: Actor, b: Body) => Promise<object>;
type Staff = Extract<Actor, { kind: "staff" }>;

// Same codes as issue_code in app/api/cmd/route.ts, so either path pairs the same way.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60_000;
const STATUS: Record<string, number> = { forbidden: 403, not_found: 404, conflict: 409, bad_request: 400, rate_limited: 429 };

export const str = (b: Body, k: string) => (typeof b[k] === "string" && b[k] ? (b[k] as string) : fail(400, "bad_request"));
const digest = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

// Calls a command function and maps its stable error code to HTTP, as the route does.
export async function rpc<T = unknown>(fn: string, args: Body): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    if (Object.hasOwn(STATUS, error.message)) throw new HttpError(STATUS[error.message], error.message);
    throw error;
  }
  return data as T;
}

export function staffIn(a: Actor, roles: Staff["role"][]): Staff {
  if (a.kind !== "staff" || !roles.includes(a.role)) fail(403, "forbidden");
  return a as Staff;
}

export const accessCommands: Record<string, Command> = {
  // Caller on /s/<station>, not paired yet. No body beyond the station: nothing personal is sent or stored.
  async silent_alert(a, b) {
    if (a.kind !== "caller") return fail(403, "forbidden");
    if (a.incident) fail(409, "conflict");
    await rpc("cmd_silent_alert", { p_uid: a.uid, p_station: str(b, "station"), p_fault: DEVICE_FAULT });
    return {};
  },

  // Operator: a fresh single-use code, shown on this case's Help Point until it is used, replaced or expires.
  async show_code_on_device(a, b) {
    const op = staffIn(a, ["operator"]);
    const incident = str(b, "incident");
    const { data: d } = await admin.from("desk").select("id").eq("id", incident).eq("operator_id", op.uid).is("finished_at", null).maybeSingle();
    if (!d) fail(403, "forbidden");
    const { data: bound } = await priv().from("binding").select("expires").eq("incident", incident).maybeSingle();
    if (bound && Date.parse(bound.expires) > Date.now()) fail(409, "conflict");
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const pair = await priv().from("pair_code").upsert({ incident, digest: digest(code), expires: new Date(Date.now() + CODE_TTL_MS).toISOString() });
    if (pair.error) throw pair.error;
    const shown = await priv().from("device_code").upsert({ incident, code, digest: digest(code) });
    if (shown.error) throw shown.error;
    await event(incident, "operator", "device_code", {}, op.name);
    return { code, expires_in: CODE_TTL_MS / 1000 };
  },
};

// Extra lines for a Help Point with a display: "code=", "ttl=" (seconds) and "guard=" (the guard's state).
// Null when the lookup fails, so the device shows "offline" rather than a wrong screen.
export async function displayLines(station: string): Promise<string | null> {
  const { data, error } = await admin.rpc("device_display", { p_station: station });
  if (error) return null;
  return Object.entries((data ?? {}) as Record<string, string | number>).map(([k, v]) => `\n${k}=${v}`).join("");
}
