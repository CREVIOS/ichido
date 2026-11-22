// Signed firmware manifest (/api/device/firmware) and scripts/sign-firmware.mjs.
// The route test follows the server's FIRMWARE_MANIFEST_JSON: 204 when unset, the manifest when set
// (run with the same value in .env.local for the server and the test).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("sign-firmware.mjs binds the release version, exact HTTPS URL and image hash", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ichido-fw-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  writeFileSync(join(dir, "key.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const url = "https://fw.example/fw.bin";
  const image = Buffer.concat([Buffer.from([0xe9]), Buffer.from("ichido-release/2:1.2.0\0"), Buffer.alloc(64, 7)]);
  const binFile = join(dir, "fw.bin");
  writeFileSync(binFile, image);
  const script = fileURLToPath(new URL("../../scripts/sign-firmware.mjs", import.meta.url));
  const run = (version, target = url) => execFileSync(process.execPath, [script, join(dir, "key.pem"), binFile, version, target], { stdio: "pipe" }).toString();

  const m = JSON.parse(run("1.2.0"));
  assert.equal(m.sha256, createHash("sha256").update(image).digest("hex"));
  const signed = (version, target, sha) => verify("sha256", Buffer.from(`ichido-fw/2\n${version}\n${target}\n${sha}`), publicKey, Buffer.from(m.signature_v2, "base64"));
  assert.ok(signed("1.2.0", url, m.sha256));
  assert.ok(!signed("9.9.9", url, m.sha256));
  assert.ok(!signed("1.2.0", url + "?different", m.sha256));
  assert.ok(!signed("1.2.0", url, "0".repeat(64)));
  assert.throws(() => run("1.3.0"), /lacks the release marker/);
  for (const target of ["http://fw.example/fw.bin", "https://u@fw.example/fw.bin", url + "#section", "https:///fw.bin"]) {
    assert.throws(() => run("1.2.0", target), /direct HTTPS URL/);
  }
  for (const version of ["1.2.000", "1.2.1000", "1.2", "1.2.0extra"]) {
    assert.throws(() => run(version), /decimal components/);
  }
  assert.equal(m.signature, undefined);
  writeFileSync(binFile, Buffer.concat([Buffer.from([0xe9]), Buffer.from("ichido-release/2:1.4.0\0")]));
  const bootstrap = JSON.parse(run("1.4.0"));
  assert.ok(verify("sha256", Buffer.from(`ichido-fw/1\n1.4.0\n${bootstrap.sha256}`), publicKey, Buffer.from(bootstrap.signature, "base64")));
  assert.ok(verify("sha256", Buffer.from(`ichido-fw/2\n1.4.0\n${url}\n${bootstrap.sha256}`), publicKey, Buffer.from(bootstrap.signature_v2, "base64")));
  writeFileSync(binFile, Buffer.from([0xe9, 0x00]));
  assert.throws(() => run("1.2.0"), /lacks the release marker/);
});
