import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shareFlag } from "../lib/handoff-fields.ts";
import pg from "pg";
import { ADMIN, DESK, inviteState, suggestionResult, FIRST_SHIFT, LANGS, OPS_CALLER, PARTNER, flagsFor, identifyingSummary, nextFieldStep, replyOf, shiftCaption } from "../content/catalogue.ts";

test("staff journeys enforce pack, work, delivery and reporting boundaries in one rolled-back transaction", async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
  const sql = await readFile(new URL("./fixtures/ops-journeys.sql",import.meta.url),"utf8");
  const client = new pg.Client({ connectionString:url.href });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local plpgsql.check_asserts = on");
    await client.query(sql);
  } finally {
    try { await client.query("rollback"); } finally { await client.end(); }
  }
});

test("field actions start with acknowledgement and progress one step at a time", () => {
  assert.equal(nextFieldStep("requested",null),"accept");
  assert.equal(nextFieldStep("requested","now"),"on_way");
  assert.equal(nextFieldStep("on_way","now"),"arrived");
  assert.equal(nextFieldStep("arrived","now"),"done");
  assert.equal(nextFieldStep("done","now"),null);
});

test("all six catalogues carry withdrawal and reference-bearing railway follow-up", () => {
  assert.ok(flagsFor("transit_way").includes("leave_soon"));
  assert.ok(flagsFor("transit_lost_item").includes("share_item"));
  for (const l of LANGS) {
    assert.ok(OPS_CALLER.notice.guidance_changed[l].trim());
    assert.ok(replyOf("TRANSIT_LEAVE").text({ reference:"JR-TEST" })[l].includes("JR-TEST"));
  }
  assert.doesNotMatch(OPS_CALLER.fraud.body.en,/coming/);
  assert.match(replyOf("HOSP_INTERPRETER").text({}).en,/requested/);
  assert.match(replyOf("SHELTER_NEEDS").text({}).en,/accepted/);
});

test("handoff flags depend on the recipient and the current railway sharing choice", () => {
  for (const flag of ["ins_none","need_pay","pay_cash","where_belly","pain_strong"]) assert.equal(shareFlag("medical_interpreter",flag,[]),false);
  assert.equal(shareFlag("medical_interpreter","need_interpreter",[]),true);
  assert.equal(shareFlag("department","need_pay",[]),false);
  assert.equal(shareFlag("railway","item_bag",[]),false);
  assert.equal(shareFlag("railway","item_bag",["share_item"]),true);
  assert.equal(shareFlag("police","item_bag",["share_item"]),false);
});

test("summary review withholds contact details, names with explicit labels and account numbers", () => {
  for (const s of ["name@example.invalid","連絡先 https://example.invalid","氏名：佐藤","山田さん","my name is Smith","カード 1111"]) assert.equal(identifyingSummary(s),true,s);
  assert.equal(identifyingSummary("お客様が状況を確認しました。"),false);
});

test("adoption names the worker only after dispatch succeeds and first-shift states reflect recorded milestones", () => {
  assert.equal(suggestionResult(null,false),DESK.reply.toast);
  assert.equal(suggestionResult("Worker",false),DESK.reply.sendOnly);
  assert.equal(suggestionResult("Worker",true),DESK.reply.bundleToast("Worker"));
  const pending = { banned:false, verified:false, totp:false,passkeys:0,delivery:null };
  assert.equal(inviteState(pending),ADMIN.status.invited);
  for (const [delivery,label] of [["invite_sent",FIRST_SHIFT.sent],["invite_failed",FIRST_SHIFT.failed]]) assert.equal(inviteState({ ...pending,delivery }),label);
  assert.equal(inviteState({ ...pending,verified:true }),FIRST_SHIFT.verified);
  assert.equal(inviteState({ ...pending,verified:true,passkeys:1 }),FIRST_SHIFT.ready);
  assert.equal(inviteState({ ...pending,verified:true,totp:true }),FIRST_SHIFT.ready);
});

test("shift destinations and Monday report labels expose sample, unanswered and freshness", () => {
  assert.deepEqual(FIRST_SHIFT.desk,{ operator:"/operator",field:"/field",manager:"/insights",admin:"/admin",auditor:"/cases" });
  assert.ok(FIRST_SHIFT.native.includes("認証アプリ"));
  const caption = shiftCaption({ since:"2026-11-15T15:00:00Z",until:"2026-11-22T15:00:00Z",as_of:"2026-11-23T00:00:00Z",funnel:{received:12},unanswered:4 });
  for (const fragment of ["2026/11/16","2026/11/22","2026/11/23","12件","4件"]) assert.ok(caption.includes(fragment),caption);
  assert.ok(PARTNER.actions.railway);
});
