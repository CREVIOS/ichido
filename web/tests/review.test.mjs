// 要確認 (For review): the AI and the bot draft, the operator who owns the case decides. Decisions persist once,
// with a timeline event; guards, callers and other operators cannot act; accepting does only what the operator could do by hand.
// The prepared suggestion and the machine translations are seeded with the service role (the bot and OpenAI write them in production).
import test from "node:test";
import { frontlineCase } from "./frontline-fixture.mjs";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";
import { eventText, REVIEW } from "../content/catalogue.ts";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

async function until(what, fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await wait(250);
  }
}

const queue = async (who, incident) => {
  const { data, error } = await who.c.rpc("review_queue");
  assert.ifError(error);
  return data.filter((i) => i.incident === incident);
};
const item = async (who, incident, kind) => (await queue(who, incident)).find((i) => i.kind === kind);
const review = (who, it, decision, extra = {}) => cmd(who, "review", { incident: it.incident, kind: it.kind, ref: it.ref, decision, ...extra });
const states = async (incident) => (await admin.from("review_state").select("*").eq("incident", incident)).data;
const events = async (op, incident, kind) => (await op.c.from("case_event").select("actor, actor_name, kind, data").eq("incident", incident).eq("kind", kind)).data;

async function seedSuggestion(incident, rev, guard) {
  const suggestion = {
    intent: "HELD_WAIT_OR_LEAVE", dispatch: Boolean(guard), guard: guard ?? null,
    reasons: ["お客様はカードが戻っていないと確認しています。"], risks: [], model: "test", steps: [], ms: 1,
  };
  const { error } = await admin.from("bot_suggestion").upsert({ incident, rev, suggestion, at: new Date().toISOString() });
  assert.ifError(error);
}

async function confirmedCase(op, a, facts) {
  const incident = await openPairedCase(op, a, "en");
  await ok(cmd(a, "draft", { base_rev: 0, text: "the machine kept my card" }));
  await ok(cmd(a, "draft", { base_rev: 1, ...facts }));
  await ok(cmd(a, "confirm", { rev: 2 }));
  // With a model configured, the Ichido Bot stores its own suggestion for this revision: let it finish first, so a
  // seeded suggestion is not overwritten.
  if (process.env.GEMINI_API_KEY) await until("bot prepared", async () => {
    const { data } = await admin.from("bot_step").select("status, data").eq("incident", incident).eq("step", "prepare").maybeSingle();
    return data && data.status !== "waiting" && data.data?.rev === 2 ? data : null;
  });
  return incident;
}

