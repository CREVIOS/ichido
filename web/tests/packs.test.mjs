// Scenario packs (content/packs, migration 20261123160000_packs.sql): a hospital, city office, station and shelter
// Help Point run the same case flow with their own situations, taps and approved replies, and the database refuses
// a reply or situation from another pack. Uses the seeded fictional stations HOSP-A, CITY-A, RAIL-A and SHELTER-A.
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { APP, staff, caller, cmd, ok } from "./helpers.mjs";
import {
  CALLER_FLAGS, PARTNER, CONTENT_PACKS, FAULTS, LANGS, PACKS, REPLIES, REPLY_RULES, callerPack, defaultSituation, flagsFor, intentsOf, packOfFault, replyBlock, replyOf, situationsOf,
} from "../content/catalogue.ts";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sorted = (xs) => (xs ? [...xs].sort() : null);
const STATION = { hospital: "HOSP-A", city_office: "CITY-A", transit: "RAIL-A", shelter: "SHELTER-A" };
// For each pack: a tap that fits its default situation, and a reply that the tap makes eligible.
const PATH = {
  hospital: { tap: "need_first_visit", reply: "HOSP_FIRST_VISIT", recipient: "medical_interpreter" },
  city_office: { tap: "letter_tax", reply: "CITY_LETTER", recipient: "city_section" },
  transit: { tap: "way_platform", reply: "TRANSIT_GUIDE", recipient: "railway" },
  shelter: { tap: "party_family", reply: "SHELTER_CHECKIN", recipient: "disaster_hq" },
};

// Close any open case at a pack station so the test starts with a free station.
async function freeStation(op, station) {
  const { data } = await op.c.from("desk").select("id, operator_id").eq("station", station).is("finished_at", null);
  for (const d of data ?? []) {
    if (!d.operator_id) await ok(cmd(op, "claim", { incident: d.id }));
    else if (d.operator_id !== op.uid) await ok(cmd(op, "takeover", { incident: d.id }));
    await cmd(op, "abandon", { incident: d.id });
  }
}

// A Help Point press at the station (the simulator, which uses the station's own default situation), claimed and paired.
async function openAt(op, who, station, lang = "en") {
  await freeStation(op, station);
  const { incident } = await ok(cmd(op, "simulate", { station }));
  await ok(cmd(op, "claim", { incident }));
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  await ok(cmd(who, "pair", { station, code, lang }));
  return incident;
}

test("every pack's situations and reply rules are the database's, in six languages, with no number requests", async () => {
  const db = service().schema("ichido");
  const { data: sit, error } = await db.from("situation").select("code, pack");
  assert.ifError(error);
  assert.deepEqual(Object.fromEntries(sit.map((s) => [s.code, s.pack])), Object.fromEntries(Object.keys(FAULTS).map((f) => [f, packOfFault(f)])));
  const { data: rules } = await db.from("reply_rule").select("*");
  assert.deepEqual(rules.filter((r) => r.autonomous).map((r) => r.intent), ["SHELTER_INFO"]);
  assert.deepEqual(Object.keys(REPLY_RULES).filter((intent) => REPLY_RULES[intent].autonomous), ["SHELTER_INFO"]);
  const row = (pack, faults, needs, blocked) => [pack, sorted(faults), sorted(needs), sorted(blocked)];
  assert.deepEqual(Object.fromEntries(rules.map((r) => [r.intent, row(r.pack, r.faults, r.needs_flags, r.blocked_by)])),
    Object.fromEntries(Object.entries(REPLY_RULES).map(([k, r]) => [k, row(r.pack ?? "atm", r.faults, r.needsFlags, r.blockedBy)])));
  assert.deepEqual(Object.keys(REPLIES).sort(), Object.keys(REPLY_RULES).sort(), "every reply has a rule");
  const slots = { branch: Object.fromEntries(LANGS.map((l) => [l, "desk"])), hours: Object.fromEntries(LANGS.map((l) => [l, "9-16"])) };
  for (const p of CONTENT_PACKS) {
    for (const intent of intentsOf(p.id)) {
      const text = REPLIES[intent].text(slots);
      for (const l of LANGS) assert.ok(text[l]?.length > 10, `${intent}.${l}`);
      assert.doesNotMatch(text.en, /diagnos(e|is) (is|you)|you have [a-z]+ (disease|illness)|tell (us|me) your .*number|enter your .*number/i, intent);
    }
    for (const l of LANGS) assert.ok(callerPack(p.device).neverAsk[l].length > 10, `${p.id} neverAsk.${l}`);
  }
});

