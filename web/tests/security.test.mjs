import assert from "node:assert/strict";
import test from "node:test";
import { APP } from "./helpers.mjs";
import { authOrigin } from "../../scripts/auth-origin.mjs";
import { errorFields } from "../lib/error-fields.ts";
import { migrateSessionStorage } from "../../mobile/lib/session-storage.ts";

test("telemetry excludes exception messages, untrusted names and arbitrary error codes", () => {
  const error = new Error("private test marker");
  Object.assign(error, { name: "private-name", code: "private-code", digest: "private-digest" });
  assert.equal(JSON.stringify(errorFields(error)), '{"error":"Error"}');
  assert.deepEqual(errorFields({ code: "23505", message: "private row" }), { error: "Error", error_code: "23505" });
});

test("API body limits also apply without a Content-Length header", async () => {
  for (const [path, bytes] of [["/api/cmd", 32769], ["/api/mcp", 16385], ["/api/livekit/token", 1]]) {
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); },
    });
    const response = await fetch(APP + path, { method: "POST", body, duplex: "half" });
    assert.equal(response.status, 413, path);
  }
  for (const body of ["null", "[]", "{"]) {
    const res = await fetch(APP + "/api/cmd", { method: "POST", body });
    assert.equal(res.status, 400);
  }
});

test("client role and case fields do not authorize a command", async () => {
  const body = JSON.stringify({ cmd: "claim", role: "operator", incident: "00000000-0000-4000-8000-000000000000" });
  const res = await fetch(APP + "/api/cmd", { method: "POST", body });
  assert.equal(res.status, 403);
  const crossOrigin = await fetch(APP + "/api/mcp", { method: "POST", headers: { origin: "https://example.invalid" } });
  assert.equal(crossOrigin.status, 403);
});

test("credential-bearing CLI requests require a secure service origin", () => {
  assert.equal(authOrigin("http://127.0.0.1:54321/"), "http://127.0.0.1:54321");
  assert.equal(authOrigin("https://project.example"), "https://project.example");
  for (const value of ["http://project.example", "https://owner@project.example", "https://project.example/path"]) {
    assert.throws(() => authOrigin(value));
  }
});

test("each HTML document receives its own script nonce and microphone policy", async () => {
  const nonces = [];
  for (const path of ["/", "/caller"]) {
    const response = await fetch(APP + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.ok(response.headers.get("permissions-policy").includes(path === "/caller" ? "microphone=(self)" : "microphone=()"));
    const policy = response.headers.get("content-security-policy");
    const scripts = policy.split(";").find((value) => value.trim().startsWith("script-src "));
    const nonce = scripts.match(/'nonce-([^']+)'/)[1];
    assert.ok(Buffer.from(nonce, "base64").length >= 16);
    assert.ok(!scripts.includes("unsafe-inline"));
    if (process.env.NODE_ENV === "production") {
      assert.ok(!scripts.includes("unsafe-eval"));
      assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
    }
    assert.ok(policy.includes("frame-ancestors 'none'"));
    const html = await response.text();
    const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1]);
    assert.ok(tags.length > 1 && html.includes("ichido.splash"));
    for (const tag of tags) {
      if (/type="(?:application\/json|application\/ld\+json)"/.test(tag)) continue;
      assert.ok(tag.includes(`nonce="${nonce}"`), "rendered scripts must carry the document nonce");
    }
    nonces.push(nonce);
  }
  assert.notEqual(...nonces);
});

test("the local workflow queue requires SDK authentication and the app has no public webhook", async () => {
  const base = APP + "/.well-known/workflow/v1";
  const queue = await fetch(base + "/flow", { method: "POST" });
  assert.equal(queue.status, 401);
  assert.equal(queue.headers.get("x-workflow-auth-refused"), "1");
  const webhook = await fetch(base + "/webhook/unused", { method: "POST" });
  assert.equal(webhook.status, 404);
});

test("native session migration prefers current credentials and retries a failed secure write", async () => {
  function storage() {
    const items = new Map();
    return {
      getItem: async (key) => items.get(key) ?? null,
      setItem: async (key, value) => { items.set(key, value); },
      removeItem: async (key) => { items.delete(key); },
    };
  }
  const secure = storage();
  const previous = storage();
  const adapter = migrateSessionStorage(secure, previous);
  await previous.setItem("session", "old");
  const unavailable = migrateSessionStorage({ ...secure, setItem: async () => { throw new Error("locked"); } }, previous);
  await assert.rejects(unavailable.getItem("session"), /locked/);
  assert.equal(await adapter.getItem("session"), "old");
  assert.notEqual(await previous.getItem("session"), "old");
  await adapter.setItem("session", "new");
  await previous.setItem("session", "stale");
  assert.equal(await adapter.getItem("session"), "new");
  assert.notEqual(await previous.getItem("session"), "stale");
  // A reinstall can clear AsyncStorage while leaving the iOS Keychain intact.
  await previous.removeItem("session");
  assert.equal(await adapter.getItem("session"), null);
  assert.equal(await secure.getItem("session"), null);
  await adapter.setItem("session", "active");
  await adapter.removeItem("session");
  assert.equal(await secure.getItem("session"), null);
  assert.equal(await previous.getItem("session"), null);
});
