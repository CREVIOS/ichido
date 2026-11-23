// Automatic disaster intelligence end to end: an official alert for a Nagasaki area becomes exactly one disaster
// PROPOSAL (never a change for callers), re-ingesting dedupes, an operator confirms it through the existing
// cmd_disaster path, callers at the affected station then see the approved notice in their language and the nearest
// designated evacuation sites; dismissing and expiry work; only staff with stations:disaster decide; callers cannot
// read alerts, proposals or the site table. The alert is tests/fixtures/p2p-551-nagasaki.json (lib/hazard.ts parses it),
// re-timed to now so it has not expired.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fromP2P, noticeFor } from "../lib/hazard.ts";
import { DISASTER_NOTICES } from "../content/catalogue.ts";
import { JMA_TERMS } from "../content/jma-terms.ts";
import { APP, caller, closeOpen, cmd, ok, openPairedCase, staff } from "./helpers.mjs";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const run = `t${Date.now().toString(36)}`;
const SITE = { id: `ZTEST-${run}`, name: "テスト避難場所", lat: 32.7523, lng: 129.8703, hazards: ["earthquake"], designated_shelter: true, source: "test" };
const jstNow = (ms = 0) => new Date(Date.now() + ms + 9 * 3600_000).toISOString().slice(0, 19).replace("T", " ").replaceAll("-", "/");

// The fixture, re-timed and given a fresh id, parsed by the feed parser.
function quake(id) {
  const [item] = JSON.parse(readFileSync(new URL("./fixtures/p2p-551-nagasaki.json", import.meta.url), "utf8"));
  const [a] = fromP2P([{ ...item, id, issue: { ...item.issue, time: jstNow() } }]);
  return a;
}
const ingest = async (a) => {
  const { data, error } = await service.rpc("ingest_hazard", {
    p_source: a.source, p_source_id: a.source_id, p_kind: a.kind, p_severity: a.severity, p_areas: a.areas,
    p_issued: a.issued_at, p_expires: a.expires_at, p_notice: noticeFor(a),
  });
  assert.ifError(error);
  return data;
};
// Proposals left over from earlier runs would hold back the stations; expire them.
const expireAll = () => service.from("disaster_proposal").update({ expires_at: new Date().toISOString() }).gt("expires_at", new Date().toISOString());

test.before(async () => {
  assert.ifError((await expireAll()).error);
  assert.ifError((await service.rpc("expire_disaster_proposals")).error);
  assert.ifError((await service.from("shelter_site").insert(SITE)).error);
  const op = await staff("operator@ichido.demo");
  await cmd(op, "disaster_clear", { stations: ["TABLE-A"] });
});

test.after(async () => {
  const op = await staff("operator@ichido.demo");
  await cmd(op, "disaster_clear", { stations: ["TABLE-A"] });
  await closeOpen(op);
  await expireAll();
  await service.rpc("expire_disaster_proposals");
  await service.from("shelter_site").delete().eq("id", SITE.id);
  await service.schema("ichido").from("hazard_alert").delete().like("source_id", `${run}%`);
});

test("cron route refuses requests without the CRON_SECRET bearer", async () => {
  assert.equal((await fetch(`${APP}/api/cron/disaster`)).status, 401);
  assert.equal((await fetch(`${APP}/api/cron/disaster`, { headers: { authorization: "Bearer wrong" } })).status, 401);
});

