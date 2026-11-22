import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { caller, staff } from "./helpers.mjs";
import { eventText } from "../content/catalogue.ts";

const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

test("only overdue open cases escalate, once per reason, with a staff-only audit trail", async (t) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  const op = await staff("operator@ichido.demo");
  const guard = await staff("guard1@ichido.demo");
  const manager = await staff("manager@ichido.demo");
  const customer = await caller();
  const targetRows = await op.c.schema("ichido").from("sla_target").select("reason, seconds").throwOnError();
  const targets = Object.fromEntries(targetRows.data.map((r) => [r.reason, r.seconds]));
  assert.deepEqual(targets, { unclaimed: 60, no_reply: 180, guard_late: 600 });

  const station = randomUUID();
  const fault = "card_retained";
  await admin.from("station").insert({ id: station, label: {}, branch: {}, counter_hours: {}, security_company: "test" }).throwOnError();
  t.after(async () => {
    await admin.from("desk").delete().eq("station", station).throwOnError();
    await admin.from("light").delete().eq("station", station).throwOnError();
    await admin.from("station").delete().eq("id", station).throwOnError();
  });
  const insertDesk = async (fields) => (await admin.from("desk").insert({ station, source: "simulator", fault, ...fields })
    .select("id").single().throwOnError()).data.id;
  const run = () => admin.schema("ichido").rpc("escalate_due").throwOnError();
  const reasons = async (client, id) => (await client.from("escalation").select("reason").eq("incident", id)
    .order("reason").throwOnError()).data.map((r) => r.reason);
  const closed = await insertDesk({ created_at: ago(1800), finished_at: ago(900) });
  const id = await insertDesk({});
  await run();
  assert.deepEqual(await reasons(op.c, id), []);
  assert.deepEqual(await reasons(op.c, closed), []);

  const overdue = ago(targets.unclaimed + targets.no_reply + 60);
  await admin.from("desk").update({ created_at: overdue }).eq("id", id).throwOnError();
  await Promise.all([run(), run()]);
  assert.deepEqual(await reasons(op.c, id), ["unclaimed"]);
  await admin.rpc("cmd_claim", { p_uid: op.uid, p_name: "test", p_incident: id }).throwOnError();
  await run();
  assert.deepEqual(await reasons(op.c, id), ["unclaimed"], "a fresh claim gets its own reply window");
  await admin.from("desk").update({ finished_at: ago(0) }).eq("id", id).throwOnError();

  const claimed = await insertDesk({ operator_id: op.uid, created_at: ago(1800) });
  const job = { incident: claimed, assignee: guard.uid, station, fault };
  await admin.from("case_event").insert({ incident: claimed, actor: "operator", kind: "claimed", at: ago(targets.no_reply + 5) }).throwOnError();
  await admin.from("field_job").insert(job).throwOnError();
  await run();
  assert.deepEqual(await reasons(op.c, claimed), ["no_reply"]);
  await admin.from("field_job").update({ updated_at: ago(targets.guard_late + 5) }).eq("incident", claimed).throwOnError();
  await Promise.all([run(), run()]);
  await run();
  for (const who of [op, manager]) assert.deepEqual(await reasons(who.c, claimed), ["guard_late", "no_reply"]);
  for (const who of [guard, customer]) assert.deepEqual(await reasons(who.c, claimed), []);
  for (const who of [op, manager, guard, customer]) {
    assert.equal((await who.c.schema("ichido").rpc("escalate_due")).error?.code, "42501");
    assert.equal((await who.c.from("escalation").insert({ incident: claimed, reason: "unclaimed" })).error?.code, "42501");
  }
  const events = await op.c.from("case_event").select("actor, data").eq("kind", "escalated").in("incident", [id, claimed]).throwOnError();
  assert.deepEqual(events.data.map((e) => e.data.reason).sort(), ["guard_late", "no_reply", "unclaimed"]);
  for (const e of events.data) {
    assert.equal(e.actor, "system");
    assert.equal(e.data.level, 1);
    assert.match(eventText("escalated", e.data), /エスカレーション/);
  }

  await admin.from("desk").update({ finished_at: ago(0) }).eq("id", claimed).throwOnError();
  const answered = await insertDesk({ operator_id: op.uid, created_at: ago(1800) });
  await admin.from("reply").insert({ incident: answered, operator_id: op.uid, intent: "HANDSET", manual_version: "test" }).throwOnError();
  await admin.from("case_event").insert({ incident: answered, actor: "operator", kind: "claimed", at: overdue }).throwOnError();
  await admin.from("field_job").insert({ ...job, incident: answered, state: "on_way", updated_at: ago(900) }).throwOnError();
  await run();
  assert.deepEqual(await reasons(op.c, answered), []);
});