for (const p of CONTENT_PACKS) {
  test(`${p.id}: a case opens with the pack's situation, the caller pairs, taps and confirms, and only the pack's replies are sent`, async () => {
    const op = await staff("operator@ichido.demo");
    const who = await caller();
    const station = STATION[p.id];
    const path = PATH[p.id];
    const incident = await openAt(op, who, station);
    const { data: card } = await who.c.from("caller_card").select("fault, station").eq("id", incident).single();
    assert.equal(card.fault, defaultSituation(p.kinds[0]));
    assert.equal(packOfFault(card.fault), p.id);
    const need = Object.keys(p.taps).find(f => p.taps[f].suggests === card.fault);
    assert.ok(flagsFor(card.fault, [need]).includes(path.tap), "the caller sees the pack's own taps");

    // The ATM's facts and taps are not this pack's; confirming needs at least one tap.
    assert.equal((await cmd(who, "draft", { base_rev: 0, card_back: "no" })).status, 400);
    assert.equal((await cmd(who, "flag", { flag: "forgot_card", on: true })).status, 400);
    assert.equal((await cmd(who, "confirm", { rev: 0 })).status, 409, "nothing tapped yet");
    await ok(cmd(who, "flag", { flag: path.tap, on: true }));
    await ok(cmd(who, "confirm", { rev: 0 }));

    // The database refuses an ATM reply, another pack's reply and an ATM situation for this station.
    const other = CONTENT_PACKS.find((x) => x.id !== p.id);
    for (const intent of ["HANDSET", "HELD_WAIT_OR_LEAVE", intentsOf(other.id)[0]]) {
      assert.equal((await cmd(op, "send", { incident, intent })).status, 409, intent);
    }
    assert.equal((await cmd(op, "set_fault", { incident, fault: "card_forgotten" })).status, 400, "a situation from another pack");
    assert.equal((await cmd(op, "set_fault", { incident, fault: situationsOf(other.id)[0] })).status, 400);
    await ok(cmd(op, "send", { incident, intent: path.reply }));
    const { data: shown } = await who.c.from("caller_card").select("reply_id").eq("id", incident).single();
    const { data: r } = await who.c.from("reply").select("intent").eq("id", shown.reply_id).single();
    assert.equal(r.intent, path.reply);
    assert.ok(replyOf(r.intent).text({}).ja.length > 10);

    // Hand-off only to the pack's own recipients; the record names the pack.
    assert.equal((await cmd(op, "handoff_create", { incident, recipient: "bank" })).status, 400);
    if (p.id === "hospital") {
      await ok(cmd(who,"flag",{ flag:"need_pay",on:true }));
      await ok(cmd(who,"flag",{ flag:"need_interpreter",on:true }));
      const { rows } = await ok(cmd(op,"handoff_preview",{ incident,recipient:path.recipient }));
      assert.ok(rows.some(([label,value]) => label === PARTNER.tentative && value.includes(CALLER_FLAGS.need_interpreter.staff)));
      assert.ok(!JSON.stringify(rows).includes(CALLER_FLAGS.need_pay.staff));
      assert.deepEqual((await ok(cmd(op,"handoff_list",{ incident }))).links,[],"a preview issues no link");
    }
    const { path: link } = await ok(cmd(op, "handoff_create", { incident, recipient: path.recipient }));
    const page = await (await fetch(`${APP}${link}`)).text();
    assert.ok(page.includes(PACKS[p.id].name.staff), "the hand-off record names the pack");
    await ok(cmd(op, "abandon", { incident }));
  });
}

