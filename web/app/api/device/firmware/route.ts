import { reply } from "@/lib/server";
import { authenticateDevice } from "@/lib/request-security";
import { requestLog } from "@/lib/log";
import { firmwareVersion, validImageUrl } from "@/lib/firmware-manifest.mjs";

// Signed firmware manifest for Help Points, with the same per-station secret as /api/device.
// FIRMWARE_MANIFEST_JSON is the output of scripts/sign-firmware.mjs: {"version","url","sha256","signature_v2"} plus signature on the bootstrap release.
// Unset means no update is published (204). The device verifies the signature against the key compiled into
// it, so this route cannot push an unsigned image; it only authenticates the station and refuses bad config.
// Devices send their running version in X-Firmware; it is only logged.

type Manifest = { version: string; url: string; sha256: string; signature_v2?: string; signature?: string };

const rsaSignature = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[A-Za-z0-9+/]{512}|[A-Za-z0-9+/]{683}=)$/.test(value);

function published(): Manifest | null | "invalid" {
  const raw = process.env.FIRMWARE_MANIFEST_JSON;
  if (!raw) return null;
  if (raw.length > 2048) return "invalid";
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch (e) {
    if (e instanceof SyntaxError) return "invalid";
    throw e;
  }
  if (!m || typeof m !== "object") return "invalid";
  const { version, url, sha256, signature_v2, signature } = m;
  if (typeof version !== "string" || !firmwareVersion.test(version) ||
      typeof url !== "string" || !validImageUrl(url) ||
      typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return "invalid";
  const manifest: Manifest = { version, url, sha256 };
  if (signature_v2 !== undefined) {
    if (!rsaSignature(signature_v2)) return "invalid";
    manifest.signature_v2 = signature_v2;
  }
  if (signature !== undefined) {
    if (!rsaSignature(signature)) return "invalid";
    manifest.signature = signature;
  }
  return manifest.signature || manifest.signature_v2 ? manifest : "invalid";
}

export async function GET(req: Request): Promise<Response> {
  const log = requestLog("/api/device/firmware");
  const station = await authenticateDevice(req, "/api/device/firmware");
  if (station instanceof Response) return station;
  const header = req.headers.get("x-firmware") ?? "";
  const fw = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(header) ? header : undefined;
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
