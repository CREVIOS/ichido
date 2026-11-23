// Staff alerts (lib/alerts.ts, migration 20261124030000_alerts.sql): push subscriptions per session with RLS, who
// gets which push, what a push may carry, Expo's push API and the Better Stack heartbeat forward. A local stub on
// 127.0.0.1:3199 stands in for the push services, Expo and Better Stack; the server must run with
//   PUSH_ENDPOINT_ORIGINS=http://127.0.0.1:3199  EXPO_PUSH_URL=http://127.0.0.1:3199/expo/push
//   BETTERSTACK_HEARTBEATS_JSON={"TABLE-A":"http://127.0.0.1:3199/bs/TABLE-A"}  BETTERSTACK_UPTIME_ORIGIN=http://127.0.0.1:3199
//   CRON_SECRET=…  and VAPID keys (node scripts/vapid-keys.mjs). Without them the file is skipped.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import * as ece from "http_ece";
import { APP, caller, closeOpen, cmd, mint, ok, openPairedCase, signIn, staff } from "./helpers.mjs";

const STUB = "http://127.0.0.1:3199";
const configured = process.env.PUSH_ENDPOINT_ORIGINS?.includes(STUB) && process.env.VAPID_PUBLIC_KEY && process.env.CRON_SECRET;
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const until = async (what, f, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) {
    const v = await f();
    if (v) return v;
  }
  assert.fail(`timed out waiting for ${what}`);
};

// The stub records every request; Expo answers with a ticket per message (DeviceNotRegistered for "gone" tokens).
const seen = [];
let server;
before(async () => {
  if (!configured) return;
  server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      seen.push({ path: req.url, headers: req.headers, body });
      if (req.url === "/expo/push") {
        const msgs = JSON.parse(body.toString());
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: msgs.map((m) => (m.to.includes("gone") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: randomBytes(4).toString("hex") })) }));
      }
      res.writeHead(201).end();
    });
  });
  await new Promise((r) => server.listen(3199, "127.0.0.1", r));
});
// The cached test sessions live on; their stub subscriptions should not.
after(async () => {
  server?.close();
  if (!configured) return;
  await service.from("push_subscription").delete().like("endpoint", `${STUB}/%`);
  await service.from("push_subscription").delete().like("endpoint", "ExponentPushToken[%");
});

// A browser's subscription: an endpoint on the stub and the keys the server encrypts to; open() decrypts like a browser.
function browser() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const id = randomBytes(8).toString("hex");
  const sub = { platform: "web", endpoint: `${STUB}/push/${id}`, p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
  const received = () => seen.filter((r) => r.path === `/push/${id}`).map((r) => JSON.parse(ece.decrypt(r.body, { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString()));
  return { sub, received };
}
const flush = () => fetch(`${APP}/api/alerts/flush`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });

test("subscriptions: own rows only under RLS, refused without a session that receives alerts", { skip: !configured && "alert stubs not configured" }, async () => {
  const [op, op2, admin, a] = await Promise.all([staff("operator@ichido.demo"), staff("operator2@ichido.demo"), staff("admin@ichido.demo"), caller()]);
  const mine = browser();
  const theirs = browser();
  await ok(cmd(op, "push_subscribe", mine.sub));
  await ok(cmd(op2, "push_subscribe", theirs.sub));
  assert.equal(typeof (await ok(cmd(op, "push_key"))).key, "string");

  const { data: rows } = await op.c.from("push_subscription").select("uid, endpoint");
  assert.ok(rows.length >= 1 && rows.every((r) => r.uid === op.uid), "an operator reads only their own subscriptions");
  await op.c.from("push_subscription").delete().eq("endpoint", theirs.sub.endpoint);
  const { count } = await service.from("push_subscription").select("id", { count: "exact", head: true }).eq("endpoint", theirs.sub.endpoint);
  assert.equal(count, 1, "nor deletes anyone else's");
  const { data: anon } = await a.c.from("push_subscription").select("id");
  assert.deepEqual(anon ?? [], [], "a caller reads none");

  assert.equal((await cmd(a, "push_subscribe", browser().sub)).status, 403);
  assert.equal((await cmd(admin, "push_subscribe", browser().sub)).status, 403, "admins receive no case alerts");
  assert.equal((await cmd(op, "push_subscribe", { ...browser().sub, endpoint: "https://attacker.example/push/1" })).status, 400, "only push services");
  assert.equal((await cmd(op, "push_subscribe", { platform: "expo", endpoint: "not-a-token" })).status, 400);
});

test("signing out or revoking the session deletes its subscription", { skip: !configured && "alert stubs not configured" }, async () => {
  const j = await signIn("operator2@ichido.demo");
  const token = await mint(j);
  const who = { token };
  const b = browser();
  await ok(cmd(who, "push_subscribe", b.sub));
  await ok(cmd(who, "push_subscribe", { platform: "expo", endpoint: `ExponentPushToken[revoke-${randomBytes(4).toString("hex")}]` }));
  const session = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).session_id;
  const { count: before } = await service.from("push_subscription").select("id", { count: "exact", head: true }).eq("session_id", session);
  assert.equal(before, 2);
  assert.equal((await j.post("/api/auth/sign-out")).status, 200);
  const { count: afterOut } = await service.from("push_subscription").select("id", { count: "exact", head: true }).eq("session_id", session);
  assert.equal(afterOut, 0);
});

