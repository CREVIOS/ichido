// Health check and device heartbeat, then the operator-side real-world paths (content/ops.ts): fraud mode, mass
// incidents, timers on promises, the harassment flag and takeover. npm run test:fresh.
// The promise timers need a short promise minute on the server under test, e.g. PROMISE_MINUTE_S=1 npm run dev;
// otherwise they are skipped with a note.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { APP, staff, caller, cmd, ok, newKey, closeOpen, openPairedCase } from "./helpers.mjs";
import { FRAUD_FAULT, LANGS, OPS, OPS_CALLER, eventText } from "../content/catalogue.ts";

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

// ---- Operator-side real-world paths (supabase/migrations/20261123130000_ops.sql) ----

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const COMPANY = "出島警備株式会社";   // TABLE-A's security company in seed.sql

async function until(what, fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await wait(250);
  }
}
const lightAt = async (station = "TABLE-A") =>
  (await fetch(`${APP}/api/device`, { headers: { "x-station": station, authorization: "Bearer local-device-secret" } })).text();
const events = async (op, incident) => (await op.c.from("case_event").select("actor, actor_name, kind, data").eq("incident", incident).order("id")).data;
const routed = (op, incident) => until("bot route", async () =>
  ["done", "skipped"].includes((await op.c.from("bot_step").select("status").eq("incident", incident).eq("step", "route").maybeSingle()).data?.status));
const promises = async (op, incident) => (await op.c.from("promise").select("*").eq("incident", incident).order("created_at")).data;

test("fraud mode: the alert source, the operator's one action, the caller's screen, the red light and the police hand-off", async () => {
  const [op, op2, g, g2, m, a] = await Promise.all([
    staff("operator@ichido.demo"), staff("operator2@ichido.demo"), staff("guard1@ichido.demo"), staff("guard2@ichido.demo"),
    staff("manager@ichido.demo"), caller(),
  ]);
  await closeOpen(op);

  // The monitoring side raises "phone call at the ATM"; unknown fault codes are refused.
  const raise = (fault) => fetch(`${APP}/api/device`, {
    method: "POST", headers: { "x-station": "TABLE-A", authorization: "Bearer local-device-secret", "x-fault": fault }, body: newKey(),
  });
  assert.equal((await raise("no_such_fault")).status, 400);
  assert.equal((await raise(FRAUD_FAULT)).status, 204);
  const { data: open } = await op.c.from("desk").select("id, fault").eq("station", "TABLE-A").is("finished_at", null).single();
  assert.equal(open.fault, FRAUD_FAULT);
  const incident = open.id;
  await routed(op, incident);
  await ok(cmd(op, "claim", { incident }));
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  await ok(cmd(a, "pair", { station: "TABLE-A", code, lang: "vi" }));
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "yes", cash_received: "no" }));
  await ok(cmd(a, "confirm", { rev: 1 }));

  // Gemini may suggest fraud mode; neither it nor the bot can switch it on.
  const { suggestion } = await ok(cmd(op, "suggest", { incident }));
  if (suggestion) assert.equal(typeof suggestion.fraud, "boolean");
  assert.equal((await op.c.from("desk").select("fraud_at").eq("id", incident).single()).data.fraud_at, null, "advice only");
  assert.equal((await a.c.from("caller_card").select("fraud").eq("id", incident).single()).data.fraud, false);
  assert.ok((await op.c.rpc("cmd_fraud", { p_uid: op.uid, p_name: "x", p_incident: incident, p_assignee: g.uid })).error, "never from a client");

  // Only the operator who owns the case presses 詐欺の疑い, with a guard.
  for (const who of [g, m, a, op2]) assert.equal((await cmd(who, "fraud", { incident, assignee: g.uid })).status, 403);
  assert.equal((await cmd(op, "fraud", { incident, assignee: "not-a-guard" })).status, 400);
  await ok(cmd(op, "fraud", { incident }));
  assert.equal((await op.c.from("field_job").select("incident").eq("incident",incident)).data.length,0);
  await ok(cmd(op,"assign",{ incident,assignee:g.uid }));
  const police = await ok(cmd(op,"handoff_create",{ incident,recipient:"police" }));
  assert.equal((await cmd(op, "fraud", { incident, assignee: g.uid })).status, 409, "once");

  // The caller's phone shows the approved full-screen warning in their language.
  assert.deepEqual((await a.c.from("caller_card").select("fraud, lang").eq("id", incident).single()).data, { fraud: true, lang: "vi" });
  for (const l of LANGS) assert.ok(OPS_CALLER.fraud.title[l] && OPS_CALLER.fraud.body[l].length > 30, l);
  assert.match(OPS_CALLER.fraud.body.en, /No city office, pension office or bank asks you to use an ATM to get money back\. End the call/);

  // The Help Point light turns red, and stays red through a redispatch; the guard got the job.
  assert.equal(await lightAt(), "fraud");
  assert.equal((await g.c.from("field_job").select("state").eq("incident", incident).single()).data.state, "requested");
  await ok(cmd(op, "assign", { incident, assignee: g2.uid }));
  assert.equal(await lightAt(), "fraud");

  // Timeline: fraud, then the dispatch through the security company's control centre, then the police hand-off.
  const ev = await events(op, incident);
  const fraud = ev.findIndex((e) => e.kind === "fraud");
  const dispatch = ev.findIndex((e) => e.kind === "dispatch");
  assert.ok(fraud >= 0 && dispatch > fraud);
  assert.equal(ev[fraud].actor, "operator");
  assert.equal(ev[dispatch].data.company, COMPANY);
  assert.equal(eventText("dispatch", ev[dispatch].data), `${COMPANY} 管制へ出動を要請（警備員 山口）`);
  assert.ok(ev.some((e) => e.kind === "handoff" && e.data.recipient === "police"));
  for (const e of ev.filter((x) => x.actor === "bot" || x.actor === "agent")) assert.ok(!["fraud", "dispatch", "redispatch", "handoff"].includes(e.kind), e.kind);

  // The police hand-off record carries the fraud time, the control-centre hop and the timeline.
  const page = await (await fetch(`${APP}${police.path}`)).text();
  assert.ok(page.includes("警察 御中"), "addressed to the police");
  assert.ok(page.includes(OPS.fraud.handoff) && page.includes(eventText("fraud", {})), "fraud on the record");
  assert.ok(page.includes(`${COMPANY} 管制`), "control-centre hop");

  assert.ok((await op.c.rpc("insights_ops", { p_days: 7 })).data.fraud >= 1, "counted in insights");
  await ok(cmd(op, "abandon", { incident }));
  assert.equal(await lightAt(), "idle");
});

