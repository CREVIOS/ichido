// Health check and device heartbeat: npm run test:fresh.
import test from "node:test";
import assert from "node:assert/strict";
import { APP, staff, caller } from "./helpers.mjs";

const heartbeat = (body, { station = "TABLE-A", secret = "local-device-secret" } = {}) =>
  fetch(`${APP}/api/device/heartbeat`, {
    method: "POST",
    headers: { "x-station": station, authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const good = { uptime_s: 3600, free_heap: 201000, rssi: -61, fw: "1.1.0", ack_ms: 420, poll_ms: -1 };

test("health reports the database and version", async () => {
  const res = await fetch(`${APP}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.db, "ok");
  assert.equal(typeof body.version, "string");
});

test("heartbeat needs the station's own secret and well-formed telemetry", async () => {
  assert.equal((await heartbeat(good, { secret: "wrong" })).status, 401);
  assert.equal((await heartbeat(good, { secret: "" })).status, 401);
  assert.equal((await heartbeat(good, { station: "NO-SUCH-STATION" })).status, 401);
  assert.equal((await heartbeat(good, { station: "constructor" })).status, 401);
  assert.equal((await heartbeat("not json")).status, 400);
  assert.equal((await heartbeat({ ...good, rssi: 20 })).status, 400);
  assert.equal((await heartbeat({ ...good, fw: "1.0 <script>" })).status, 400);
  assert.equal((await heartbeat({ ...good, uptime_s: undefined })).status, 400);
  assert.equal((await heartbeat(good)).status, 204);
});

test("device health is visible to operators and managers only", async () => {
  assert.equal((await heartbeat({ ...good, rssi: -70 })).status, 204);
  const op = await staff("operator@ichido.demo");
  const { data } = await op.c.from("device_health").select("station, rssi, firmware, ack_ms, poll_ms, last_seen").eq("station", "TABLE-A").single();
  assert.deepEqual({ ...data, last_seen: undefined }, { station: "TABLE-A", rssi: -70, firmware: "1.1.0", ack_ms: 420, poll_ms: null, last_seen: undefined });
  assert.ok(Date.now() - Date.parse(data.last_seen) < 60_000);
  const mgr = await staff("manager@ichido.demo");
  assert.equal((await mgr.c.from("device_health").select("station")).data.length, 1);
  const g = await staff("guard1@ichido.demo");
  assert.deepEqual((await g.c.from("device_health").select("station")).data, []);
  const c = await caller();
  assert.deepEqual((await c.c.from("device_health").select("station")).data, []);
});
