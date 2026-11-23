// Feed parsing (lib/hazard.ts) on recorded bulletins in tests/fixtures:
//   jma-eqvol.xml, jma-vxse53-nagano.xml, p2p-history.json, p2p-556.json  live, fetched 2026-11-23
//   jma-vpww54-nagasaki.xml   trimmed from a live 長崎地方気象台 bulletin (2026-11-23)
//   jma-vtse41-sample.xml     JMA's official sample (jmaxml_20261118_Samples.zip, 32-39_12_02_250206_VTSE41.xml)
//   jma-vpww54-nagasaki-emergency.xml, p2p-551-nagasaki.json  CONSTRUCTED from the real formats above (no Nagasaki
//   emergency warning or shindo 4 was live when they were recorded)
// Pure: needs no server or database.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedEntries, fromJma, fromP2P, noticeFor, wantedBulletin } from "../lib/hazard.ts";
import { nearestShelters } from "../lib/nearest.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("JMA Atom feed: only earthquake, tsunami and Nagasaki warning bulletins on the JMA data host", () => {
  const urls = feedEntries(fixture("jma-eqvol.xml"));
  assert.ok(urls.length > 0);
  assert.ok(urls.every((u) => /^https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/.+_(VXSE51|VXSE53|VTSE41)_\d{6}\.xml$/.test(u)));
  assert.ok(wantedBulletin("https://www.data.jma.go.jp/developer/xml/data/x_0_VPWW54_420000.xml"));
  assert.ok(!wantedBulletin("https://www.data.jma.go.jp/developer/xml/data/x_0_VPWW54_130000.xml"));
  assert.ok(!wantedBulletin("https://www.data.jma.go.jp/developer/xml/data/x_0_VFVO53_010000.xml"));
});

test("bulletins outside Nagasaki or below the threshold give no alert", () => {
  assert.equal(fromJma("nagano", fixture("jma-vxse53-nagano.xml")), null);
  assert.equal(fromJma("advisory", fixture("jma-vpww54-nagasaki.xml")), null);
  assert.deepEqual(fromP2P(JSON.parse(fixture("p2p-history.json"))), []);
  assert.deepEqual(fromP2P(JSON.parse(fixture("p2p-556.json"))), []);
  assert.deepEqual(fromP2P("not a list"), []);
  assert.deepEqual(fromP2P([null, 1, { code: 551, id: "x", cancelled: true }]), []);
});

test("JMA tsunami warning for 長崎県西方 (official sample)", () => {
  // JMA marks its samples as training (訓練), which never counts; read as a normal bulletin it is a warning.
  assert.equal(fromJma("vtse41", fixture("jma-vtse41-sample.xml")), null);
  const a = fromJma("vtse41", fixture("jma-vtse41-sample.xml").replace("<Status>訓練</Status>", "<Status>通常</Status>"));
  assert.equal(a.kind, "tsunami");
  assert.equal(a.severity, "warning");
  // 有明・八代海 and 長崎県西方 have a warning, 壱岐・対馬 an advisory; the alert carries the highest grade.
  assert.deepEqual(a.areas, ["tsunami:有明・八代海", "tsunami:長崎県西方", "tsunami:壱岐・対馬"]);
  assert.equal(Date.parse(a.expires_at) - Date.parse(a.issued_at), 6 * 3600_000);
  assert.equal(noticeFor(a), "tsunami_warning");
});

test("JMA emergency warning for 長崎市; a lifted one is ignored", () => {
  const a = fromJma("vpww54", fixture("jma-vpww54-nagasaki-emergency.xml"));
  assert.deepEqual({ kind: a.kind, severity: a.severity, areas: a.areas }, { kind: "warning", severity: "emergency", areas: ["city:長崎市"] });
  assert.equal(noticeFor(a), "typhoon");
  // Training and test bulletins never count.
  assert.equal(fromJma("t", fixture("jma-vpww54-nagasaki-emergency.xml").replace("<Status>通常</Status>", "<Status>訓練</Status>")), null);
});

test("P2PQuake shindo 5- in Nagasaki: prefecture and cities that reached 4", () => {
  const [a] = fromP2P(JSON.parse(fixture("p2p-551-nagasaki.json")));
  assert.equal(a.source, "p2pquake");
  assert.equal(a.kind, "earthquake");
  assert.equal(a.severity, "5-");
  assert.deepEqual(a.areas.sort(), ["city:時津町", "city:長崎市", "pref:長崎県"]);
  assert.equal(a.issued_at, "2026-11-23T05:17:20.000Z");
  assert.equal(noticeFor(a), "earthquake");
});

test("P2PQuake EEW and tsunami in Nagasaki areas", () => {
  const eew = JSON.parse(fixture("p2p-556.json"));
  eew[0].areas[0] = { ...eew[0].areas[0], name: "長崎県南西部", pref: "長崎", scaleFrom: 45 };
  const [e] = fromP2P(eew);
  assert.deepEqual({ kind: e.kind, severity: e.severity, areas: e.areas }, { kind: "eew", severity: "5-", areas: ["pref:長崎県", "eq:長崎県南西部"] });
  const [t] = fromP2P([{ code: 552, id: "t1", cancelled: false, issue: { time: "2026/11/23 14:20:00" },
    areas: [{ grade: "Watch", name: "長崎県西方" }, { grade: "Warning", name: "壱岐・対馬" }, { grade: "MajorWarning", name: "高知県" }] }]);
  assert.deepEqual({ severity: t.severity, areas: t.areas }, { severity: "warning", areas: ["tsunami:長崎県西方", "tsunami:壱岐・対馬"] });
});

test("nearest designated sites support the hazard and come nearest first", () => {
  const sites = [
    { id: "a", name: "A", lat: 32.76, lng: 129.87, hazards: ["earthquake"] },
    { id: "b", name: "B", lat: 32.753, lng: 129.871, hazards: ["tsunami", "earthquake"] },
    { id: "c", name: "C", lat: 32.7525, lng: 129.8705, hazards: ["flood"] },
    { id: "d", name: "D", lat: 33.5, lng: 130.4, hazards: ["tsunami"] },
  ];
  assert.deepEqual(nearestShelters(32.7522, 129.8702, "earthquake", sites).map((s) => s.id), ["b", "a"]);
  assert.deepEqual(nearestShelters(32.7522, 129.8702, "tsunami", sites, 1).map((s) => s.id), ["b"]);
  assert.ok(nearestShelters(32.7522, 129.8702, "tsunami", sites)[0].distance_m < 200);
  assert.deepEqual(nearestShelters(32.7522, 129.8702, "volcano", sites), []);
});