test("mass incident: faults at many stations group into one incident, and one approved broadcast reaches the paired callers", async (t) => {
  const [op, op2, g, m, a] = await Promise.all([
    staff("operator@ichido.demo"), staff("operator2@ichido.demo"), staff("guard1@ichido.demo"), staff("manager@ichido.demo"), caller(),
  ]);
  await closeOpen(op);
  const { data: rules } = await op.c.schema("ichido").from("ops_setting").select("key, value");
  const need = Object.fromEntries(rules.map((r) => [r.key, r.value])).mass_stations;
  const stations = Array.from({ length: need }, () => `MASS-${randomUUID().slice(0, 8)}`);
  await admin.from("station").insert(stations.map((id) => ({ id, label: { ja: id, en: id }, branch: {}, counter_hours: {}, security_company: COMPANY }))).throwOnError();
  const ids = [];
  t.after(async () => {
    for (const incident of ids) await cmd(op, "abandon", { incident });
    // Let each case's bot write its record before the rows go.
    for (const incident of ids) {
      await until("record", async () => (await admin.from("case_record").select("incident").eq("incident", incident).maybeSingle()).data, 30_000)
        .catch((e) => t.diagnostic(`${incident}: ${e.message}`));
    }
    await admin.from("desk").delete().in("station", stations).throwOnError();
    await admin.from("light").delete().in("station", stations).throwOnError();
    await admin.from("station").delete().in("id", stations).throwOnError();
  });
  for (const station of stations) ids.push((await ok(cmd(op, "simulate", { station, fault: "card_retained" }))).incident);

  const { data: rows } = await op.c.from("desk").select("id, mass_incident").in("id", ids);
  const mass = rows[0].mass_incident;
  assert.ok(mass, "grouped");
  assert.ok(rows.every((r) => r.mass_incident === mass), "one incident");
  for (const incident of ids) assert.ok((await events(op, incident)).some((e) => e.kind === "mass_grouped" && e.actor === "system"));

  // One caller is paired; the others are not.
  for (const incident of ids) await ok(cmd(op, "claim", { incident }));
  const { code } = await ok(cmd(op, "issue_code", { incident: ids[0] }));
  await ok(cmd(a, "pair", { station: stations[0], code, lang: "ne" }));

  // The bot works every case but never broadcasts; clients cannot either.
  for (const incident of ids) await routed(op, incident);
  assert.equal((await op.c.from("mass_incident").select("broadcast_at").eq("id", mass).single()).data.broadcast_at, null);
  for (const who of [g, m, a]) assert.equal((await cmd(who, "broadcast", { mass })).status, 403);
  assert.ok((await op.c.rpc("cmd_broadcast", { p_uid: op.uid, p_name: "x", p_mass: mass })).error);

  // A supervisor (any operator, here one who owns none of these cases) sends it once.
  const { sent } = await ok(cmd(op2, "broadcast", { mass }));
  assert.equal(sent, 1);
  assert.equal((await cmd(op, "broadcast", { mass })).status, 409, "one broadcast per incident");
  assert.equal((await a.c.from("caller_card").select("notice").eq("id", ids[0]).single()).data.notice, "mass_leave");
  assert.ok(OPS_CALLER.notice.mass_leave.ne && !/collect|受け取/.test(OPS_CALLER.notice.mass_leave.en + OPS_CALLER.notice.mass_leave.ja));
  assert.equal((await op.c.from("caller_card").select("notice").eq("id", ids[1]).single()).data.notice, null, "unpaired: nobody to tell");
  const ev = await events(op, ids[0]);
  assert.equal(ev.find((e) => e.kind === "broadcast")?.actor_name, (await ok(cmd(op2, "me"))).name);
  const { data: mi } = await m.c.from("mass_incident").select("recipients").eq("id", mass).single();
  assert.equal(mi.recipients, 1);

  const { data: ins } = await m.c.rpc("insights_ops", { p_days: 7 });
  assert.ok(ins.mass_incidents >= 1 && ins.broadcasts >= 1);
  assert.ok(ins.captured >= need && typeof ins.resolved_same_day === "number" && ins.per_day.length === 7);
});

