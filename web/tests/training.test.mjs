// AI response training: an operator runs and scores an isolated session; nothing reaches the desk or insights.
// Runs without OPENAI_API_KEY (scripted caller); with a key the caller's lines differ but every check still holds.
import test from "node:test";
import assert from "node:assert/strict";
import { staff, caller, cmd, ok } from "./helpers.mjs";

const turns = async (who, session) => (await who.c.from("training_turn").select("who, kind, text, data").eq("session", session).order("id")).data;
const session = async (who, id) => (await who.c.from("training_session").select("*").eq("id", id).maybeSingle()).data;

// What a training run could touch if it leaked into the real desk.
async function deskCounts(op) {
  const count = async (t) => (await op.c.from(t).select("*", { count: "exact", head: true })).count;
  const { data: insights } = await op.c.rpc("insights", { p_days: 7 });
  return { desk: await count("desk"), reply: await count("reply"), field_job: await count("field_job"), case_event: await count("case_event"), funnel: insights.funnel };
}

// The local DB may be shared with other test runs, so a change seen once is retried: a training leak would show every time.
async function assertDeskUntouched(op, run) {
  let before, after;
  for (let attempt = 0; attempt < 8; attempt++) {
    before = await deskCounts(op);
    await run();
    after = await deskCounts(op);
    if (JSON.stringify(after) === JSON.stringify(before)) return;
  }
  assert.deepEqual(after, before, "no desk rows, replies, guard jobs, events or insights counts");
}

test("an operator runs a kept-card session to a full score without touching the desk", async () => {
  const op = await staff("operator@ichido.demo");
  await assertDeskUntouched(op, () => fullRun(op));
});

async function fullRun(op) {
  const { session: id } = await ok(cmd(op, "training_start", { scenario: "bn_card_kept" }));
  assert.equal((await turns(op, id))[0].who, "caller", "the simulated caller opens the call");

  assert.equal((await cmd(op, "training_reply", { session: id, intent: "HELD_WAIT_OR_LEAVE" })).status, 409, "no reply before the read-back is confirmed");
  await ok(cmd(op, "training_say", { session: id, text: "カードは機械から出てきましたか？" }));
  await ok(cmd(op, "training_readback", { session: id }));
  const s = await session(op, id);
  assert.deepEqual([s.card_back, s.cash_received], ["no", "no"], "the caller confirms the facts it actually has");
  assert.equal((await cmd(op, "training_reply", { session: id, intent: "NOT_A_REPLY" })).status, 400, "catalogue replies only");
  await ok(cmd(op, "training_reply", { session: id, intent: "HELD_WAIT_OR_LEAVE" }));
  await ok(cmd(op, "training_dispatch", { session: id }));
  const { points, max } = await ok(cmd(op, "training_end", { session: id }));
  assert.equal(points, max, JSON.stringify((await session(op, id)).score));
  assert.equal((await cmd(op, "training_say", { session: id, text: "もしもし" })).status, 409, "a finished session is closed");

  const kinds = (await turns(op, id)).map((t) => `${t.who}:${t.kind}`);
  for (const k of ["caller:say", "operator:say", "system:readback", "caller:confirm", "operator:reply", "operator:dispatch"]) assert.ok(kinds.includes(k), k);
}

test("the held-card reply is scored as a mistake when the card came back", async () => {
  const op = await staff("operator@ichido.demo");
  const { session: id } = await ok(cmd(op, "training_start", { scenario: "en_tourist_card_back" }));
  await ok(cmd(op, "training_readback", { session: id }));
  await ok(cmd(op, "training_reply", { session: id, intent: "HELD_WAIT_OR_LEAVE" }));
  await ok(cmd(op, "training_dispatch", { session: id }));
  await ok(cmd(op, "training_end", { session: id }));
  const score = Object.fromEntries((await session(op, id)).score.map((x) => [x.key, x.result]));
  assert.deepEqual([score.held, score.intent, score.guard], ["fail", "fail", "fail"]);
  assert.equal(score.time, "pass");
});

test("card numbers are withheld from the caller and the operator, and asking for one is marked", async () => {
  const op = await staff("operator@ichido.demo");
  const { session: id } = await ok(cmd(op, "training_start", { scenario: "ja_reads_number" }));
  assert.ok((await turns(op, id)).some((t) => t.who === "caller" && t.kind === "withheld" && t.text === null), "the caller's number is withheld");
  assert.deepEqual(await ok(cmd(op, "training_say", { session: id, text: "4980 1234 5678 9012" })), { withheld: true });
  await ok(cmd(op, "training_say", { session: id, text: "カード番号を教えてください" }));
  for (const t of await turns(op, id)) assert.ok(!/\d{4}/.test(t.text ?? ""), "no number is stored");
  await ok(cmd(op, "training_end", { session: id }));
  assert.equal((await session(op, id)).score.find((x) => x.key === "numbers").result, "fail");

  const { session: id2 } = await ok(cmd(op, "training_start", { scenario: "ja_reads_number" }));
  await ok(cmd(op, "training_say", { session: id2, text: "番号は言わないでください。カードは出てきましたか？" }));
  await ok(cmd(op, "training_end", { session: id2 }));
  assert.equal((await session(op, id2)).score.find((x) => x.key === "numbers").result, "pass", "stopping the caller is the veteran's move");
});

test("a request for a person is handled with the handset reply", async () => {
  const op = await staff("operator@ichido.demo");
  const { session: id } = await ok(cmd(op, "training_start", { scenario: "bn_wants_person" }));
  assert.equal((await session(op, id)).needs_human, true);
  assert.ok((await turns(op, id)).some((t) => t.kind === "human"));
  await ok(cmd(op, "training_readback", { session: id }));
  await ok(cmd(op, "training_reply", { session: id, intent: "HANDSET" }));
  await ok(cmd(op, "training_reply", { session: id, intent: "HELD_WAIT_OR_LEAVE" }));
  await ok(cmd(op, "training_dispatch", { session: id }));
  const { points, max } = await ok(cmd(op, "training_end", { session: id }));
  assert.equal(points, max);
});

test("only the owning operator can run or read a session; guards, callers and managers cannot", async () => {
  const op = await staff("operator@ichido.demo");
  const op2 = await staff("operator2@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const m = await staff("manager@ichido.demo");
  const a = await caller();
  for (const who of [g, a, m]) assert.equal((await cmd(who, "training_start", { scenario: "ja_elderly" })).status, 403);
  assert.equal((await cmd(op, "training_start", { scenario: "nope" })).status, 400);
  const { session: id } = await ok(cmd(op, "training_start", { scenario: "ja_elderly" }));
  for (const who of [g, a]) assert.equal((await cmd(who, "training_say", { session: id, text: "hello" })).status, 403);
  assert.equal((await cmd(op2, "training_say", { session: id, text: "もしもし" })).status, 404, "another operator's session");
  assert.equal((await cmd(op2, "training_end", { session: id })).status, 404);
  for (const who of [op2, g, a, m]) {
    assert.equal(await session(who, id), null, "row-level security hides the session");
    assert.deepEqual(await turns(who, id), [], "and its turns");
  }
  await ok(cmd(op, "training_end", { session: id }));
});
