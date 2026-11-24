// Real-world fault paths (content/faults.ts, migration 20261123110000_faults.sql): each held card, passbook or cash
// reason has its own replies, and the server refuses a reply that does not fit the fault type or the caller's taps.
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { APP, staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";
import { LANGS, REPLIES, REPLY_RULES, bankStatusText, replyOf } from "../content/catalogue.ts";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sorted = (xs) => (xs ? [...xs].sort() : null);

async function confirm(who, facts) {
  await ok(cmd(who, "draft", { base_rev: 0, ...facts }));
  await ok(cmd(who, "confirm", { rev: 1 }));
}

// The reply the caller's screen shows now (the current reply_id), in English.
async function shownText(who, incident) {
  const { data: card } = await who.c.from("caller_card").select("reply_id").eq("id", incident).single();
  if (!card.reply_id) return null;
  const { data: r } = await who.c.from("reply").select("intent, slots").eq("id", card.reply_id).single();
  return replyOf(r.intent).text(r.slots);
}

test("the catalogue's reply rules are the database's, and no reply tells a caller to collect a card", async () => {
  const { data, error } = await service().schema("ichido").from("reply_rule").select("*");
  assert.ifError(error);
  const db = Object.fromEntries(data.map((r) => [r.intent, [sorted(r.faults), sorted(r.needs_flags), sorted(r.blocked_by)]]));
  const ts = Object.fromEntries(Object.entries(REPLY_RULES).map(([k, r]) => [k, [sorted(r.faults), sorted(r.needsFlags), sorted(r.blockedBy)]]));
  assert.deepEqual(db, ts);
  const slots = { branch: Object.fromEntries(LANGS.map((l) => [l, "Ekimae"])), hours: Object.fromEntries(LANGS.map((l) => [l, "9-15"])) };
  for (const [intent, r] of Object.entries(REPLIES)) {
    const text = r.text(slots);
    for (const l of LANGS) assert.ok(text[l]?.length > 10, `${intent}.${l}`);
    assert.doesNotMatch(text.en, /collect|pick (it )?up|PIN|card number|account number/i, intent);
    assert.doesNotMatch(text.ja, /うけとり|受け取|暗証/, intent);
  }
});

test("a forgotten or deliberately kept card can never get 'your card is inside, you can wait'", async () => {
  const op = await staff("operator@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "en");
  await confirm(a, { card_back: "no", cash_received: "no" });

  // The machine said "card retained", but the caller says they forgot it: refused before the type is even corrected.
  await ok(cmd(a, "flag", { flag: "forgot_card", on: true }));
  assert.equal((await cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" })).status, 409);
  await ok(cmd(a, "flag", { flag: "forgot_card", on: false }));

  // Sent on the machine alert, then the operator corrects the type: the held reply leaves the caller's screen.
  await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));
  await ok(cmd(a, "choose", { choice: "wait" }));
  assert.equal((await cmd(g, "set_fault", { incident, fault: "card_forgotten" })).status, 403);
  assert.equal((await cmd(a, "set_fault", { incident, fault: "card_forgotten" })).status, 403);
  assert.equal((await cmd(op, "set_fault", { incident, fault: "not_a_fault" })).status, 400);
  await ok(cmd(op, "set_fault", { incident, fault: "card_forgotten" }));
  const { data: card } = await a.c.from("caller_card").select("fault, reply_id, choice").eq("id", incident).single();
  assert.deepEqual(card, { fault: "card_forgotten", reply_id: null, choice: null });
  assert.equal((await cmd(a, "choose", { choice: "wait" })).status, 409, "no wait/leave choice survives");

  for (const fault of ["card_forgotten", "card_kept"]) {
    await ok(cmd(op, "set_fault", { incident, fault }));
    assert.equal((await cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" })).status, 409, fault);
  }
  assert.equal((await cmd(op, "send", { incident, intent: "CARD_FORGOTTEN" })).status, 409, "a reply for another fault type");
  await ok(cmd(op, "send", { incident, intent: "CARD_KEPT_RULE" }));
  const text = await shownText(a, incident);
  assert.match(text.en, /It is not broken.*Ask the bank that issued the card/);
  assert.doesNotMatch(text.en, /inside the machine|You can wait/);
  assert.match(text.en, /No need to wait here/);
  const kinds = (await op.c.from("case_event").select("kind").eq("incident", incident)).data.map((e) => e.kind);
  assert.ok(kinds.includes("fault_changed") && kinds.includes("reply_withdrawn"));
  await ok(cmd(op, "abandon", { incident }));
});

test("debited but no cash: the bank checks the record and corrects the balance; keep the slip; no need to wait", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "en");
  await ok(cmd(op, "set_fault", { incident, fault: "debited_no_cash" }));
  await confirm(a, { cash_received: "no" });
  for (const intent of ["HELD_WAIT_OR_LEAVE", "CASH_IN_JAM", "CARD_FORGOTTEN"]) {
    assert.equal((await cmd(op, "send", { incident, intent })).status, 409, intent);
  }
  await ok(cmd(op, "send", { incident, intent: "CASH_DEBITED" }));
  const text = await shownText(a, incident);
  assert.match(text.en, /the bank will check and fix your balance/);
  assert.match(text.en, /Keep any slip/);
  assert.match(text.en, /No need to wait here/);
  assert.equal((await cmd(a, "choose", { choice: "wait" })).status, 409, "no wait/leave choice");
  await ok(cmd(op, "abandon", { incident }));
});

test("the stated amount (本人申告) is typed by the operator only, for cash faults, and is never on the caller's side", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "en");
  assert.equal((await cmd(a, "stated_amount", { incident, amount: 12000 })).status, 403, "never from the caller's phone");
  assert.equal((await cmd(op, "stated_amount", { incident, amount: 12000 })).status, 409, "not a cash fault");
  await ok(cmd(op, "set_fault", { incident, fault: "cash_jam" }));
  for (const amount of ["12000", 0, 1.5, 20_000_000, undefined]) {
    assert.equal((await cmd(op, "stated_amount", { incident, amount })).status, 400, String(amount));
  }
  await ok(cmd(op, "stated_amount", { incident, amount: 12000 }));
  assert.equal((await op.c.from("desk").select("stated_amount").eq("id", incident).single()).data.stated_amount, 12000);
  assert.deepEqual((await a.c.from("desk").select("stated_amount")).data, [], "the caller cannot read the desk");
  const { data: mine } = await a.c.from("caller_card").select("*").eq("id", incident).single();
  assert.ok(!("stated_amount" in mine));

  const { path } = await ok(cmd(op, "handoff_create", { incident, recipient: "bank" }));
  const page = await (await fetch(`${APP}${path}`)).text();
  assert.ok(page.includes("本人申告") && page.includes("12,000円"), "labelled 本人申告 on the hand-off record");
  await ok(cmd(op, "abandon", { incident }));
});