test("a Nagasaki alert proposes; confirm sets disaster mode; callers see the notice and nearest sites", async () => {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  const who = await caller();
  const incident = await openPairedCase(op, who, "vi");

  // 1. Ingest: one alert, one proposal for the ATM stations in the area; nothing changes for the caller yet.
  const first = await ingest(quake(`${run}-551`));
  assert.ok(first.alert && first.proposal, JSON.stringify(first));
  assert.ok(first.stations.includes("TABLE-A"));
  const { data: atms } = await service.from("station").select("id, kind").in("id", first.stations);
  assert.ok(atms.every((s) => s.kind === "atm"), "only ATMs are proposed");
  assert.deepEqual(await ingest(quake(`${run}-551`)), { alert: null, proposal: null }, "re-ingesting the same bulletin dedupes");
  // A second bulletin for the same event (e.g. JMA after P2PQuake) joins the pending proposal instead of a new one.
  const second = await ingest(quake(`${run}-551b`));
  assert.equal(second.proposal, first.proposal);
  const { data: mine } = await service.from("disaster_proposal").select("id, status, notice, alerts").gt("expires_at", new Date().toISOString()).eq("status", "pending");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].notice, "earthquake");
  assert.deepEqual(mine[0].alerts, [first.alert, second.alert]);
  assert.deepEqual(await ok(cmd(who, "disaster_info")), { notice: null, nearby: [] });
  assert.deepEqual((await who.c.rpc("caller_shelters")).data, []);

  // 2. Reading: staff who decide see alerts and proposals; callers see neither, nor the site table.
  const { data: seen } = await op.c.from("disaster_proposal").select("id, stations").eq("id", first.proposal);
  assert.equal(seen.length, 1);
  assert.equal((await op.c.schema("ichido").from("hazard_alert").select("id").eq("id", first.alert)).data.length, 1);
  const hidden = await who.c.schema("ichido").from("hazard_alert").select("id");
  assert.ok(hidden.error || hidden.data.length === 0, "callers cannot read hazard alerts");
  assert.deepEqual((await who.c.from("disaster_proposal").select("id")).data, []);
  assert.deepEqual((await who.c.from("shelter_site").select("id").limit(1)).data, []);
  const guard = await staff("guard1@ichido.demo");
  assert.deepEqual((await guard.c.from("disaster_proposal").select("id")).data, []);

  // 3. Only staff with stations:disaster decide.
  assert.equal((await cmd(who, "disaster_proposal_confirm", { proposal: first.proposal })).status, 403);
  assert.equal((await cmd(guard, "disaster_proposal_confirm", { proposal: first.proposal })).status, 403);
  assert.equal((await cmd(await staff("auditor@ichido.demo"), "disaster_proposal_confirm", { proposal: first.proposal })).status, 403);
  assert.equal((await cmd(op, "disaster_proposal_confirm", { proposal: "1; drop" })).status, 400);
  assert.equal((await cmd(op, "disaster_proposal_confirm", { proposal: 2 ** 40 })).status, 404);

  // 4. Confirm: the same path as disaster_set (station event and case timeline), once.
  const { changed } = await ok(cmd(op, "disaster_proposal_confirm", { proposal: first.proposal }));
  assert.ok(changed.includes("TABLE-A"));
  assert.equal((await cmd(op, "disaster_proposal_confirm", { proposal: first.proposal })).status, 409);
  const { data: st } = await op.c.from("station").select("disaster").eq("id", "TABLE-A").single();
  assert.equal(st.disaster, "earthquake");
  const { data: ev } = await op.c.from("disaster_event").select("kind, notice, actor_name").eq("station", "TABLE-A").order("id", { ascending: false }).limit(1);
  assert.deepEqual(ev[0], { kind: "entered", notice: "earthquake", actor_name: "伊藤" });
  const { data: ce } = await op.c.from("case_event").select("kind").eq("incident", incident).eq("kind", "disaster_entered");
  assert.equal(ce.length, 1);
  const { data: decided } = await op.c.from("disaster_proposal").select("status, decided_by").eq("id", first.proposal).single();
  assert.deepEqual(decided, { status: "confirmed", decided_by: "伊藤" });

  // 5. The caller sees the approved notice (its Vietnamese opens with JMA's official term) and the nearest sites.
  const info = await ok(cmd(who, "disaster_info"));
  assert.equal(info.notice, "earthquake");
  assert.ok(DISASTER_NOTICES.earthquake.text.vi.startsWith(JMA_TERMS.earthquake.vi));
  const { data: sites, error } = await who.c.rpc("caller_shelters", { p_limit: 3 });
  assert.ifError(error);
  assert.equal(sites[0].name, SITE.name);
  assert.ok(sites[0].distance_m < 50);
  assert.deepEqual(Object.keys(sites[0]).sort(), ["address", "designated_shelter", "distance_m", "name"]);
  assert.ok(sites.every((s, i) => i === 0 || s.distance_m >= sites[i - 1].distance_m));
  // Another phone, not paired here, gets nothing.
  assert.deepEqual((await (await caller()).c.rpc("caller_shelters")).data, []);
});

test("dismiss keeps stations as they are and holds back repeats; expired proposals cannot be decided", async () => {
  const manager = await staff("manager@ichido.demo");
  const tsunami = (id) => fromP2P([{ code: 552, id, cancelled: false, issue: { time: jstNow() }, areas: [{ grade: "Watch", name: "長崎県西方" }] }])[0];
  const p = await ingest(tsunami(`${run}-552`));
  assert.ok(p.proposal && p.stations.includes("TABLE-A"));
  const { data: row } = await manager.c.from("disaster_proposal").select("notice").eq("id", p.proposal).single();
  assert.equal(row.notice, "tsunami_advisory");
  assert.deepEqual(await ok(cmd(manager, "disaster_proposal_dismiss", { proposal: p.proposal })), { changed: [] });
  const { data: st } = await manager.c.from("station").select("disaster").eq("id", "TABLE-A").single();
  assert.notEqual(st.disaster, "tsunami_advisory");
  // A follow-up bulletin for the same hazard does not bring back what a person just dismissed.
  const again = await ingest(tsunami(`${run}-552b`));
  assert.ok(again.alert);
  assert.equal(again.proposal, null);

  // Expiry: the cron housekeeping marks it, and it can no longer be confirmed.
  // TABLE-A already shows the earthquake notice, so a new quake proposes nothing for it until it is cleared.
  assert.equal((await ingest(quake(`${run}-551c`))).proposal, null);
  const op = await staff("operator@ichido.demo");
  await ok(cmd(op, "disaster_clear", { stations: ["TABLE-A"] }));
  const id = (await ingest(quake(`${run}-551d`))).proposal;
  assert.ok(id);
  await service.from("disaster_proposal").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
  assert.ok((await service.rpc("expire_disaster_proposals")).data >= 1);
  const { data: gone } = await op.c.from("disaster_proposal").select("status").eq("id", id).single();
  assert.equal(gone.status, "expired");
  assert.equal((await cmd(op, "disaster_proposal_confirm", { proposal: id })).status, 409);
});
