import { HttpError, reply } from "@/lib/server";
import { authenticateDevice, boundedText, limitKey } from "@/lib/request-security";
import { requestLog, errorFields } from "@/lib/log";
import { deviceVoiceGrant } from "@/lib/device-voice";

// POST, empty body: the Help Point's join grant for its station's device voice session (lib/device-voice.ts).
// The device asks when its status poll shows voice=1 and again whenever its session ends (at most 10 minutes).
// Reply: { url, token, session, ttl, needsAgent }, or 404 when the station has no live device session.
export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/device/voice");
  const station = await authenticateDevice(req, "/api/device/voice");
  if (station instanceof Response) return station;
  const body = await boundedText(req, 0);
  if (body instanceof Response) return body;
  const limited = await limitKey("device_voice", station, 10, 60);
  if (limited) return limited;
  let grant;
  try {
    grant = await deviceVoiceGrant(station);
  } catch (error) {
    if (error instanceof HttpError) {
      log.warn("device_voice", { station, status: error.status, code: error.message, duration_ms: log.ms() });
      return reply(error.status, { error: "voice_unavailable" });
    }
    log.error("device_voice", { station, status: 503, duration_ms: log.ms(), ...errorFields(error) });
    return reply(503, { error: "voice_unavailable" });
  }
  if (!grant) {
    log.warn("device_voice", { station, status: 404, code: "no_voice", duration_ms: log.ms() });
    return reply(404, { error: "no_voice" });
  }
  log.info("device_voice", { station, status: 200, ttl_s: grant.ttl, code: grant.needsAgent ? "agent" : "listen", duration_ms: log.ms() });
  return reply(200, grant);
}
