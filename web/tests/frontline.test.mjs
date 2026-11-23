import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { approvedInfo, conversationText, screenTurn } from "../content/frontline-policy.ts";
import { preferredDesk, serviceMatch } from "../lib/frontline-routing.ts";
import { FRONTLINE, LANGS } from "../content/catalogue.ts";
import { caller, cmd, ok, staff, APP } from "./helpers.mjs";
import { enableClosure, shelterAnswer, frontlineCase } from "./frontline-fixture.mjs";

test("catalogue greeting and disclosure in all six caller languages", () => {
  assert.equal(new Set(Object.values(FRONTLINE.disclosure)).size, 6);
  for (const lang of LANGS) {
    assert.match(conversationText("greeting", lang), /AI|এআই|एआई/u);
    assert.ok(conversationText("disclosure", lang).length > 28);
    assert.ok(approvedInfo("SHELTER_INFO", "shelter_info", ["need_news"], true, lang));
    assert.equal(approvedInfo("SHELTER_INFO", "shelter_info", ["need_news","family_child"], true, lang), null);
    assert.equal(approvedInfo("TRANSIT_GUIDE", "transit_way", [], true, lang), null);
  }
});

test("routing prefers available pack and language specialists and falls back to the general desk", () => {
  const score = (packs, languages) => serviceMatch({ service_packs: packs, service_languages: languages }, "shelter_info", "ne");
  const staff = [{ uid: "both", score: score(["shelter"], ["ne"]) }, { uid: "pack", score: score(["shelter"], []) }, { uid: "general", score: score([], []) }];
  assert.deepEqual([...preferredDesk(staff, new Set(["both","pack"]))], ["both"]);
  assert.deepEqual([...preferredDesk(staff, new Set(["pack","general"]))], ["pack"]);
  assert.equal(preferredDesk(staff, new Set(["general"])).size, 0);
  assert.equal(preferredDesk(staff, null).size, 0);
});

test("deterministic Bengali human request and urgent words survive number withholding", () => {
  assert.equal(screenTurn("আমার কার্ড আটকে গেছে, আমি একজন মানুষের সঙ্গে কথা বলতে চাই, দয়া করে").transfer.reason, "human_request");
  for (const words of ["my card 1234 and I cannot breathe", "পিন ১২৩৪, শ্বাস নিতে কষ্ট হচ্ছে", "मेरो पिन १२३४, सास फेर्न गाह्रो छ"]) {
    assert.deepEqual(screenTurn(words), { withheld: true, transfer: { priority: 0, reason: "suspected_risk" } });
  }
});

test("Bengali request transfers on submission and monitor excludes unsent drafts", async (t) => {
  const f = await frontlineCase(t, "bn");
  const text = "আমি একটু বলি, একজন মানুষের সঙ্গে কথা বলতে চাই";
  assert.equal((await f.monitor()).at(0).wording, "greeting");
  assert.equal((await cmd(f.phone, "frontline_turn", { act: "text", text, request_id: randomUUID(), base_rev: 0 })).status, 403);
  await f.turn("start");
  await f.admin.from("draft").update({ words: "PRIVATE_UNSUBMITTED_FIXTURE" }).eq("incident", f.incident).throwOnError();
  assert.equal((await f.turn("text", { text })).handler, "queued");
  const turns = await f.monitor();
  assert.ok(turns.some((row) => row.words === text));
  assert.ok(!JSON.stringify(turns).includes("PRIVATE_UNSUBMITTED_FIXTURE"));
  assert.equal((await f.desk()).priority, 1);
  for (const who of [await staff("guard1@ichido.demo"), await caller(), await staff("manager@ichido.demo")]) {
    assert.equal((await cmd(who, "frontline_monitor", { incident: f.incident })).status, 403);
    assert.deepEqual((await who.c.from("frontline_turn").select("*").eq("incident", f.incident).throwOnError()).data, []);
  }
  assert.equal((await cmd(f.op, "handoff_create", { incident: f.incident, recipient: "bank" })).status, 403);
  await ok(cmd(f.op, "takeover", { incident: f.incident }));
  const link = await ok(cmd(f.op, "handoff_create", { incident: f.incident, recipient: "bank" }));
  const response = await fetch(APP + link.path);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes(text) && !html.includes("PRIVATE_UNSUBMITTED_FIXTURE"));
});