test("promises: the operator's call-back and the guard's own estimate are timed by the Ichido Bot", async (t) => {
  const [op, op2, g, a] = await Promise.all([staff("operator@ichido.demo"), staff("operator2@ichido.demo"), staff("guard1@ichido.demo"), caller()]);
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "id");
  t.after(() => cmd(op, "abandon", { incident }));

  for (const body of [{ kind: "eta", minutes: 5 }, { kind: "callback", minutes: 7 }]) assert.equal((await cmd(op, "promise", { incident, ...body })).status, 400);
  for (const who of [g, a, op2]) assert.equal((await cmd(who, "promise", { incident, kind: "callback", minutes: 5 })).status, 403);
  const { id } = await ok(cmd(op, "promise", { incident, kind: "callback", minutes: 30 }));
  await ok(cmd(op, "promise_done", { id }));
  assert.equal((await cmd(op, "promise_done", { id })).status, 409);
  assert.equal((await promises(op, incident)).find((p) => p.id === id).outcome, "kept");

  await ok(cmd(op, "promise", { incident, kind: "recheck", minutes: 5 }));
  const recheck = (await promises(op, incident)).at(-1);
  if (Date.parse(recheck.due_at) - Date.now() > 30_000) return t.diagnostic("timers not checked: start the server with PROMISE_MINUTE_S=1");

  // Expiry: the bot's event (the console's toast) and the caller's approved "still working" status.
  const due = await until("recheck due", async () => (await events(op, incident)).find((e) => e.kind === "promise_due" && e.data.kind === "recheck"), 60_000);
  assert.equal(due.actor, "bot");
  assert.equal((await a.c.from("caller_card").select("notice").eq("id", incident).single()).data.notice, "still_working");
  assert.equal((await promises(op, incident)).find((p) => p.id === recheck.id).outcome, "expired");

  // The guard's estimate passing asks the guard to re-estimate; a new estimate clears it.
  await ok(cmd(op, "assign", { incident, assignee: g.uid }));
  const { data: j } = await g.c.from("field_job").select("generation").eq("incident", incident).single();
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "on_way", eta: "10-20" }));
  const eta = (await promises(op, incident)).find((p) => p.kind === "eta" && !p.settled_at);
  assert.equal(eta.made_by, "山口");
  await until("re-estimate ask", async () => (await g.c.from("field_job").select("reestimate_gen").eq("incident", incident).single()).data?.reestimate_gen === j.generation, 40_000);
  assert.ok((await events(op, incident)).some((e) => e.kind === "promise_due" && e.data.kind === "eta" && e.actor === "bot"));
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "on_way", eta: "20-30" }));
  assert.equal((await g.c.from("field_job").select("reestimate_gen").eq("incident", incident).single()).data.reestimate_gen, null);

  // Arrived opens the "done" timer; done settles it.
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "arrived" }));
  let open = (await promises(op, incident)).filter((p) => !p.settled_at);
  assert.deepEqual(open.map((p) => p.kind), ["arrived"]);
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "done" }));
  open = (await promises(op, incident)).filter((p) => !p.settled_at);
  assert.deepEqual(open, []);
  assert.ok((await op.c.rpc("insights_ops", { p_days: 7 })).data.promises_expired >= 2);
});

