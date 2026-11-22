import { timingSafeEqual, createHash } from "node:crypto";
import { admin, reply } from "@/lib/server";
import { DEVICE_FAULT } from "@/content/catalogue";

// The ESP32 prop authenticates with a per-station secret: Authorization: Bearer <secret>, X-Station: <id>.
function station(req: Request): string | null {
  const id = req.headers.get("x-station") ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const secrets = JSON.parse(process.env.DEVICE_SECRETS_JSON ?? "{}") as Record<string, string>;
  const expected = secrets[id];
  if (!expected || !given) return null;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected)) ? id : null;
}

// POST body: the 32-hex event id. Retries with the same id never create a second incident.
export async function POST(req: Request): Promise<Response> {
  const id = station(req);
  if (!id) return reply(401, { error: "unauthorised" });
  const key = (await req.text()).trim();
  if (!/^[0-9a-f]{32}$/.test(key)) return reply(400, { error: "bad event id" });
  const { error } = await admin.rpc("record_fault", { p_station: id, p_key: key, p_source: "device", p_fault: DEVICE_FAULT });
  if (error) return reply(500, { error: "not recorded" });
  return new Response(null, { status: 204 });
}

// GET: the station light state as plain text (idle | received | review | field | guided).
export async function GET(req: Request): Promise<Response> {
  const id = station(req);
  if (!id) return reply(401, { error: "unauthorised" });
  const { data } = await admin.from("light").select("state, updated_at").eq("station", id).maybeSingle();
  return new Response(data?.state ?? "idle", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
