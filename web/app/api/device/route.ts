import { admin, priv, reply, deviceStation } from "@/lib/server";
import { requestLog, errorFields } from "@/lib/log";
import { DEVICE_FAULT } from "@/content/catalogue";

// POST body: the 32-hex event id. Retries with the same id never create a second incident.
export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/device", req);
  const auth = deviceStation(req);
  if (auth.id === null) {
    log.warn("device_auth_failed", { status: 401, code: auth.reason, station: auth.station });
    return reply(401, { error: "unauthorised" });
  }
  const station = auth.id;
  const key = (await req.text()).trim();
  if (!/^[0-9a-f]{32}$/.test(key)) {
    log.warn("device_fault", { station, status: 400, code: "bad_event_id" });
    return reply(400, { error: "bad event id" });
  }
  // Only for the log: whether this is a retry of an event the server already recorded.
  const { data: seen } = await priv().from("device_event").select("incident").eq("station", station).eq("event_key", key).maybeSingle();
  const { data: incident, error } = await admin.rpc("record_fault", { p_station: station, p_key: key, p_source: "device", p_fault: DEVICE_FAULT });
  if (error) {
    log.error("device_fault", { station, fault: DEVICE_FAULT, status: 500, duration_ms: log.ms(), ...errorFields(error) });
    return reply(500, { error: "not recorded" });
  }
  log.info("device_fault", { station, fault: DEVICE_FAULT, incident: incident as string, repeat: Boolean(seen), status: 204, duration_ms: log.ms() });
  return new Response(null, { status: 204 });
}

// GET: the station light state as plain text (idle | received | review | field | guided).
// Polled every 2 s per device, so only failures are logged; liveness comes from the heartbeat.
export async function GET(req: Request): Promise<Response> {
  const log = requestLog("/api/device", req);
  const auth = deviceStation(req);
  if (auth.id === null) {
    log.warn("device_auth_failed", { status: 401, code: auth.reason, station: auth.station });
    return reply(401, { error: "unauthorised" });
  }
  const { data, error } = await admin.from("light").select("state").eq("station", auth.id).maybeSingle();
  // A lookup failure must not look like a healthy idle station; the device shows "offline" instead.
  if (error) {
    log.error("device_poll", { station: auth.id, status: 503, ...errorFields(error) });
    return reply(503, { error: "unavailable" });
  }
  return new Response(data?.state ?? "idle", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
