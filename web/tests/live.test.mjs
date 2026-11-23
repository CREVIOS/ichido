// Live updates by Realtime Broadcast from the database (supabase/migrations/20261124010000_live_broadcast.sql):
// who may join which private topic, that a command's writes arrive, and that the toast feed carries only its fields.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { frontlineCase } from "./frontline-fixture.mjs";
import { createClient } from "@supabase/supabase-js";
import { caller, closeOpen, cmd, mint, ok, openPairedCase, signIn, staff } from "./helpers.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname));
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Join a private topic with `who`'s token; resolves with the first status. A refused join is left at once (Realtime
// would retry it). Local Realtime answers a denied private join after about 5 s, one join at a time per connection,
// so each join has its own client.
async function join(t, who, topic) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { accessToken: async () => who.token });
  await c.realtime.setAuth();
  const ch = c.channel(topic, { config: { private: true } });
  const got = [];
  ch.on("broadcast", { event: "*" }, (m) => got.push(m));
  const [status, reason] = await new Promise((resolve) => ch.subscribe((s, e) => resolve([s, e?.message]), 15_000));
  if (status !== "SUBSCRIBED") await c.removeAllChannels();
  else t.after(() => c.removeAllChannels());
  return { status, reason, got };
}

async function next(sub, pred = () => true, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) {
    const m = sub.got.find(pred);
    if (m) return m;
  }
  throw new Error("no broadcast");
}

test("staff hear table topics, a caller only their own case and station, a stranger nothing", async (t) => {
  const op = await staff("operator@ichido.demo");
  const guard = await staff("guard1@ichido.demo");
  const phone = await caller();
  const stranger = await caller();
  await closeOpen(op);

  const desk = await join(t, op, "live:desk");
  assert.equal(desk.status, "SUBSCRIBED", desk.reason);
  const incident = await openPairedCase(op, phone);
  t.after(() => cmd(op, "abandon", { incident }));
  const m = await next(desk, (x) => x.event === "change");
  assert.deepEqual(Object.keys(m.payload).sort(), ["id", "table"], "no row data, only which table changed");
  assert.equal(m.payload.table, "desk");

  const mine = await join(t, phone, `live:incident:${incident}`);
  assert.equal(mine.status, "SUBSCRIBED");
  assert.equal((await join(t, phone, "live:station:TABLE-A")).status, "SUBSCRIBED");
  const refused = await Promise.all([
    join(t, phone, "live:desk"),
    join(t, phone, `live:incident:${randomUUID()}`),
    join(t, phone, "live:incident:not-a-uuid"),
    join(t, phone, "live:feed"),
    join(t, stranger, `live:incident:${incident}`),
    join(t, stranger, "live:station:TABLE-A"),
    join(t, stranger, "live:desk"),
    join(t, guard, "live:feed"),
  ]);
  assert.deepEqual(refused.map((r) => r.status), Array(refused.length).fill("CHANNEL_ERROR"));

  // The operator's reply reaches the caller's case topic.
  await ok(cmd(phone, "draft", { base_rev: 0, card_back: "no", cash_received: "yes" }));
  await ok(cmd(phone, "confirm", { rev: 1 }));
  await ok(cmd(op, "remote_release", { incident, result: "failed" }));
  mine.got.length = 0;
  await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));
  const tables = new Set();
  await next(mine, (x) => tables.add(x.payload.table) && tables.has("reply"));
  assert.ok(tables.has("reply"));
});

test("a signed-out staff session's token cannot join", async (t) => {
  const j = await signIn("operator2@ichido.demo");
  const token = await mint(j);
  assert.ok(token);
  assert.equal((await j.post("/api/auth/sign-out")).status, 200);
  assert.equal((await join(t, { token }, "live:desk")).status, "CHANNEL_ERROR");
});

test("the operator toast feed carries the case event id, the incident and the reason or kind only", async (t) => {
  const op = await staff("operator@ichido.demo");
  const feed = await join(t, op, "live:feed");
  assert.equal(feed.status, "SUBSCRIBED");
  const { data: desk } = await admin.from("desk").insert({
    station: "TABLE-A", fault: "card_retained", source: "simulator", finished_at: new Date().toISOString(),
  }).select("id").single().throwOnError();
  t.after(() => admin.from("desk").delete().eq("id", desk.id));
  const { data: rows } = await admin.from("case_event").insert([
    { incident: desk.id, actor: "bot", kind: "bot_remind", data: { reason: "no_reply", target_s: 60 } },
    { incident: desk.id, actor: "bot", kind: "promise_due", data: { kind: "eta", by: "伊藤" } },
    { incident: desk.id, actor: "bot", kind: "bot_routed", data: { note: "not on the feed" } },
  ]).select("id, kind").throwOnError();
  const id = (kind) => rows.find((r) => r.kind === kind).id;
  const remind = await next(feed, (x) => x.event === "bot_remind" && x.payload.incident === desk.id);
  assert.deepEqual(remind.payload, { id: id("bot_remind"), incident: desk.id, reason: "no_reply" });
  const due = await next(feed, (x) => x.event === "promise_due" && x.payload.incident === desk.id);
  assert.deepEqual(due.payload, { id: id("promise_due"), incident: desk.id, kind: "eta" });
  await sleep(500);
  assert.equal(feed.got.filter((x) => x.payload.incident === desk.id).length, 2, "other case events stay off the feed");
});

test("frontline sends only invalidations to the operator and bound caller", async (t) => {
  const f = await frontlineCase(t);
  const monitoring = await join(t, f.op, "live:frontline_turn");
  const mine = await join(t, f.phone, "live:incident:" + f.incident);
  assert.equal(monitoring.status, "SUBSCRIBED");
  assert.equal(mine.status, "SUBSCRIBED");
  assert.equal((await join(t, await staff("guard1@ichido.demo"), "live:frontline_turn")).status, "CHANNEL_ERROR");
  await f.turn("start");
  for (const sub of [monitoring, mine]) {
    const message = await next(sub, (x) => x.payload.table === "frontline_turn");
    assert.deepEqual(message.payload, { table: "frontline_turn" });
  }
});
