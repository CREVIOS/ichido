#!/usr/bin/env node
// Sign a Help Point firmware image and print the manifest for FIRMWARE_MANIFEST_JSON.
//
//   node scripts/sign-firmware.mjs ota-private.pem build/help_point.ino.bin 1.2.0 https://<host>/help_point-1.2.0.bin
//
// The signature covers "ichido-fw/1\n<version>\n<sha256 hex of the image>" with RSA PKCS#1 v1.5 / SHA-256,
// which is what the firmware checks against the public key in config.h.
// Keep the private key offline; never commit it.
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, sign } from "node:crypto";

const [keyFile, binFile, version, url] = process.argv.slice(2);
if (!keyFile || !binFile || !version || !url) {
  console.error("usage: node scripts/sign-firmware.mjs <private-key.pem> <firmware.bin> <version> <https-url>");
  process.exit(2);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("version must look like 1.2.0");
if (!/^https?:\/\/[^\s"\\]+$/.test(url)) throw new Error("url must be an http(s) URL without spaces, quotes or backslashes");

const bin = readFileSync(binFile);
if (bin[0] !== 0xe9) throw new Error(`${binFile} is not an ESP32 app image`);
// Guards against signing an image under the wrong version: FW_VERSION is compiled into the image.
if (!bin.includes(Buffer.from(version))) throw new Error(`${binFile} does not contain version ${version}; check FW_VERSION`);

const key = createPrivateKey(readFileSync(keyFile));
if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 3072) throw new Error("key must be RSA, 3072 bits or more");
const sha256 = createHash("sha256").update(bin).digest("hex");
const signature = sign("sha256", Buffer.from(`ichido-fw/1\n${version}\n${sha256}`), key).toString("base64");

console.log(JSON.stringify({ version, url, sha256, signature }));
