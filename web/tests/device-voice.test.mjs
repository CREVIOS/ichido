// Device voice (lib/device-voice.ts, supabase/migrations/20261126000000_device_voice.sql): an operator starts AI voice
// intake on the Help Point for an unclaimed AI case; the device joins as the case's caller and confirms with its button.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { APP, closeOpen, cmd, deviceHeaders, newKey, ok, staff } from "./helpers.mjs";
import { frontlineCase } from "./frontline-fixture.mjs";
import { STUB } from "./ai-stub.mjs";
import { FRONTLINE } from "../content/frontline.ts";
import { CALLER_FLAGS, CONTENT_PACKS, packTaps, situationsOf } from "../content/catalogue.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const stubUp = await fetch(`${STUB}/__stub/log`).then((r) => r.ok, () => false);
const aiSkip = stubUp && process.env.OPENAI_BASE_URL?.startsWith(STUB) ? false : "start tests/ai-stub.mjs and the server with its base URLs";
const script = (key, value) => fetch(`${STUB}/__stub/script`, { method: "POST", body: JSON.stringify({ key, value }) });

const press = (key, headers = {}) =>
  fetch(APP + "/api/device", { method: "POST", headers: { ...deviceHeaders(), "x-display": "1", ...headers }, body: key });
const poll = async () => (await fetch(APP + "/api/device", { headers: { ...deviceHeaders(), "x-display": "1" } })).text();
const voiceToken = (headers = deviceHeaders()) => fetch(APP + "/api/device/voice", { method: "POST", headers });
const binding = async (incident) =>
  (await admin.schema("ichido").from("binding").select("uid,device,voice_room,frontline_started").eq("incident", incident).maybeSingle().throwOnError()).data;

// The worker's own request signature (agent/app.py wire_frontline), for a voice lease the test starts itself.
async function agentFor(incident, lang = "en") {
  const b = await binding(incident);
  const { data: lease } = await admin.rpc("voice_begin", { p_uid: b.uid, p_generation: b.voice_room, p_lang: lang }).throwOnError();
  const scope = { ...lease, lang, uid: b.uid, generation: b.voice_room, incident, job: "local-job" };
  const post = async (body) => {
    const raw = JSON.stringify({ scope, ...body });
    const issued = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", process.env.AGENT_BRIDGE_SECRET).update(`ichido-job/1\n${issued}\n${raw}`).digest("hex");
    const r = await fetch(APP + "/api/livekit/frontline", { method: "POST", headers: { "x-issued": issued, "x-job-signature": sig }, body: raw });
    return { status: r.status, body: await r.json() };
  };
  return { scope, post, binding: b };
}

// A press on TABLE-A (the only station with a local device secret) opens an AI case with a display code.
async function deviceCase(t) {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  t.after(() => closeOpen(op));
  assert.equal((await press(newKey())).status, 204);
  const { data: d } = await admin.from("desk").select("id,handler").eq("station", "TABLE-A").is("finished_at", null).single().throwOnError();
  assert.equal(d.handler, "ai", "a display press opens an AI case");
  return { op, incident: d.id };
}

test("the device voice route refuses a device without valid credentials", async () => {
  for (const headers of [deviceHeaders("wrong"), deviceHeaders(""), { ...deviceHeaders(), "x-station": "NO-SUCH-STATION" }]) {
    assert.equal((await voiceToken(headers)).status, 401);
  }
});

test("an operator starts device voice: the Help Point is told to join, the phone code goes, and it holds the caller session", async (t) => {
  const { op, incident } = await deviceCase(t);
  assert.match(await poll(), /\ncode=/, "a phone could pair until device voice starts");
  assert.equal((await voiceToken()).status, 404, "no device session yet");

  await ok(cmd(op, "device_voice", { incident, lang: "en" }));
  const lines = await poll();
  assert.match(lines, /\nvoice=1/);
  assert.doesNotMatch(lines, /\ncode=/, "the device took the case: no pairing code on its display");
  const { data: d } = await admin.from("desk").select("handler,lang,operator_id,device_voice").eq("id", incident).single().throwOnError();
  assert.deepEqual([d.handler, d.lang, d.operator_id, d.device_voice], ["ai", "en", null, true], "still an unclaimed AI case");
  const b = await binding(incident);
  assert.equal(b.device, "TABLE-A");
  assert.ok(b.frontline_started, "the front line has started, as for a phone that chose voice");
  const { data: turns } = await admin.from("frontline_turn").select("speaker,wording").eq("incident", incident).throwOnError();
  assert.ok(turns.some((x) => x.speaker === "ai" && x.wording === "greeting"), "the AI greets the device user");

  assert.equal((await cmd(op, "device_voice", { incident, lang: "en" })).status, 409, "one caller per case");
  const grant = await voiceToken();
  assert.ok([200, 503].includes(grant.status), `token or voice not configured here (${grant.status})`);
  if (grant.status === 200) {
    const g = await grant.json();
    const claims = JSON.parse(Buffer.from(g.token.split(".")[1], "base64url").toString());
    assert.equal(claims.sub, `c-${b.uid}`, "the device joins as the case's caller");
    assert.equal(claims.video.room, `case-${b.voice_room}`);
    assert.ok(g.ttl > 0 && g.ttl <= 600);
  }

  await ok(cmd(op, "device_voice_stop", { incident }));
  assert.doesNotMatch(await poll(), /\nvoice=1/);
  assert.equal(await binding(incident), null);
  assert.equal((await voiceToken()).status, 404);
});

