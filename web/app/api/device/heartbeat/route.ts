import { after } from "next/server";
import { admin, reply, deviceStation } from "@/lib/server";
import { requestLog, errorFields } from "@/lib/log";

// Device telemetry, every 60 s, with the same per-station secret as /api/device.
// Body: {"uptime_s":…, "free_heap":…, "rssi":…, "fw":"1.1.0", "ack_ms":…|-1, "poll_ms":…|-1} (-1 = none yet).
// Stored in public.device_health (operators and managers read it) and, when configured, forwarded as a
// Better Stack heartbeat so a silent device raises an incident.

const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined);
const optional = (v: unknown) => (v === -1 ? null : int(v, 0, 600_000));

export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/device/heartbeat", req);
  const auth = deviceStation(req);
  if (auth.id === null) {
    log.warn("device_auth_failed", { status: 401, code: auth.reason, station: auth.station });
    return reply(401, { error: "unauthorised" });
  }
  const station = auth.id;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const t = b && {
    uptime_s: int(b.uptime_s, 0, 2 ** 40),
    free_heap: int(b.free_heap, 0, 2 ** 31 - 1),
    rssi: int(b.rssi, -127, 0),
    fw: typeof b.fw === "string" && /^[A-Za-z0-9._+-]{1,32}$/.test(b.fw) ? b.fw : undefined,
    ack_ms: optional(b.ack_ms),
    poll_ms: optional(b.poll_ms),
  };
  if (!t || Object.values(t).some((v) => v === undefined)) {
    log.warn("device_heartbeat", { station, status: 400, code: "bad_telemetry" });
    return reply(400, { error: "bad telemetry" });
  }
  const { error } = await admin.from("device_health").upsert({
    station, last_seen: new Date().toISOString(), uptime_s: t.uptime_s, free_heap: t.free_heap, rssi: t.rssi,
    firmware: t.fw, ack_ms: t.ack_ms, poll_ms: t.poll_ms,
  });
  if (error) {
    log.error("device_heartbeat", { station, status: 500, ...errorFields(error) });
    return reply(500, { error: "not recorded" });
  }
  log.info("device_heartbeat", {
    station, status: 204, uptime_s: t.uptime_s, free_heap: t.free_heap, rssi: t.rssi, fw: t.fw,
    ack_ms: t.ack_ms ?? undefined, poll_ms: t.poll_ms ?? undefined,
  });

  const urls = JSON.parse(process.env.BETTERSTACK_DEVICE_HEARTBEATS_JSON ?? "{}") as Record<string, string>;
  const url = Object.hasOwn(urls, station) ? urls[station] : undefined;
  if (url) {
    after(async () => {
      const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(3000) }).catch((e: unknown) => e);
      if (!(res instanceof Response) || !res.ok) {
        log.warn("heartbeat_forward_failed", { station, status: res instanceof Response ? res.status : undefined, ...(res instanceof Response ? {} : errorFields(res)) });
      }
    });
  }
  return new Response(null, { status: 204 });
}
