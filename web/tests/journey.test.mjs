// End-to-end: npm run test:fresh (resets the local DB, then runs against APP, default http://localhost:3123).
import test from "node:test";
import assert from "node:assert/strict";
import { staff, caller, cmd, ok, device, newKey, closeOpen } from "./helpers.mjs";

test("typed journey: alert → corrected report → approved reply → guard → teach-back", async () => {
  const op = await staff("operator@ichido.demo");
  const g1 = await staff("guard1@ichido.demo");
  const g2 = await staff("guard2@ichido.demo");
  const a = await caller();
  const b = await caller();
  await closeOpen(op);

  // Device alert is idempotent: the same event id twice gives one case; a wrong secret is refused.
  const key = newKey();
  assert.equal((await device(key)).status, 204);
  assert.equal((await device(key)).status, 204);
  assert.equal((await device(key, "wrong")).status, 401);
  const { data: open } = await op.c.from("desk").select("id, fault").is("finished_at", null);
  assert.equal(open.length, 1);
  assert.equal(open[0].fault, "card_retained");
  const incident = open[0].id;

  await ok(cmd(op, "claim", { incident }));
  await ok(cmd(op, "remote_release", { incident, result: "failed" }));

  // Pairing: wrong code fails; the right code works once; a second phone cannot reuse it.
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  assert.equal((await cmd(a, "pair", { station: "TABLE-A", code: "AAAAAA", lang: "bn" })).status, 403);
  await ok(cmd(a, "pair", { station: "TABLE-A", code, lang: "bn" }));
  assert.equal((await cmd(b, "pair", { station: "TABLE-A", code, lang: "bn" })).status, 403);

  // Isolation: the unpaired phone sees nothing; neither phone reads the staff desk; staff never read drafts.
  assert.deepEqual((await b.c.from("caller_card").select("id")).data, []);
  assert.deepEqual((await a.c.from("desk").select("id")).data, []);
  assert.equal((await a.c.from("caller_card").select("id")).data.length, 1);
  assert.deepEqual((await op.c.from("draft").select("incident").eq("incident", incident)).data, []);

  // Intake: numbers (digits or words) are withheld; a stale revision is refused.
  assert.equal((await ok(cmd(a, "draft", { base_rev: 0, text: "card 1234 5678" }))).withheld, true);
  assert.equal((await ok(cmd(a, "draft", { base_rev: 0, text: "my pin is one two three four" }))).withheld, true);
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "no", cash_received: "no" }));
  await ok(cmd(a, "draft", { base_rev: 1, cash_received: "yes" }));
  assert.equal((await cmd(a, "draft", { base_rev: 1, cash_received: "no" })).status, 409);
  assert.equal((await cmd(a, "confirm", { rev: 1 })).status, 409);
  await ok(cmd(a, "confirm", { rev: 2 }));
  assert.equal((await cmd(a, "draft", { base_rev: 2, card_back: "yes" })).status, 409, "no edits after confirming");
  const { data: desk } = await op.c.from("desk").select("card_back, cash_received, confirmed_rev").eq("id", incident).single();
  assert.deepEqual(desk, { card_back: "no", cash_received: "yes", confirmed_rev: 2 });

  // Lifecycle: no choice or teach-back before a reply.
  assert.equal((await cmd(a, "choose", { choice: "leave" })).status, 409);
  assert.equal((await cmd(a, "teachback", { text: "ঠিক আছে" })).status, 409);

  // Only catalogue replies can be sent, including inherited object keys.
  assert.equal((await cmd(op, "send", { incident, intent: "FREE_TEXT" })).status, 400);
  assert.equal((await cmd(op, "send", { incident, intent: "constructor" })).status, 400);
  const { id: replyId } = await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));
  assert.equal((await a.c.from("reply").select("intent")).data[0].intent, "HELD_WAIT_OR_LEAVE");

  // Dispatch, then reassignment: the replaced guard can no longer update the job.
  await ok(cmd(op, "assign", { incident, assignee: g1.uid }));
  const { data: j1 } = await g1.c.from("field_job").select("generation").eq("incident", incident).single();
  await ok(cmd(g1, "field", { incident, generation: j1.generation, state: "on_way", eta: "30-45" }));
  assert.deepEqual((await a.c.from("caller_card").select("field_state, eta").single()).data, { field_state: "on_way", eta: "30-45" });
  await ok(cmd(op, "assign", { incident, assignee: g2.uid }));
  assert.equal((await cmd(g1, "field", { incident, generation: j1.generation, state: "arrived" })).status, 403);
  const { data: j2 } = await g2.c.from("field_job").select("generation").eq("incident", incident).single();
  await ok(cmd(g2, "field", { incident, generation: j2.generation, state: "on_way" }));
  assert.deepEqual((await a.c.from("caller_card").select("eta").single()).data, { eta: null }, "no estimate unless the guard picks one");

  // Caller chooses and explains; the operator judges the teach-back for the current reply.
  await ok(cmd(a, "choose", { choice: "leave" }));
  await ok(cmd(a, "teachback", { text: "আমি ব্যাংকের ফোনের জন্য অপেক্ষা করব, তারপর শাখায় যাব।" }));
  assert.equal((await cmd(op, "outcome", { incident, reply: "00000000-0000-0000-0000-000000000000", result: "understood" })).status, 409);
  await ok(cmd(op, "outcome", { incident, reply: replyId, result: "understood" }));
  assert.equal((await a.c.from("caller_card").select("status").single()).data.status, "guided");

  // After closure: the caller cannot change anything, and the guard still on the way keeps the job until done.
  assert.equal((await cmd(a, "choose", { choice: "wait" })).status, 409);
  assert.equal((await g2.c.from("field_job").select("incident")).data.length, 1);
  await ok(cmd(g2, "field", { incident, generation: j2.generation, state: "done" }));
  assert.equal((await g2.c.from("field_job").select("incident")).data.length, 0);

  // Insights: counts for staff, refused for callers and guards.
  assert.ok((await op.c.rpc("insights", { p_days: 7 })).data.funnel.guided >= 1);
  assert.ok((await a.c.rpc("insights", { p_days: 7 })).error);
  assert.ok((await g1.c.rpc("insights", { p_days: 7 })).error);
  assert.equal((await cmd(g1, "simulate", { station: "TABLE-A", fault: "card_retained" })).status, 403);
});
