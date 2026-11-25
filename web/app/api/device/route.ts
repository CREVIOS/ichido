import { HttpError, admin, priv, reply } from "@/lib/server";
import { deviceConfirm } from "@/lib/device-voice";
import { authenticateDevice, boundedText } from "@/lib/request-security";
import { requestLog, errorFields } from "@/lib/log";
import { isFault } from "@/content/catalogue";
import { defaultFault } from "@/lib/faults";
import { startBot } from "@/lib/bot";
import { digest, displayLines, pairingCode } from "@/lib/access";
import { flushAlerts } from "@/lib/alerts";
import { after } from "next/server";

// POST body: the 32-hex event id. Retries with the same id never create a second incident.
// X-Fault (optional) names another catalogue fault the monitoring side raises, e.g. phone_fraud; by default the
// station pack's situation for a press (an ATM: card retained). The database refuses a fault from another pack.
export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/device");
  const station = await authenticateDevice(req, "/api/device");
  if (station instanceof Response) return station;
  const body = await boundedText(req, 64);
  if (body instanceof Response) return body;
  const key = body.trim();
  // X-Action: confirm — a press during a device voice session confirms the read-back (lib/device-voice.ts).
  if (req.headers.get("x-action") === "confirm") return confirmPress(station, key, log);
  const fault = req.headers.get("x-fault") || await defaultFault(station);
  if (!isFault(fault)) {
    log.warn("device_fault", { station, status: 400, code: "bad_fault" });
    return reply(400, { error: "unknown fault" });
  }
  if (!/^[0-9a-f]{32}$/.test(key)) {
    log.warn("device_fault", { station, status: 400, code: "bad_event_id" });
    return reply(400, { error: "bad event id" });
  }
  // Only for the log: whether this is a retry of an event the server already recorded.
  const { data: seen } = await priv().from("device_event").select("incident").eq("station", station).eq("event_key", key).maybeSingle();
  const args = { p_station: station, p_key: key, p_fault: fault };
  const display = req.headers.get("x-display") === "1";
  const code = display ? pairingCode() : "";
  const { data: incident, error } = display
    ? await admin.rpc("cmd_display_press", { ...args, p_code: code, p_digest: digest(code) })
    : await admin.rpc("record_fault", { ...args, p_source: "device" });
  if (error) {
    log.error("device_fault", { station, fault, status: 500, duration_ms: log.ms(), ...errorFields(error) });
    return reply(500, { error: "not recorded" });
  }
  if (!seen) await startBot(incident as string);   // a second press on an open case finds its run already there
  after(flushAlerts);   // the new case's push to the operators on duty (lib/alerts.ts)
  log.info("device_fault", { station, fault, incident: incident as string, repeat: Boolean(seen), status: 204, duration_ms: log.ms() });
  return new Response(null, { status: 204 });
}

// 204 when confirmed (or a retried press already was); 409 when there is no device session or nothing to confirm yet.
async function confirmPress(station: string, key: string, log: ReturnType<typeof requestLog>): Promise<Response> {
  if (!/^[0-9a-f]{32}$/.test(key)) {
    log.warn("device_confirm", { station, status: 400, code: "bad_event_id" });
    return reply(400, { error: "bad event id" });
  }
  try {
    await deviceConfirm(station, key);
  } catch (error) {
    if (error instanceof HttpError) {
      log.warn("device_confirm", { station, status: error.status, code: error.message, duration_ms: log.ms() });
      return reply(error.status, { error: error.message });
    }
    log.error("device_confirm", { station, status: 500, duration_ms: log.ms(), ...errorFields(error) });
    return reply(500, { error: "not recorded" });
  }
  log.info("device_confirm", { station, status: 204, duration_ms: log.ms() });
  return new Response(null, { status: 204 });
}

// GET: the station light state as plain text (idle | received | review | field | guided | fraud).
// A Help Point with a display sends X-Display: 1 and also gets key=value lines (lib/access.ts displayLines).
// Polled every 2 s per device, so only failures are logged; liveness comes from the heartbeat.
export async function GET(req: Request): Promise<Response> {
  const log = requestLog("/api/device");
  const station = await authenticateDevice(req, "/api/device");
  if (station instanceof Response) return station;
  const { data, error } = await admin.from("light").select("state").eq("station", station).maybeSingle();
  // A lookup failure must not look like a healthy idle station; the device shows "offline" instead.
  if (error) {
    log.error("device_poll", { station, status: 503, ...errorFields(error) });
    return reply(503, { error: "unavailable" });
  }
  const extra = req.headers.get("x-display") === "1" ? await displayLines(station) : "";
  if (extra === null) {
    log.error("device_poll", { station, status: 503, code: "display" });
    return reply(503, { error: "unavailable" });
  }
  return new Response((data?.state ?? "idle") + extra, { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
