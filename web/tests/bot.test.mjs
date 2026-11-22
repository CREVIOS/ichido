// Ichido Bot (web/workflows/case-bot.ts): routes, prepares, reminds and records, and never acts for a person.
// Reminder tests need the server started with a short schedule, e.g. BOT_REMIND_AT=0.02 npm run dev; otherwise they skip.
import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { staff, caller, cmd, ok, device, newKey, closeOpen } from "./helpers.mjs";
import { eventText } from "../content/catalogue.ts";

const BOT_KINDS = new Set(["bot_routed", "bot_prepared", "bot_remind", "bot_closed"]);
const SOON_MS = 30_000;

async function until(what, fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await wait(250);
  }
}

const step = async (op, incident, name) =>
  (await op.c.from("bot_step").select("*").eq("incident", incident).eq("step", name).maybeSingle()).data;
const stepIs = (op, incident, name, status) => until(`${name} ${status}`, async () => {
  const s = await step(op, incident, name);
  return s?.status === status ? s : null;
});
const botEvent = (op, incident, kind, match = () => true) => until(kind, async () => {
  const { data } = await op.c.from("case_event").select("*").eq("incident", incident).eq("kind", kind);
  return (data ?? []).find(match);
});
// A reminder step once the workflow has scheduled it (a due time) or already settled it.
const scheduled = (op, incident, name) => until(`${name} scheduled`, async () => {
  const s = await step(op, incident, name);
  return s && (s.due_at || s.status !== "waiting") ? s : null;
});
const soon = (s) => s.status === "done" || (s.due_at && Date.parse(s.due_at) - Date.now() < SOON_MS);

// Join the console's presence channel as this operator, so the bot sees them online.
async function online(op, name) {
  const ch = op.c.channel("ichido:operator-presence", { config: { private: true, presence: { key: op.uid, enabled: true } } });
  await new Promise((resolve, reject) => ch.subscribe((s, e) => s === "SUBSCRIBED" ? resolve() : reject(e ?? new Error(s))));
  assert.equal(await ch.track({ uid: op.uid, name, viewing: null }), "ok");
  return () => op.c.removeChannel(ch);
}

