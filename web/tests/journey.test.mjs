// End-to-end check against a running app + local Supabase:
//   APP=http://localhost:3123 node --env-file=.env.local --test tests/
// Drives the whole typed journey with real sign-ins and checks that each role sees only its own data.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP ?? "http://localhost:3123";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const client = () => createClient(URL_, KEY, { auth: { persistSession: false } });

async function staff(email) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password: "ichido-demo" });
  assert.ifError(error);
  return { c, token: data.session.access_token, uid: data.user.id };
}
async function caller() {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  assert.ifError(error);
  return { c, token: data.session.access_token };
}
async function cmd(who, name, body = {}) {
  const res = await fetch(`${APP}/api/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${who.token}` },
    body: JSON.stringify({ cmd: name, ...body }),
  });
  return { status: res.status, body: await res.json() };
}
const ok = async (p) => { const r = await p; assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

test("typed journey: alert → corrected report → approved reply → guard → teach-back", async () => {
  const op = await staff("operator@ichido.demo");
  const g1 = await staff("guard1@ichido.demo");
  const g2 = await staff("guard2@ichido.demo");
  const a = await caller();
  const b = await caller();

  // Device alert is idempotent: the same event id twice gives one case.
  const key = randomBytes(16).toString("hex");
  const dev = (k) => fetch(`${APP}/api/device`, { method: "POST", headers: { "x-station": "TABLE-A", authorization: "Bearer local-device-secret" }, body: k });
  assert.equal((await dev(key)).status, 204);
  assert.equal((await dev(key)).status, 204);
  assert.equal((await fetch(`${APP}/api/device`, { method: "POST", headers: { "x-station": "TABLE-A", authorization: "Bearer wrong" }, body: key })).status, 401);
  const { data: open } = await op.c.from("desk").select("id, fault").is("finished_at", null);
  assert.equal(open[0]?.fault, "card_retained");
  assert.equal(open.length, 1);
  const incident = open[0].id;

  await ok(cmd(op, "claim", { incident }));
  await ok(cmd(op, "remote_release", { incident, result: "failed" }));

  // Pairing: wrong code fails; the right code works once; a second phone cannot reuse it.
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  assert.equal((await cmd(a, "pair", { station: "TABLE-A", code: "AAAAAA", lang: "bn" })).status, 403);
  await ok(cmd(a, "pair", { station: "TABLE-A", code, lang: "bn" }));
  assert.equal((await cmd(b, "pair", { station: "TABLE-A", code, lang: "bn" })).status, 403);

  // Isolation: the unpaired phone sees nothing; neither phone can read the staff desk.
  assert.deepEqual((await b.c.from("caller_card").select("id")).data, []);
  assert.deepEqual((await a.c.from("desk").select("id")).data, []);
  assert.equal((await a.c.from("caller_card").select("id")).data.length, 1);

  // Intake: a number is withheld; a correction makes the earlier revision stale.
  assert.equal((await ok(cmd(a, "draft", { base_rev: 0, text: "card 1234 5678" }))).withheld, true);
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "no", cash_received: "no" }));
  await ok(cmd(a, "draft", { base_rev: 1, cash_received: "yes" }));
  assert.equal((await cmd(a, "confirm", { rev: 1 })).status, 409);
  await ok(cmd(a, "confirm", { rev: 2 }));
  const { data: desk } = await op.c.from("desk").select("card_back, cash_received, confirmed_rev").eq("id", incident).single();
  assert.deepEqual(desk, { card_back: "no", cash_received: "yes", confirmed_rev: 2 });

  // Only catalogue replies can be sent.
  assert.equal((await cmd(op, "send", { incident, intent: "FREE_TEXT" })).status, 400);
  await ok(cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" }));
  assert.equal((await a.c.from("reply").select("intent")).data[0].intent, "HELD_WAIT_OR_LEAVE");

  // Dispatch: only the assigned guard sees and can update the job.
  await ok(cmd(op, "assign", { incident, assignee: g1.uid }));
  assert.equal((await g1.c.from("field_job").select("incident").eq("case_closed", false)).data.length, 1);
  assert.deepEqual((await g2.c.from("field_job").select("incident").eq("case_closed", false)).data, []);
  assert.equal((await cmd(g2, "field", { incident, state: "on_way", eta: "30-45" })).status, 403);
  await ok(cmd(g1, "field", { incident, state: "on_way", eta: "30-45" }));
  const { data: cc } = await a.c.from("caller_card").select("field_state, eta").single();
  assert.deepEqual(cc, { field_state: "on_way", eta: "30-45" });

  // Caller chooses, explains the next step; the operator confirms understanding and the case closes.
  await ok(cmd(a, "choose", { choice: "leave" }));
  await ok(cmd(a, "teachback", { text: "আমি ব্যাংকের ফোনের জন্য অপেক্ষা করব, তারপর শাখায় যাব।" }));
  await ok(cmd(op, "outcome", { incident, result: "understood" }));
  assert.equal((await g1.c.from("field_job").select("incident").eq("case_closed", false)).data.length, 0);
  const { data: done } = await a.c.from("caller_card").select("status").single();
  assert.equal(done.status, "guided");
  // A guard cannot act as an operator.
  assert.equal((await cmd(g1, "simulate", { station: "TABLE-A", fault: "card_retained" })).status, 403);
  // Insights: counts for staff, refused for callers.
  assert.ok((await op.c.rpc("insights", { p_days: 7 })).data.funnel.guided >= 1);
  assert.ok((await a.c.rpc("insights", { p_days: 7 })).error);
});