test("residence-card restriction: the reply needs the caller's 'card can't be used' and sends the caller to the bank that issued the card and names the 22-language desk", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "en");
  await ok(cmd(op, "set_fault", { incident, fault: "card_unreadable" }));
  await confirm(a, { card_back: "yes", cash_received: "no" });
  assert.equal((await cmd(op, "send", { incident, intent: "RESIDENCE_CARD" })).status, 409, "only once the caller said so");
  await ok(cmd(a, "flag", { flag: "card_cant_use", on: true }));
  await ok(cmd(op, "send", { incident, intent: "RESIDENCE_CARD" }));
  const { data: st } = await op.c.from("station").select("branch").eq("id", "TABLE-A").single();
  const text = await shownText(a, incident);
  assert.match(text.en, /residence period/);
  assert.match(text.en, /22 languages/);
  // The new residence card goes to the bank that issued the card, not to whoever runs this ATM (often a convenience store).
  assert.match(text.en, /the bank that issued your card/);
  assert.ok(!text.en.includes(st.branch.en), "not the ATM's own help line");
  await ok(cmd(op, "abandon", { incident }));
});

test("a visitor's foreign-issued card: contact the issuer to block it; the bank here follows its own procedure", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "en");
  await confirm(a, { card_back: "no", cash_received: "no" });
  assert.equal((await cmd(op, "send", { incident, intent: "VISITOR_CARD" })).status, 409);
  await ok(cmd(a, "flag", { flag: "leaving_japan", on: true }));
  await ok(cmd(op, "send", { incident, intent: "VISITOR_CARD" }));
  const text = await shownText(a, incident);
  assert.match(text.en, /contact your card issuer/);
  assert.match(text.en, /own procedure/);
  assert.doesNotMatch(text.en, /returned|come back out|collect/i, "no promise the card comes back");
  await ok(cmd(op, "abandon", { incident }));
});

