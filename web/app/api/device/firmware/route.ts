import { reply, deviceStation } from "@/lib/server";
import { requestLog } from "@/lib/log";

// Signed firmware manifest for Help Points, with the same per-station secret as /api/device.
// FIRMWARE_MANIFEST_JSON is the output of scripts/sign-firmware.mjs: {"version","url","sha256","signature"}.
// Unset means no update is published (204). The device verifies the signature against the key compiled into
// it, so this route cannot push an unsigned image; it only authenticates the station and refuses bad config.
// Devices send their running version in X-Firmware; it is only logged.

type Manifest = { version: string; url: string; sha256: string; signature: string };

const FIELDS: Record<keyof Manifest, RegExp> = {
  version: /^\d+\.\d+\.\d+$/,
  url: /^https?:\/\/[^\s"\\]{1,400}$/,
  sha256: /^[0-9a-f]{64}$/,
  signature: /^[A-Za-z0-9+/]{100,680}={0,2}$/,
};

function published(): Manifest | null | "invalid" {
  const raw = process.env.FIRMWARE_MANIFEST_JSON;
  if (!raw) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch (e) {
    if (e instanceof SyntaxError) return "invalid";
    throw e;
  }
  const ok = m !== null && typeof m === "object" &&
    (Object.keys(FIELDS) as (keyof Manifest)[]).every((k) => typeof m[k] === "string" && FIELDS[k].test(m[k] as string));
  return ok ? { version: m.version, url: m.url, sha256: m.sha256, signature: m.signature } as Manifest : "invalid";
}

export async function GET(req: Request): Promise<Response> {
  const log = requestLog("/api/device/firmware", req);
  const auth = deviceStation(req);
  if (auth.id === null) {
    log.warn("device_auth_failed", { status: 401, code: auth.reason, station: auth.station });
    return reply(401, { error: "unauthorised" });
  }
  const station = auth.id;
  const header = req.headers.get("x-firmware") ?? "";
  const fw = /^[A-Za-z0-9._+-]{1,32}$/.test(header) ? header : undefined;
  const m = published();
  if (m === "invalid") {
    log.error("device_firmware", { station, fw, status: 500, code: "bad_manifest" });
    return reply(500, { error: "firmware manifest misconfigured" });
  }
  if (!m) {
    log.info("device_firmware", { station, fw, status: 204, code: "none" });
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  log.info("device_firmware", { station, fw, fw_target: m.version, status: 200, code: fw === m.version ? "current" : "offered" });
  return reply(200, m);
}