test("a new case goes to operators on duty only, a field job only to its guard, with no caller text", { skip: !configured && "alert stubs not configured" }, async () => {
  const [op, g1, g2, mgr, a] = await Promise.all([
    staff("operator@ichido.demo"), staff("guard1@ichido.demo"), staff("guard2@ichido.demo"), staff("manager@ichido.demo"), caller(),
  ]);
  const ob = browser(), g1b = browser(), g2b = browser(), mb = browser();
  const g1Expo = `ExponentPushToken[guard1-${randomBytes(4).toString("hex")}]`;
  const gone = `ExponentPushToken[gone-${randomBytes(4).toString("hex")}]`;
  await ok(cmd(op, "push_subscribe", ob.sub));
  await ok(cmd(g1, "push_subscribe", g1b.sub));
  await ok(cmd(g1, "push_subscribe", { platform: "expo", endpoint: g1Expo }));
  await ok(cmd(g2, "push_subscribe", g2b.sub));
  await ok(cmd(g2, "push_subscribe", { platform: "expo", endpoint: gone }));
  await ok(cmd(mgr, "push_subscribe", mb.sub));

  await closeOpen(op);
  const incident = await openPairedCase(op, a, "en");
  const { data: d } = await a.c.from("draft").select("rev").eq("incident", incident).single();
  await ok(cmd(a, "draft", { base_rev: d.rev, text: "my card stayed in the machine, my name is Taro Example", card_back: "no" }));

  const newCase = await until("new case push", () => ob.received().find((m) => m.tag === `new_case:${incident}`));
  assert.equal(newCase.url, `/operator#${incident}`);
  assert.deepEqual(Object.keys(newCase).sort(), ["body", "path", "tag", "title", "url"]);

  await ok(cmd(op, "assign", { incident, assignee: g1.uid }));
  const job = await until("field job push", () => g1b.received().find((m) => m.tag === `field_job:${incident}`));
  assert.equal(job.url, `/field?job=${incident}`);
  const expo = await until("expo push", () => seen.filter((r) => r.path === "/expo/push").map((r) => JSON.parse(r.body.toString())).flat().find((m) => m.to === g1Expo));
  assert.deepEqual(expo.data, { path: `/field?job=${incident}` });
  assert.equal(seen.find((r) => r.path === "/expo/push").headers["content-type"], "application/json");

  await flush();
  for (const [who, b] of [["guard1", g1b], ["guard2", g2b], ["manager", mb]]) {
    assert.ok(!b.received().some((m) => m.tag === `new_case:${incident}`), `${who} gets no new-case push`);
  }
  assert.ok(!g2b.received().some((m) => m.tag === `field_job:${incident}`), "the other guard gets no job push");
  assert.ok(!ob.received().some((m) => m.tag === `field_job:${incident}`), "nor does the operator");
  const { count } = await service.from("push_subscription").select("id", { count: "exact", head: true }).eq("endpoint", gone);
  assert.equal(count, 1, "the other guard's token was never sent to");

  // Nothing a caller typed, and nothing that looks like a number from them, is in any payload.
  const all = [ob, g1b, g2b, mb].flatMap((b) => b.received()).map((m) => JSON.stringify(m));
  for (const p of all) for (const w of ["card", "Taro", "machine"]) assert.ok(!p.includes(w), p);
  await closeOpen(op);
});