test("harassment flag and takeover: one person's judgement, and another operator can take the case", async () => {
  const [op, op2, g, m, a] = await Promise.all([
    staff("operator@ichido.demo"), staff("operator2@ichido.demo"), staff("guard1@ichido.demo"), staff("manager@ichido.demo"), caller(),
  ]);
  await closeOpen(op);
  await closeOpen(op2);
  const incident = await openPairedCase(op, a);

  for (const who of [g, m, a, op2]) assert.equal((await cmd(who, "abusive", { incident })).status, 403);
  await ok(cmd(op, "abusive", { incident }));
  assert.equal((await cmd(op, "abusive", { incident })).status, 409);

  for (const who of [g, m, a]) assert.equal((await cmd(who, "takeover", { incident })).status, 403);
  assert.equal((await cmd(op, "takeover", { incident })).status, 409, "already yours");
  await ok(cmd(op2, "takeover", { incident }));
  assert.equal((await op.c.from("desk").select("operator_id").eq("id", incident).single()).data.operator_id, op2.uid);
  const ev = await events(op, incident);
  const abuse = ev.find((e) => e.kind === "abusive");
  assert.equal(abuse.actor, "operator");
  assert.deepEqual(Object.keys(abuse.data), [], "no scoring, just the flag");
  const take = ev.find((e) => e.kind === "takeover");
  assert.equal(take.data.from, (await ok(cmd(op, "me"))).name);
  assert.equal(take.data.abusive, true);
  assert.equal(take.actor_name, (await ok(cmd(op2, "me"))).name);
  assert.equal((await cmd(op, "issue_code", { incident })).status, 403, "the first operator is off the case");
  assert.equal((await cmd(op2, "takeover", { incident })).status, 409);

  const { data: ins } = await op.c.rpc("insights_ops", { p_days: 7 });
  assert.ok(ins.abusive >= 1 && ins.takeovers >= 1);
  await ok(cmd(op2, "abandon", { incident }));
});

test("the Ichido Bot and Gemini have no path to fraud mode or a broadcast", () => {
  // mcp_field_staff: the role-checked, read-only guard roster the case tools read with the staff bearer.
  // blocked_work_replies, available_responders: read-only, operator-gated (replies the current work does not support;
  // field staff on duty for this site and pack).
  const BOT_RPCS = new Set(["bot_mark", "bot_remind", "bot_close", "ops_promise_expire", "mcp_field_staff", "blocked_work_replies", "available_responders"]);
  for (const f of ["workflows/case-bot.ts", "lib/bot-steps.ts", "lib/promise-steps.ts", "lib/decide.ts", "lib/case-tools.ts"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/cmd_fraud|cmd_broadcast|\/api\/cmd|OPS_COMMANDS/.test(src), f);
    for (const [, fn] of src.matchAll(/rpc(?:<[^>]*>)?\("(\w+)"/g)) assert.ok(BOT_RPCS.has(fn), `${f} calls ${fn}`);
  }
});
