#!/usr/bin/env node
// Sign a Help Point firmware image and print the manifest for FIRMWARE_MANIFEST_JSON.
//
//   node scripts/sign-firmware.mjs ota-private.pem build/help_point.ino.bin 1.2.0 https://<host>/help_point-1.2.0.bin
//
// The signature covers "ichido-fw/2\n<version>\n<https-url>\n<sha256 hex of the image>" with RSA PKCS#1 v1.5 / SHA-256,
// which is what the firmware checks against the public key in config.h.
// Keep the private key offline; never commit it.
import { firmwareVersion, validImageUrl } from "../web/lib/firmware-manifest.mjs";
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, sign } from "node:crypto";

const [keyFile, binFile, version, url] = process.argv.slice(2);
if (!keyFile || !binFile || !version || !url) {
  console.error("usage: node scripts/sign-firmware.mjs <private-key.pem> <firmware.bin> <version> <https-url>");
  process.exit(2);
}
if (!firmwareVersion.test(version)) throw new Error("version must have three decimal components in 0..999");
if (!validImageUrl(url)) throw new Error("image URL must be a direct HTTPS URL without credentials or fragment");

const bin = readFileSync(binFile);
if (bin[0] !== 0xe9) throw new Error(`${binFile} is not an ESP32 app image`);
if (!bin.includes(Buffer.from(`ichido-release/2:${version}\0`))) {
  throw new Error("image lacks the release marker for this version; remove compiled credentials before signing");
}

const key = createPrivateKey(readFileSync(keyFile));
if (key.asymmetricKeyType !== "rsa" || ![3072, 4096].includes(key.asymmetricKeyDetails.modulusLength)) throw new Error("key must be RSA-3072 or RSA-4096");
const sha256 = createHash("sha256").update(bin).digest("hex");
const signature_v2 = sign("sha256", Buffer.from(`ichido-fw/2\n${version}\n${url}\n${sha256}`), key).toString("base64");
// The bootstrap release also authenticates to the original 1.3 verifier.
const signature = version === "1.4.0"
  ? sign("sha256", Buffer.from(`ichido-fw/1\n${version}\n${sha256}`), key).toString("base64")
  : undefined;

console.log(JSON.stringify({ version, url, sha256, signature_v2, signature }));
