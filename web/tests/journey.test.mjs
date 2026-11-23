// End-to-end: npm run test:fresh (resets the local DB, then runs against APP, default http://localhost:3123).
import test from "node:test";
import assert from "node:assert/strict";
import { APP, staff, caller, cmd, ok, device, deviceHeaders, newKey, closeOpen, openPairedCase } from "./helpers.mjs";
import { LANGS, pick, readBackText, replyOf } from "../content/catalogue.ts";

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
  await ok(cmd(g2, "field", { incident, generation: j2.generation, state: "arrived" }));
  await ok(cmd(g2, "field", { incident, generation: j2.generation, state: "done" }));
  assert.equal((await g2.c.from("field_job").select("incident")).data.length, 0);

  // Insights: counts for staff, refused for callers and guards.
  assert.ok((await op.c.rpc("insights", { p_days: 7 })).data.funnel.guided >= 1);
  assert.ok((await a.c.rpc("insights", { p_days: 7 })).error);
  assert.ok((await g1.c.rpc("insights", { p_days: 7 })).error);
  assert.equal((await cmd(g1, "simulate", { station: "TABLE-A", fault: "card_retained" })).status, 403);
});

test("Vietnamese journey: pairs in vi, numbers withheld, read-back and approved reply in Vietnamese", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "vi");
  assert.equal((await a.c.from("caller_card").select("lang").single()).data.lang, "vi");

  assert.equal((await ok(cmd(a, "draft", { base_rev: 0, text: "mã pin là một hai ba bốn" }))).withheld, true);
  const { say } = await ok(cmd(a, "draft", { base_rev: 0, card_back: "no", cash_received: "yes" }));
  // The read-back the agent speaks (signed only when AGENT_BRIDGE_SECRET is set) is Vietnamese.
  const readBack = readBackText("vi", { card_back: "no", cash_received: "yes" });
  assert.equal(readBack, "Những gì tôi hiểu: Thẻ chưa được trả ra. Đã nhận được tiền");
  if (say) assert.equal(say.text, readBack);
  await ok(cmd(a, "confirm", { rev: 1 }));
  await ok(cmd(op, "remote_release", { incident, result: "failed" }));
  await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));

  // What the caller's phone renders (app/caller/guidance.tsx): the catalogue text in vi with the station's vi slots.
  const { data: [r] } = await a.c.from("reply").select("intent, slots");
  const text = replyOf(r.intent).text(r.slots).vi;
  assert.match(text, /^Thẻ của bạn đang ở trong máy\. Bạn có thể chờ ở đây, hoặc có thể ra về\./);
  assert.ok(r.slots.branch.vi && r.slots.hours.vi, "the station row carries Vietnamese slots");
  assert.ok(text.includes(`Quầy giao dịch của ${r.slots.branch.vi} (${r.slots.hours.vi})`), text);
  await closeOpen(op);
});

test("pairing accepts the six caller languages only", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  assert.equal((await device(newKey())).status, 204);
  const { data: [d] } = await op.c.from("desk").select("id").is("finished_at", null);
  await ok(cmd(op, "claim", { incident: d.id }));
  const { code } = await ok(cmd(op, "issue_code", { incident: d.id }));
  assert.equal((await cmd(a, "pair", { station: "TABLE-A", code, lang: "fr" })).status, 400);
  await ok(cmd(a, "pair", { station: "TABLE-A", code, lang: "ne" }));
  assert.equal((await a.c.from("caller_card").select("lang").single()).data.lang, "ne");
  assert.deepEqual([...LANGS].sort(), ["bn", "en", "id", "ja", "ne", "vi"]);
  assert.equal(pick({ en: "fallback" }, "ne"), "fallback", "a station without a Nepali key shows English");
  await closeOpen(op);
});

test("an authenticated display press supplies a stable code and hides it on redemption", async (t) => {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  const headers = { ...deviceHeaders(), "x-display": "1" };
  const url = APP + "/api/device";
  const press = (body) => fetch(url, { method: "POST", headers, body });
  const code = async () => (await (await fetch(url, { headers })).text()).match(/^code=(\w+)$/m)?.[1];
  const key = newKey();
  assert.equal((await press(key)).status, 204);
  const first = await code();
  assert.equal(first.length, 6);
  assert.equal((await press(key)).status, 204);
  assert.equal((await press(newKey())).status, 204);
  assert.equal(await code(), first);
  const phone = await caller();
  const { incident } = await ok(cmd(phone, "pair", { station: "TABLE-A", code: first, lang: "ja", frontline: true }));
  t.after(async () => { await ok(cmd(op, "takeover", { incident })); await ok(cmd(op, "abandon", { incident })); });
  assert.equal((await press(key)).status, 204);
  assert.equal(await code(), undefined);
});
