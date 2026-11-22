// Disaster / outage mode: setting and clearing an area, the caller's approved notice, and the nearest working
// Help Point (offline and in-area stations excluded, mobile branches included).
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { nearestWorking, metres } from "../lib/nearest.ts";
import { DISASTER_NOTICES, LANGS } from "../content/catalogue.ts";
import { caller, closeOpen, cmd, ok, openPairedCase, staff } from "./helpers.mjs";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const l10n = (s) => ({ ja: s, bn: s, en: s, vi: s, id: s, ne: s });
// Around TABLE-A (32.7522, 129.8702): ZD-NEAR-OFF is closest but offline, ZD-IN will be inside the area.
const TEST_STATIONS = [
  { id: "ZD-IN", lat: 32.7530, lng: 129.8710, kind: "atm", seen: 0 },
  { id: "ZD-NEAR-OFF", lat: 32.7540, lng: 129.8720, kind: "atm", seen: 3600 },
  { id: "ZD-MOBILE", lat: 32.7600, lng: 129.8800, kind: "mobile_branch", seen: null },
  { id: "ZD-FAR-ON", lat: 32.7800, lng: 129.9000, kind: "atm", seen: 10 },
];
const ids = TEST_STATIONS.map((s) => s.id);

test.before(async () => {
  await service.from("station").delete().in("id", ids);
  const { error } = await service.from("station").insert(TEST_STATIONS.map((s) => ({
    id: s.id, label: l10n(`test ${s.id}`), branch: l10n("test branch"), counter_hours: l10n("9:00-15:00"), security_company: "test",
    lat: s.lat, lng: s.lng, kind: s.kind,
  })));
  assert.ifError(error);
  const health = TEST_STATIONS.filter((s) => s.seen != null).map((s) => ({
    station: s.id, last_seen: new Date(Date.now() - s.seen * 1000).toISOString(), uptime_s: 1, free_heap: 1, rssi: -60, firmware: "test",
  }));
  assert.ifError((await service.from("device_health").upsert(health)).error);
});

test.after(async () => {
  const op = await staff("operator@ichido.demo");
  await cmd(op, "disaster_clear", { stations: ["TABLE-A", ...ids] });
  await service.from("station").delete().in("id", ids);
});

test("nearest working: in-area, offline and unlocated stations are left out; mobile branches count", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");
  const ago = (s) => new Date(now - s * 1000).toISOString();
  const places = [
    { id: "in", lat: 32.7525, lng: 129.8705, kind: "atm", disaster: "earthquake", last_seen: ago(5) },
    { id: "off", lat: 32.753, lng: 129.871, kind: "atm", disaster: null, last_seen: ago(600) },
    { id: "never", lat: 32.753, lng: 129.871, kind: "atm", disaster: null, last_seen: null },
    { id: "nowhere", lat: null, lng: null, kind: "atm", disaster: null, last_seen: ago(5) },
    { id: "far", lat: 32.80, lng: 129.92, kind: "atm", disaster: null, last_seen: ago(5) },
    { id: "truck", lat: 32.76, lng: 129.88, kind: "mobile_branch", disaster: null, last_seen: null },
  ];
  const got = nearestWorking({ lat: 32.7522, lng: 129.8702 }, places, now, 180);
  assert.deepEqual(got.map((g) => g.id), ["truck", "far"]);
  assert.ok(got[0].distance_m < got[1].distance_m);
  assert.equal(metres({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 111195);
});

test("every disaster notice is written in all six languages", () => {
  for (const [key, n] of Object.entries(DISASTER_NOTICES)) {
    assert.ok(n.title, key);
    for (const lang of LANGS) assert.ok(n.text[lang]?.length > 20, `${key}.${lang}`);
  }
});

test("operator sets and clears a disaster area; paired callers see the notice and where to go", async () => {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  const who = await caller();
  const incident = await openPairedCase(op, who, "vi");
  assert.deepEqual(await ok(cmd(who, "disaster_info")), { notice: null, nearby: [] });

  // Only operators and managers, only approved notices, only real stations.
  assert.equal((await cmd(who, "disaster_set", { stations: ["TABLE-A"], notice: "earthquake" })).status, 403);
  assert.equal((await cmd(await staff("guard1@ichido.demo"), "disaster_set", { stations: ["TABLE-A"], notice: "earthquake" })).status, 403);
  assert.equal((await cmd(op, "disaster_set", { stations: ["TABLE-A"], notice: "made_up" })).status, 400);
  assert.equal((await cmd(op, "disaster_set", { stations: [], notice: "earthquake" })).status, 400);
  assert.equal((await cmd(op, "disaster_set", { stations: ["TABLE-A", "NO-SUCH"], notice: "earthquake" })).status, 404);

  const set = await ok(cmd(op, "disaster_set", { stations: ["TABLE-A", "ZD-IN"], notice: "earthquake" }));
  assert.deepEqual(set.changed.sort(), ["TABLE-A", "ZD-IN"]);
  assert.deepEqual((await ok(cmd(op, "disaster_set", { stations: ["TABLE-A"], notice: "earthquake" }))).changed, []);
  const { data: rows } = await op.c.from("station").select("id, disaster, disaster_since").in("id", ["TABLE-A", "ZD-IN", "ZD-FAR-ON"]).order("id");
  assert.deepEqual(rows.map((r) => [r.id, r.disaster, Boolean(r.disaster_since)]), [["TABLE-A", "earthquake", true], ["ZD-FAR-ON", null, false], ["ZD-IN", "earthquake", true]]);

  const info = await ok(cmd(who, "disaster_info"));
  assert.equal(info.notice, "earthquake");
  const near = info.nearby.map((n) => n.id).filter((id) => ids.includes(id));
  assert.deepEqual(near, ["ZD-MOBILE", "ZD-FAR-ON"]);
  assert.ok(!info.nearby.some((n) => n.id === "TABLE-A" || n.id === "ZD-IN" || n.id === "ZD-NEAR-OFF"));
  const mobile = info.nearby.find((n) => n.id === "ZD-MOBILE");
  assert.equal(mobile.kind, "mobile_branch");
  assert.equal(mobile.hours.vi, "9:00-15:00");
  assert.equal(info.nearby.find((n) => n.id === "ZD-FAR-ON").hours, null);
  // Staff have no caller notice to read.
  assert.equal((await cmd(op, "disaster_info")).status, 403);

  // Manager can clear; the station timeline and the case timeline both record it.
  const cleared = await ok(cmd(await staff("manager@ichido.demo"), "disaster_clear", { stations: ["TABLE-A", "ZD-IN"] }));
  assert.deepEqual(cleared.changed.sort(), ["TABLE-A", "ZD-IN"]);
  assert.deepEqual(await ok(cmd(who, "disaster_info")), { notice: null, nearby: [] });
  const { data: log } = await op.c.from("disaster_event").select("kind, notice, actor_name").eq("station", "TABLE-A").order("id", { ascending: false }).limit(2);
  assert.deepEqual(log.map((e) => [e.kind, e.notice, e.actor_name]), [["left", "earthquake", "管理者"], ["entered", "earthquake", "伊藤"]]);
  const { data: events } = await op.c.from("case_event").select("kind, data").eq("incident", incident).in("kind", ["disaster_entered", "disaster_left"]).order("id");
  assert.deepEqual(events.map((e) => [e.kind, e.data.notice]), [["disaster_entered", "earthquake"], ["disaster_left", "earthquake"]]);
  // The station timeline is append-only.
  assert.ok((await service.from("disaster_event").delete().eq("station", "TABLE-A")).error);
  await closeOpen(op);
});