test("the bot follows a case end to end and only advises", async (t) => {
  const op = await staff("operator@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const me = (await ok(cmd(op, "me"))).name;
  const leave = await online(op, me);
  t.after(leave);

  // Route: a suggestion on the timeline, never a claim.
  assert.equal((await device(newKey())).status, 204);
  const { data: open } = await op.c.from("desk").select("id").is("finished_at", null);
  const incident = open[0].id;
  const routed = await stepIs(op, incident, "route", "done");
  assert.equal(routed.data.operator, me);
  assert.equal(routed.data.uid, op.uid);
  assert.equal(routed.data.online, true);
  const ev = await botEvent(op, incident, "bot_routed");
  assert.equal(ev.actor, "bot");
  assert.equal(eventText(ev.kind, ev.data), `推奨担当：${me}`);
  assert.equal((await op.c.from("desk").select("operator_id").eq("id", incident).single()).data.operator_id, null, "the bot never claims");

  // Prepare: after the caller confirms, a stored suggestion (with a key) or a recorded skip (without).
  await ok(cmd(op, "claim", { incident }));
  await stepIs(op, incident, "claim", "done");
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  await ok(cmd(a, "pair", { station: "TABLE-A", code, lang: "ja" }));
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "no", cash_received: "no" }));
  await ok(cmd(a, "confirm", { rev: 1 }));
  if (process.env.GEMINI_API_KEY) {
    const s = await until("bot_suggestion", async () => (await op.c.from("bot_suggestion").select("rev, suggestion").eq("incident", incident).maybeSingle()).data, 60_000);
    assert.equal(s.rev, 1);
  } else {
    assert.equal((await stepIs(op, incident, "prepare", "skipped")).code, "no_key");
  }

  // Remind before the first-reply target, then send (the person decides).
  const reply = await scheduled(op, incident, "remind_reply");
  if (soon(reply)) {
    const r = await botEvent(op, incident, "bot_remind", (e) => e.data.reason === "no_reply");
    assert.equal(r.actor, "bot");
    assert.equal((await step(op, incident, "remind_reply")).status, "done");
  } else t.diagnostic("reply reminder not checked: start the server with BOT_REMIND_AT=0.02");
  const { id: replyId } = await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));

  // Dispatch by the operator; the bot reminds guard and operator while the job is still "requested".
  await ok(cmd(op, "assign", { incident, assignee: g.uid }));
  const guardStep = await scheduled(op, incident, "remind_guard");
  if (soon(guardStep)) {
    await botEvent(op, incident, "bot_remind", (e) => e.data.reason === "guard_late");
    const job = await until("reminded job", async () => (await g.c.from("field_job").select("generation, reminded_gen").eq("incident", incident).single()).data?.reminded_gen);
    assert.equal(job, 1, "the guard's screen sees the reminder");
  } else t.diagnostic("guard reminder not checked: start the server with BOT_REMIND_AT=0.02");
  const { data: j } = await g.c.from("field_job").select("generation").eq("incident", incident).single();
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "on_way", eta: "30-45" }));
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "arrived" }));

  // Close by the operator; the bot writes the record with durations.
  await ok(cmd(a, "teachback", { text: "ぎんこうの でんわを まちます" }));
  await ok(cmd(op, "outcome", { incident, reply: replyId, result: "understood" }));
  const rec = await until("case_record", async () => (await op.c.from("case_record").select("*").eq("incident", incident).maybeSingle()).data);
  assert.ok(rec.summary?.length > 0);
  for (const k of ["claim_s", "first_reply_s", "guard_arrival_s", "total_s"]) assert.equal(typeof rec[k], "number", k);
  const closed = await botEvent(op, incident, "bot_closed");
  assert.deepEqual(Object.keys(closed.data).sort(), ["claim_s", "first_reply_s", "guard_arrival_s", "total_s"]);
  assert.ok(Object.values(closed.data).every((v) => typeof v === "number"), "counts only");
  await stepIs(op, incident, "record", "done");
  const { data: steps } = await op.c.from("bot_step").select("step, status").eq("incident", incident);
  assert.equal(steps.length, 6);
  assert.ok(steps.every((s) => s.status !== "waiting"), JSON.stringify(steps));

  // The bot never claimed, replied, dispatched or closed: every such row and event is a person's.
  const { data: desk } = await op.c.from("desk").select("operator_id").eq("id", incident).single();
  assert.equal(desk.operator_id, op.uid);
  const { data: replies } = await op.c.from("reply").select("operator_id").eq("incident", incident);
  assert.deepEqual(replies.map((r) => r.operator_id), [op.uid]);
  const { data: events } = await op.c.from("case_event").select("actor, kind").eq("incident", incident);
  for (const e of events.filter((x) => x.actor === "bot")) assert.ok(BOT_KINDS.has(e.kind), e.kind);
  for (const k of ["claimed", "reply", "dispatch", "guided"]) assert.notEqual(events.find((e) => e.kind === k)?.actor, "bot", k);
  const { data: ins } = await op.c.rpc("insights_bot", { p_days: 7 });
  assert.ok(ins.records >= 1);
  await ok(cmd(g, "field", { incident, generation: j.generation, state: "done" }));
});

test("bot rows are operator-only, and an abandoned case is recorded without a summary", async () => {
  const op = await staff("operator@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const m = await staff("manager@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const { incident } = await ok(cmd(op, "simulate", { station: "TABLE-A", fault: "card_retained" }));
  await until("route", async () => (await step(op, incident, "route"))?.status !== "waiting");
  await ok(cmd(op, "claim", { incident }));
  await ok(cmd(op, "abandon", { incident }));
  const rec = await until("case_record", async () => (await op.c.from("case_record").select("*").eq("incident", incident).maybeSingle()).data);
  assert.equal(rec.summary, null);
  assert.equal(rec.first_reply_s, null);
  for (const s of ["prepare", "remind_reply", "remind_guard"]) assert.equal((await step(op, incident, s)).code, "closed", s);
  for (const who of [g, m, a]) {
    for (const table of ["bot_step", "bot_suggestion", "case_record"]) {
      assert.deepEqual((await who.c.from(table).select("incident").eq("incident", incident)).data, [], table);
    }
  }
  assert.equal(typeof (await m.c.rpc("insights_bot", { p_days: 7 })).data.records, "number", "managers see the counts");
  assert.ok((await g.c.rpc("insights_bot", { p_days: 7 })).error);
});