test("an SLA breach from the escalation cron reaches the owner and managers; a dead Expo token is removed", { skip: !configured && "alert stubs not configured" }, async () => {
  const [op, mgr, g2, a] = await Promise.all([staff("operator@ichido.demo"), staff("manager@ichido.demo"), staff("guard2@ichido.demo"), caller()]);
  const ob = browser(), mb = browser();
  const gone = `ExponentPushToken[gone-${randomBytes(4).toString("hex")}]`;
  await ok(cmd(op, "push_subscribe", ob.sub));
  await ok(cmd(mgr, "push_subscribe", mb.sub));
  await ok(cmd(g2, "push_subscribe", { platform: "expo", endpoint: gone }));
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "bn");
  // What ichido.escalate_due() writes when a target passes (the cron runs once a minute).
  const { error } = await service.from("case_event").insert({ incident, actor: "system", kind: "escalated", data: { level: 1, reason: "no_reply" } });
  assert.ifError(error);
  assert.equal((await fetch(`${APP}/api/alerts/flush`)).status, 404, "the flush needs the cron secret");
  assert.equal((await flush()).status, 204);
  const sla = await until("owner sla push", () => ob.received().find((m) => m.tag === `sla:${incident}`));
  assert.equal(sla.url, `/operator#${incident}`);
  const m = await until("manager sla push", () => mb.received().find((x) => x.tag === `sla:${incident}`));
  assert.equal(m.url, "/insights");

  // A field job for guard2 sends to the dead token; Expo says DeviceNotRegistered and the row goes.
  await ok(cmd(op, "assign", { incident, assignee: g2.uid }));
  await until("dead token removed", async () => (await service.from("push_subscription").select("id", { count: "exact", head: true }).eq("endpoint", gone)).count === 0);
  await closeOpen(op);
});

test("heartbeats are forwarded to Better Stack at most once a minute per station", { skip: !configured && "alert stubs not configured" }, async () => {
  const good = { uptime_s: 10, free_heap: 100000, rssi: -60, fw: "1.4.0", ack_ms: -1, poll_ms: -1 };
  const beat = () => fetch(`${APP}/api/device/heartbeat`, {
    method: "POST", headers: { "x-station": "TABLE-A", authorization: "Bearer local-device-secret", "content-type": "application/json" }, body: JSON.stringify(good),
  });
  await service.schema("ichido").from("rate_bucket").delete().eq("scope", "betterstack_heartbeat");
  const before = seen.filter((r) => r.path === "/bs/TABLE-A").length;
  for (let i = 0; i < 4; i++) assert.equal((await beat()).status, 204);
  await until("forwarded ping", () => seen.filter((r) => r.path === "/bs/TABLE-A").length > before);
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(seen.filter((r) => r.path === "/bs/TABLE-A").length - before, 1, "four heartbeats, one ping");
  assert.equal(seen.findLast((r) => r.path === "/bs/TABLE-A").headers["content-length"] ?? "0", "0", "the ping carries no telemetry");
});