test("hospital: a red-flag tap makes only the urgent 'tell the staff now / call 119' reply eligible", async () => {
  const op = await staff("operator@ichido.demo");
  const who = await caller();
  const incident = await openAt(op, who, "HOSP-A", "bn");
  await ok(cmd(who, "flag", { flag: "need_explain", on: true }));
  await ok(cmd(who, "confirm", { rev: 0 }));
  await ok(cmd(op, "set_fault", { incident, fault: "hosp_symptoms" }));
  // The caller's taps show who / where / since / pain once they point to their symptoms; none of them is a diagnosis.
  assert.ok(["who_child", "where_belly", "since_today", "pain_strong"].every((t) => flagsFor("hosp_first_visit", ["need_explain"]).includes(t)));
  await ok(cmd(op, "send", { incident, intent: "HOSP_WHERE" }));

  await ok(cmd(who, "flag", { flag: "red_chest", on: true }));
  const ctx = { fault: "hosp_symptoms", flags: ["need_explain", "red_chest"], confirmed: true, card_back: "unknown", remote_release: null };
  assert.equal(replyBlock("HOSP_URGENT", undefined, ctx), null, "eligible in the catalogue");
  for (const intent of intentsOf("hospital").filter((k) => k !== "HOSP_URGENT")) assert.notEqual(replyBlock(intent, undefined, ctx), null, intent);
  assert.equal(replyBlock("HOSP_WHERE", undefined, ctx), "flag", "the department reply waits for the red flag");
  const { data: card } = await who.c.from("caller_card").select("reply_id").eq("id", incident).single();
  assert.equal(card.reply_id, null, "the calm reply left the caller's screen when the red flag was tapped");
  assert.equal((await cmd(op, "send", { incident, intent: "HOSP_WHERE" })).status, 409, "refused by the database while the red flag is on");
  await ok(cmd(op, "send", { incident, intent: "HOSP_URGENT" }));
  const text = replyOf("HOSP_URGENT").text({});
  assert.match(text.en, /119/);
  assert.match(text.ja, /119/);
  await ok(cmd(op, "abandon", { incident }));
});

test("a pack caller's typed ID, insurance or residence-card number is withheld before it is stored", async () => {
  const op = await staff("operator@ichido.demo");
  const who = await caller();
  const incident = await openAt(op, who, "CITY-A", "ja");
  for (const text of ["在留カード AB1234567CD", "保険証の 記号12 番号345", "my number is 1234 5678 9012", "My insurance no 1 2 3"]) {
    const r = await ok(cmd(who, "draft", { base_rev: 0, text }));
    assert.equal(r.withheld, true, text);
  }
  const { data: d } = await service().from("draft").select("rev, words").eq("incident", incident).single();
  assert.deepEqual(d, { rev: 0, words: null }, "nothing was stored");
  await ok(cmd(who, "draft", { base_rev: 0, text: "My child is 3 and has had a cough since yesterday" }));
  await ok(cmd(op, "abandon", { incident }));
});

test("insights count cases by pack, for staff only", async () => {
  const op = await staff("operator@ichido.demo");
  const who = await caller();
  const incident = await openAt(op, who, "SHELTER-A");
  await ok(cmd(op, "abandon", { incident }));
  const { data, error } = await op.c.rpc("insights_packs", { p_days: 7 });
  assert.ifError(error);
  assert.ok(data.shelter.received >= 1 && data.hospital.received >= 1, JSON.stringify(data));
  const guard = await staff("guard1@ichido.demo");
  assert.ok((await guard.c.rpc("insights_packs", { p_days: 7 })).error, "guards are refused");
  assert.ok((await who.c.rpc("insights_packs", { p_days: 7 })).error, "callers are refused");
});
