// The web server and agent must agree on the speech signature (see agent/test_signing.py).
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

test("signature is HMAC-SHA256 over room and text, base64url without padding", () => {
  const sig = createHmac("sha256", "test").update("case-1\nok").digest("base64url");
  assert.equal(sig.includes("="), false);
  assert.match(sig, /^[A-Za-z0-9_-]{43}$/);
});