test("'a family member is helping me' is recorded as a flag only, and the operator sees it", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "ja");
  await ok(cmd(a, "flag", { flag: "helper", on: true }));
  await ok(cmd(a, "flag", { flag: "helper", on: true }));
  assert.equal((await cmd(a, "flag", { flag: "family_name", on: true })).status, 400, "catalogue codes only");
  assert.equal((await cmd(a, "flag", { flag: "helper" })).status, 400);
  assert.equal((await cmd(op, "flag", { flag: "helper", on: true })).status, 403);
  assert.deepEqual((await op.c.from("caller_card").select("flags").eq("id", incident).single()).data.flags, ["helper"]);
  const events = (await op.c.from("case_event").select("kind, data").eq("incident", incident).eq("kind", "flag")).data;
  assert.deepEqual(events.map((e) => e.data), [{ flag: "helper", on: true }], "one event, no personal details");
  await ok(cmd(a, "flag", { flag: "helper", on: false }));
  assert.deepEqual((await op.c.from("caller_card").select("flags").eq("id", incident).single()).data.flags, []);
  await ok(cmd(op, "abandon", { incident }));
});

test("follow-up: after the case closes and the pairing expires, the caller still sees the bank's status in their language", async () => {
  const op = await staff("operator@ichido.demo");
  const op2 = await staff("operator2@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  const other = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "ja");
  await confirm(a, { card_back: "no", cash_received: "yes" });
  const { id: reply } = await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));
  await ok(cmd(a, "choose", { choice: "leave" }));
  await ok(cmd(a, "teachback", { text: "かえって 銀行の れんらくを まちます" }));
  await ok(cmd(op, "outcome", { incident, reply, result: "understood" }));

  assert.equal((await cmd(g, "bank_status", { incident, status: "received" })).status, 403);
  assert.equal((await cmd(a, "bank_status", { incident, status: "received" })).status, 403);
  assert.equal((await cmd(op, "bank_status", { incident, status: "collect_your_card" })).status, 400, "catalogue statuses only");
  assert.equal((await cmd(op, "bank_status", { incident, status: "contact_by" })).status, 400, "contact_by needs a date");
  // Any operator may record it on the bank's behalf, after the case has closed.
  await ok(cmd(op2, "bank_status", { incident, status: "contact_by", channel:"phone", due: "2026-12-01" }));
  assert.equal((await a.c.from("caller_card").select("bank_status").eq("id", incident).single()).data.bank_status, "contact_by");

  // The two-hour pairing runs out; the phone can still follow its closed case, and only that.
  const { error } = await service().schema("ichido").from("binding").update({ expires: new Date(Date.now() - 1000).toISOString() }).eq("incident", incident);
  assert.ifError(error);
  assert.equal((await ok(cmd(a, "mine"))).incident, null);
  const { case: f } = await ok(cmd(a, "followup"));
  assert.equal(f.id, incident);
  assert.equal(f.bank_status, "contact_by");
  assert.equal(f.bank_due, "2026-12-01");
  assert.equal(f.reply.intent, "HELD_WAIT_OR_LEAVE");
  assert.ok(!("stated_amount" in f) && !("caller_words" in f), "nothing staff-only");
  assert.match(bankStatusText(f.bank_status, f.bank_due, f.lang), /12月1日までに れんらくします/);
  assert.equal((await ok(cmd(other, "followup"))).case, null, "another phone sees nothing");
  assert.equal((await cmd(op, "followup")).status, 403);
});
