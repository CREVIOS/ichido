import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { canConfirm } from "../content/caller-session.ts";
import { LANGS, MANUAL_VERSION, REPLIES, JOURNEY, allergyFacts, flagsFor, sentText } from "../content/catalogue.ts";

test("stored manuals retain historical promises and slot values in every language",() => {
  const slots = {branch:Object.fromEntries(LANGS.map(l=>[l,"West Desk"])),hours:Object.fromEntries(LANGS.map(l=>[l,"9–5"])),reference:"JR-EXAMPLE"};
  for (const [intent,r] of Object.entries(REPLIES)) for (const l of LANGS)
    assert.equal(sentText({intent,manual_version:MANUAL_VERSION,slots},l),r.text(slots)[l],intent+"."+l);
  const held = {intent:"HELD_WAIT_OR_LEAVE",slots};
  assert.match(sentText({...held,manual_version:"retained-card/v1"},"en"), /bank will contact you/);
  assert.match(sentText({...held,manual_version:MANUAL_VERSION},"en"),/Check this case here/);
  assert.equal(sentText({...held,manual_version:"unknown"},"en"),null);
});

test("need-first intake opens only the chosen details and the food card excludes unrelated facts",() => {
  const unknown = {card_back:"unknown",cash_received:"unknown",needs_clarification:false};
  assert.ok(flagsFor("card_retained").includes("need_other"));
  assert.ok(canConfirm(true,unknown,["need_other"]));
  assert.ok(!canConfirm(true,unknown,[]));
  assert.ok(!canConfirm(true,{...unknown,needs_clarification:true},["need_other"]));
  assert.ok(!flagsFor("shelter_checkin").includes("party_family"));
  assert.ok(flagsFor("shelter_checkin").includes("diet_allergy"));
  const selected = flagsFor("shelter_checkin",["diet_allergy"]);
  assert.ok(selected.includes("allergy_child") && !selected.includes("party_family"));
  assert.deepEqual(allergyFacts(["diet_allergy","allergy_child","red_hurt","helper"]),["diet_allergy","allergy_child"]);
  assert.deepEqual(allergyFacts(["allergy_me"]),[]);
  assert.ok(!flagsFor("transit_way",["need_item"]).includes("way_exit"));
  for (const value of Object.values(JOURNEY)) for (const l of LANGS) assert.ok(value[l].trim());
});

test("caller and worker transitions run in one rolled-back database fixture",async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
  const db = new pg.Client({connectionString:url.href});
  await db.connect();
  try {
    await db.query("begin");
    await db.query("set local plpgsql.check_asserts=on");
    await db.query(await readFile(new URL("./fixtures/caller-journeys.sql",import.meta.url),"utf8"));
  } finally {
    try { await db.query("rollback"); } finally { await db.end(); }
  }
});