test("Nepali caller completes transfer by text with one winner of simultaneous takeover", async (t) => {
  const f = await frontlineCase(t, "ne");
  await f.turn("start");
  await f.turn("text", { text: "म कर्मचारीसँग कुरा गर्न चाहन्छु" });
  const queued = await f.desk();
  assert.equal(queued.handler, "queued");
  const op2 = await staff("operator2@ichido.demo");
  const race = await Promise.all([f.op, op2].map((op) => cmd(op, "takeover", { incident: f.incident, epoch: queued.handler_epoch })));
  assert.deepEqual(race.map((r) => r.status).sort(), [200,409]);
  const owner = race[0].status === 200 ? f.op : op2;
  await f.turn("facts", { key: "card_back", value: "no" });
  await f.turn("confirm");
  await ok(cmd(owner, "send", { incident: f.incident, intent: "OFFICIAL_CHANNEL" }));
  assert.ok((await f.monitor()).some((r) => r.speaker === "human" && r.locale === "ne" && r.wording === "OFFICIAL_CHANNEL"));
  assert.equal((await f.desk()).operator_id, owner.uid);
});

test("urgent number-bearing submission stores neither the number nor a medical fact", async (t) => {
  const f = await frontlineCase(t);
  await f.turn("start");
  const r = await f.turn("text", { text: "My pin is 4321 and I cannot breathe" });
  assert.equal(r.withheld, true);
  assert.equal((await f.desk()).priority, 0);
  assert.equal((await f.desk()).confirmed_rev, null);
  assert.ok(!JSON.stringify(await f.monitor()).includes("4321"));
});

test("correction wins over an in-flight AI candidate at the commit boundary", async (t) => {
  const f = await frontlineCase(t);
  await f.turn("start");
  const { data: b } = await f.admin.schema("ichido").from("binding").select("voice_room").eq("incident", f.incident).single().throwOnError();
  const args = { p_uid: f.phone.uid, p_generation: b.voice_room, p_request: randomUUID() };
  await f.admin.rpc("frontline_submit", { ...args, p_rev: 0, p_act: "text", p_words: "My card", p_facts: {}, p_priority: null, p_reason: null }).throwOnError();
  await f.turn("facts", { key: "card_back", value: "yes" });
  const stale = await f.admin.rpc("frontline_finish", { ...args, p_wording: "readback", p_patch: { card_back: "no" }, p_triage: null, p_priority: null, p_reason: null, p_manual: "fixture" }).throwOnError();
  assert.equal(stale.data, false);
  assert.equal((await f.phone.c.from("draft").select("card_back").single().throwOnError()).data.card_back, "yes");
});

test("AI guidance never satisfies the human SLA that starts at transfer", async (t) => {
  const f = await frontlineCase(t, "ne", "shelter");
  await f.admin.from("desk").update({ created_at: "2020-01-01" }).eq("id", f.incident).throwOnError();
  await f.turn("start");
  await f.turn("tap", { flag: "need_news", on: true });
  await f.turn("confirm");
  const replies = await f.admin.from("reply").select("author,intent,operator_id").eq("incident", f.incident).throwOnError();
  assert.deepEqual(replies.data, [{ author: "ai", intent: "SHELTER_INFO", operator_id: null }]);
  const cron = () => f.admin.schema("ichido").rpc("escalate_due").throwOnError();
  const reasons = async () => (await f.op.c.from("escalation").select("reason").eq("incident", f.incident).throwOnError()).data.map((r) => r.reason);
  await cron();
  assert.deepEqual(await reasons(), []);
  await ok(cmd(f.phone, "human"));
  await cron();
  assert.deepEqual(await reasons(), []);
  await f.admin.from("desk").update({ queued_at: new Date(Date.now()-190000).toISOString() }).eq("id", f.incident).throwOnError();
  await cron();
  assert.ok((await reasons()).includes("no_reply"));
});

test("explicit acknowledgement needs a current delivered autonomous reply; follow-up belongs to this phone",async t => {
  await enableClosure(t);
  const f = await frontlineCase(t,"en","shelter");
  const b = await shelterAnswer(f);
  assert.equal((await cmd(f.phone,"resolve_info",b)).status,409);
  assert.equal((await ok(cmd(f.phone,"info_delivery",b))).ready,true);
  for (const change of [{ack:false},{rev:b.rev+1},{reply:randomUUID()},{lang:"ja"}]) {
    assert.ok([400,409].includes((await cmd(f.phone,"resolve_info",{...b,...change})).status));
  }
  await ok(cmd(f.phone,"resolve_info",b));
  assert.equal((await f.desk()).resolved_by,"ai");
  assert.equal((await ok(cmd(f.phone,"caller_screen"))).follow.id,f.incident);
  assert.equal((await cmd(await caller(),"recontact",{receipt:f.incident})).status,403);
});