test("items appear per group, only for the owner; dismiss, confirm, reissue and revoke persist once", async () => {
  const op = await staff("operator@ichido.demo");
  const op2 = await staff("operator2@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await confirmedCase(op, a, { card_back: "no", cash_received: "no" });
  const guard = (await ok(cmd(op, "staff_list"))).field.find((x) => x.uid === g.uid);
  await seedSuggestion(incident, 2, { uid: g.uid, name: guard.display_name });
  await admin.from("desk").update({ caller_words_ja: "機械にカードが残りました" }).eq("id", incident).throwOnError();
  await ok(cmd(op, "handoff_create", { incident, recipient: "bank" }));

  const mine = await until("three groups", async () => {
    const q = await queue(op, incident);
    return q.length >= 3 ? q : null;
  });
  assert.deepEqual(mine.map((i) => i.kind).sort(), ["handoff", "suggestion", "translation"]);
  assert.equal(mine.find((i) => i.kind === "translation").ref, "words:2");
  assert.deepEqual(await queue(op2, incident), [], "another operator's case is not in my queue");
  for (const who of [g, a]) assert.ok((await who.c.rpc("review_queue")).error, "guards and callers have no queue");

  // Nobody but the owner can act, and nothing happens when they try.
  const sug = mine.find((i) => i.kind === "suggestion");
  for (const who of [op2, g, a]) {
    assert.equal((await review(who, sug, "accepted")).status, 403);
    assert.equal((await review(who, sug, "dismissed")).status, 403);
  }
  // Accepting can only do what the operator could do by hand: after a successful remote release the held-card
  // reply is refused, so nothing is sent, dispatched or recorded.
  await ok(cmd(op, "remote_release", { incident, result: "released" }));
  assert.equal((await review(op, sug, "accepted")).status, 409);
  assert.deepEqual((await op.c.from("reply").select("id").eq("incident", incident)).data, []);
  assert.equal((await op.c.from("field_job").select("incident").eq("incident", incident).maybeSingle()).data, null);
  assert.deepEqual(await states(incident), []);

  await ok(review(op, sug, "dismissed"));
  assert.equal((await review(op, sug, "dismissed")).status, 409, "once");
  const [dismissed] = await events(op, incident, "suggestion_dismissed");
  assert.equal(dismissed.actor, "operator");
  assert.equal(eventText(dismissed.kind, dismissed.data), REVIEW.events.suggestion_dismissed);

  const mt = mine.find((i) => i.kind === "translation");
  assert.equal((await review(op2, mt, "confirmed")).status, 403);
  await ok(review(op, mt, "confirmed"));
  assert.equal((await events(op, incident, "translation_confirmed")).length, 1);

  const link = mine.find((i) => i.kind === "handoff");
  assert.equal((await review(op2, link, "reissued")).status, 403);
  const { path } = await ok(review(op, link, "reissued"));
  assert.match(path, /^\/h\//);
  const { links } = await ok(cmd(op, "handoff_list", { incident }));
  assert.ok(links.find((l) => l.id === link.ref).revoked_at, "the old link is revoked");
  const fresh = await item(op, incident, "handoff");
  assert.notEqual(fresh.ref, link.ref, "the new link waits to be viewed");
  await ok(review(op, fresh, "revoked"));
  assert.ok((await ok(cmd(op, "handoff_list", { incident }))).links.every((l) => l.revoked_at));

  const rows = await states(incident);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.decision}`).sort(), ["handoff:reissued", "handoff:revoked", "suggestion:dismissed", "translation:confirmed"]);
  assert.ok(rows.every((r) => r.reviewed_by === op.uid && r.reviewer && r.reviewed_at));
  assert.deepEqual(await queue(op, incident), []);
  for (const who of [g, a]) assert.deepEqual((await who.c.from("review_state").select("kind").eq("incident", incident)).data, []);
  assert.equal((await op2.c.from("review_state").select("kind").eq("incident", incident)).data.length, 4, "operators can read decisions");
  await ok(cmd(op, "abandon", { incident }));
});

test("accepting sends the stored suggestion through the operator's own commands, once; the record is approved with a staff note", async () => {
  const op = await staff("operator@ichido.demo");
  const op2 = await staff("operator2@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await confirmedCase(op, a, { card_back: "no", cash_received: "no" });
  const guard = (await ok(cmd(op, "staff_list"))).field.find((x) => x.uid === g.uid);
  await seedSuggestion(incident, 2, { uid: g.uid, name: guard.display_name });
  const sug = await until("suggestion", () => item(op, incident, "suggestion"));

  await ok(review(op, sug, "accepted", { intent: "OFFICIAL_CHANNEL" }));   // the body's intent is ignored
  assert.equal((await review(op, sug, "accepted")).status, 409, "never twice");
  const { data: replies } = await op.c.from("reply").select("intent, operator_id").eq("incident", incident);
  assert.deepEqual(replies, [{ intent: "HELD_WAIT_OR_LEAVE", operator_id: op.uid }]);
  const { data: job } = await op.c.from("field_job").select("assignee, generation").eq("incident", incident).single();
  assert.equal(job.assignee, g.uid);
  for (const k of ["reply", "suggestion_accepted", "dispatch"]) assert.equal((await events(op, incident, k))[0]?.actor, "operator", k);
  assert.equal((await states(incident))[0].decision, "accepted");
  assert.equal(await item(op, incident, "suggestion"), undefined);

  // The teach-back's machine translation, flagged for a bilingual colleague.
  const { data: card } = await op.c.from("caller_card").select("reply_id").eq("id", incident).single();
  await ok(cmd(a, "teachback", { text: "I will wait for the bank to call me" }));
  await admin.from("caller_card").update({ teachback_ja: "銀行からの連絡を待ちます" }).eq("id", incident).throwOnError();
  const tb = await until("teach-back translation", () => item(op, incident, "translation"));
  assert.match(tb.ref, /^teachback:\d+$/);
  await ok(review(op, tb, "flagged"));
  assert.equal((await events(op, incident, "translation_flagged")).length, 1);

  // Close; the bot writes the record; the owner approves it with a staff-only note.
  await ok(cmd(op, "outcome", { incident, reply: card.reply_id, result: "understood" }));
  const rec = await until("record item", () => item(op, incident, "record"), 30_000);
  assert.ok(rec.data.summary.length > 0);
  assert.equal((await review(op2, rec, "approved")).status, 403);
  assert.equal((await review(a, rec, "approved")).status, 403);
  assert.equal((await review(op, rec, "approved", { note: "x".repeat(501) })).status, 400);
  await ok(review(op, rec, "approved", { note: "銀行の担当者へ電話済み" }));
  const approved = (await states(incident)).find((r) => r.kind === "record");
  assert.equal(approved.decision, "approved");
  assert.equal(approved.note, "銀行の担当者へ電話済み");
  const [ev] = await events(op, incident, "record_approved");
  assert.deepEqual(ev.data, {}, "the timeline never carries the note");
  assert.equal(await item(op, incident, "record"), undefined);
  await ok(cmd(g, "field", { incident, generation: job.generation, state: "correct_done" }));
});

test("unclaimed AI sessions never enter the operator's private approval queue", async (t) => {
  const f = await frontlineCase(t);
  await f.turn("start");
  assert.deepEqual(await queue(f.op, f.incident), []);
  assert.equal((await cmd(f.phone, "review", { incident: f.incident, kind: "suggestion", ref: "0", decision: "accepted" })).status, 403);
});
