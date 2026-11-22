// Signed firmware manifest (/api/device/firmware) and scripts/sign-firmware.mjs.
// The route test follows the server's FIRMWARE_MANIFEST_JSON: 204 when unset, the manifest when set
// (run with the same value in .env.local for the server and the test).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { APP } from "./helpers.mjs";

const firmware = ({ station = "TABLE-A", secret = "local-device-secret" } = {}) =>
  fetch(`${APP}/api/device/firmware`, { headers: { "x-station": station, authorization: `Bearer ${secret}`, "x-firmware": "1.1.0" } });

test("firmware manifest needs the station's own secret", async () => {
  for (const who of [{ secret: "wrong" }, { secret: "" }, { station: "NO-SUCH-STATION" }, { station: "constructor" }]) {
    assert.equal((await firmware(who)).status, 401, JSON.stringify(who));
  }
});

test("firmware manifest is served as configured, or 204 when none is published", async () => {
  const res = await firmware();
  assert.equal(res.headers.get("cache-control"), "no-store");
  const configured = process.env.FIRMWARE_MANIFEST_JSON;
  if (!configured) return assert.equal(res.status, 204);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), JSON.parse(configured));
});

test("sign-firmware.mjs binds the version and the image hash in one signature", () => {
  const dir = mkdtempSync(join(tmpdir(), "ichido-fw-"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  writeFileSync(join(dir, "key.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
  const image = Buffer.concat([Buffer.from([0xe9]), Buffer.from(" Ichido Help Point firmware 1.2.0 "), Buffer.alloc(64, 7)]);
  writeFileSync(join(dir, "fw.bin"), image);
  const script = fileURLToPath(new URL("../../scripts/sign-firmware.mjs", import.meta.url));
  const run = (version) => execFileSync(process.execPath, [script, join(dir, "key.pem"), join(dir, "fw.bin"), version, "https://fw.example/fw.bin"], { stdio: "pipe" }).toString();

  const m = JSON.parse(run("1.2.0"));
  assert.equal(m.sha256, createHash("sha256").update(image).digest("hex"));
  const signed = (version, sha) => verify("sha256", Buffer.from(`ichido-fw/1\n${version}\n${sha}`), publicKey, Buffer.from(m.signature, "base64"));
  assert.ok(signed("1.2.0", m.sha256));
  assert.ok(!signed("9.9.9", m.sha256));
  assert.ok(!signed("1.2.0", "0".repeat(64)));
  assert.throws(() => run("1.3.0"), /does not contain version/);
});