test("device voice needs a voice language and an unclaimed AI case", async (t) => {
  const { op, incident } = await deviceCase(t);
  assert.equal((await cmd(op, "device_voice", { incident, lang: "ne" })).status, 400, "Nepali has no speech recognition");
  assert.equal((await cmd(op, "device_voice", { incident: "not-a-case", lang: "en" })).status, 400);
  await ok(cmd(op, "claim", { incident }));
  assert.equal((await cmd(op, "device_voice", { incident, lang: "en" })).status, 409, "a claimed case is the operator's");
});

test("the button confirms the spoken read-back; the AI hands the ATM case to a person and the agent's poll says it once", { skip: aiSkip }, async (t) => {
  const { op, incident } = await deviceCase(t);
  await ok(cmd(op, "device_voice", { incident, lang: "en" }));
  const agent = await agentFor(incident);

  assert.equal((await press(newKey(), { "x-action": "confirm" })).status, 409, "nothing to confirm before a read-back");
  await script("patch", { card_back: "yes", cash_received: "unchanged", clarify: false });
  const turn = await agent.post({ action: "turn", request_id: randomUUID(), text: "The machine kept my card" });
  assert.equal(turn.status, 200, JSON.stringify(turn.body));
  assert.ok(turn.body.say?.text.endsWith(FRONTLINE.readbackDevice.en), "the device read-back asks for the button");

  const key = newKey();
  assert.equal((await press(key, { "x-action": "confirm" })).status, 204);
  assert.equal((await press(key, { "x-action": "confirm" })).status, 204, "a retried press is a replay");
  const { data: d } = await admin.from("desk").select("handler,confirmed_rev").eq("id", incident).single().throwOnError();
  assert.notEqual(d.confirmed_rev, null);
  assert.notEqual(d.handler, "ai", "a confirmed ATM case goes to a person");

  const said = await agent.post({ action: "state" });
  assert.equal(said.status, 200, JSON.stringify(said.body));
  assert.equal(said.body.final, true);
  assert.ok(said.body.say.text.includes(FRONTLINE.queued.en), "the device user hears that a person will join");
  assert.equal((await agent.post({ action: "state" })).status, 403, "only once; then the lease is over");
});

test("a pack case confirmed on the device takes the AI's suggested taps of that revision", { skip: aiSkip }, async (t) => {
  const f = await frontlineCase(t, "en", "shelter", { pair: false });
  await ok(cmd(f.op, "device_voice", { incident: f.incident, lang: "en" }));
  const agent = await agentFor(f.incident);
  const pack = CONTENT_PACKS.find((p) => p.id === "shelter");
  const tap = packTaps(pack).find((x) => !CALLER_FLAGS[x].urgent && !CALLER_FLAGS[x].group && x !== "need_other");
  await script("triage", { situation: situationsOf("shelter")[0], taps: [tap], ask: [], clarify: false });
  const turn = await agent.post({ action: "turn", request_id: randomUUID(), text: "I need help here" });
  assert.equal(turn.status, 200, JSON.stringify(turn.body));
  const { data: dr } = await admin.from("draft").select("rev,triage").eq("incident", f.incident).single().throwOnError();
  assert.deepEqual(dr.triage.taps, [tap]);

  const accept = (flags, rev = dr.rev) => admin.rpc("device_accept_triage", { p_uid: agent.binding.uid, p_rev: rev, p_flags: flags });
  assert.equal((await accept(["need_other"])).error?.message, "forbidden", "only the AI's suggestions");
  assert.equal((await accept([tap], dr.rev - 1)).error?.message, "conflict", "only the revision just read back");
  assert.equal((await accept([tap])).error, null);
  const { data: card } = await admin.from("caller_card").select("flags").eq("id", f.incident).single().throwOnError();
  assert.deepEqual(card.flags, [tap]);
});
