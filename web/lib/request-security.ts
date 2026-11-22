import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { requestLog } from "@/lib/log";
import { admin, deviceStation, reply } from "@/lib/server";

const tooLarge = () => reply(413, { error: "body_too_large" });
const malformed = () => reply(400, { error: "bad_request" });

export async function boundedText(req: Request, maxBytes: number): Promise<string | Response> {
  if (Number(req.headers.get("content-length")) > maxBytes) return tooLarge();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    if (error instanceof TypeError) return malformed();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function boundedJson(req: Request, maxBytes: number): Promise<Record<string, unknown> | Response> {
  const text = await boundedText(req, maxBytes);
  if (text instanceof Response) return text;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : malformed();
  } catch (error) {
    if (error instanceof SyntaxError) return malformed();
    throw error;
  }
}

export async function limitKey(scope: string, key: string, limit: number, seconds: number, checkOnly = false) {
  const { data, error } = await admin.rpc("take_rate_limit", {
    p_scope: scope, p_key: createHash("sha256").update(key).digest("hex"), p_limit: limit, p_seconds: seconds, p_check_only: checkOnly,
  });
  if (error || typeof data !== "boolean") return reply(503, { error: "unavailable" });
  if (data) return null;
  const res = reply(429, { error: "rate_limited" });
  res.headers.set("retry-after", String(seconds));
  return res;
}

export function limitSource(headers: Headers, scope: string, limit: number, seconds: number, checkOnly = false) {
  // Vercel overwrites this header. Without a trusted ingress, share one bucket.
  const ip = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  return limitKey(scope, ip && isIP(ip) ? ip : "shared", limit, seconds, checkOnly);
}

export async function authenticateDevice(req: Request, route: string) {
  const blocked = await limitSource(req.headers, "device_auth_failure", 20, 60, true);
  if (blocked) return blocked;
  const station = deviceStation(req);
  if (station) return station;
  const limited = await limitSource(req.headers, "device_auth_failure", 20, 60);
  if (limited) return limited;
  requestLog(route).warn("device_auth_failed", { status: 401, code: "bad_credentials" });
  return reply(401, { error: "unauthorised" });
}
