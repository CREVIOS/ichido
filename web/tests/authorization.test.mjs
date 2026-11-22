import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { caller, cmd, closeOpen, ok, openPairedCase, staff } from "./helpers.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname));
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

test("replacing the caller creates a fresh voice room for the same incident", async (t) => {
  const op = await staff("operator@ichido.demo");
  const first = await caller();
  const next = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, first);
  t.after(() => ok(cmd(op, "abandon", { incident })));
  const room = async (uid) => {
    const { data } = await admin.schema("ichido").from("binding").select("voice_room").eq("uid", uid).single().throwOnError();
    return data.voice_room;
  };
  const oldRoom = await room(first.uid);
  await ok(cmd(op, "reset_caller", { incident }));
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  await ok(cmd(next, "pair", { station: "TABLE-A", code, lang: "en" }));
  assert.ok(oldRoom);
  assert.notEqual(await room(next.uid), oldRoom);
});

test("a shared quota admits only one concurrent request for the same key", async () => {
  const args = { p_scope: "test", p_key: randomUUID(), p_limit: 1, p_seconds: 60 };
  const take = async () => (await admin.rpc("take_rate_limit", args).throwOnError()).data;
  const check = async () => (await admin.rpc("take_rate_limit", { ...args, p_check_only: true }).throwOnError()).data;
  assert.equal(await check(), true);
  const results = await Promise.all([take(), take()]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await check(), false);
  assert.equal(await take(), false);
});

test("the operator directory and private presence both require the operator role", async (t) => {
  const op = await staff("operator@ichido.demo");
  const guard = await staff("guard1@ichido.demo");
  const phone = await caller();
  const { data } = await op.c.rpc("mcp_field_staff").throwOnError();
  assert.ok(data.some((person) => person.uid === guard.uid && person.display_name));
  assert.ok(data.every((person) => person.uid !== op.uid));

  for (const account of [op, guard, phone]) {
    if (account !== op) {
      const { error } = await account.c.rpc("mcp_field_staff");
      assert.equal(error?.message, "forbidden");
    }
    const args = { p_scope: "test", p_key: account.uid, p_limit: 1, p_seconds: 60 };
    const { error } = await account.c.rpc("take_rate_limit", args);
    assert.ok(["42501", "PGRST202"].includes(error?.code), "service-only quota");

    await account.c.realtime.setAuth(account.token);
    const channel = account.c.channel("ichido:operator-presence", {
      config: { private: true, presence: { key: account.uid, enabled: true } },
    });
    t.after(() => account.c.removeChannel(channel));
    const { status, reason } = await new Promise((resolve) => {
      // Local Realtime answers a denied private join after about 5 s, so wait longer than that.
      channel.subscribe((status, reason) => resolve({ status, reason }), 15000);
    });
    if (account === op) {
      assert.equal(status, "SUBSCRIBED");
      assert.equal(await channel.track({ uid: account.uid, viewing: null }), "ok");
    } else {
      assert.equal(status, "CHANNEL_ERROR");
      assert.match(reason?.message ?? "", /permission|authori[sz]|forbidden|denied/i);
    }
  }
});

test("handoff views are atomic, bounded, revocable and expire after 24 hours", async (t) => {
  const op = await staff("operator@ichido.demo");
  const { data: desk } = await admin.from("desk").insert({
    station: "TABLE-A", fault: "card_retained", source: "simulator", finished_at: new Date().toISOString(),
  }).select("id").single().throwOnError();
  t.after(() => admin.from("desk").delete().eq("id", desk.id).throwOnError());
  const link = await ok(cmd(op, "handoff_create", { incident: desk.id, recipient: "bank" }));
  assert.match(link.path, /^\/h\/[A-Za-z0-9_-]{32}$/);
  assert.ok(Math.abs(Date.parse(link.expires_at) - Date.now() - 86_400_000) < 60_000);
  const view = async (path = link.path) => {
    const hash = createHash("sha256").update(path.split("/").at(-1)).digest("hex");
    return (await admin.rpc("view_handoff", { p_hash: hash }).maybeSingle().throwOnError()).data;
  };
  const views = await Promise.all([view(), view(), view()]);
  assert.ok(views.every((row) => row?.incident === desk.id && row.recipient === "bank" && row.expires_at));

  const internal = admin.schema("ichido");
  await internal.from("handoff").update({ expires_at: new Date(0).toISOString() }).eq("id", link.id).throwOnError();
  assert.equal(await view(), null);
  await internal.from("handoff").update({ expires_at: link.expires_at }).eq("id", link.id).throwOnError();
  await ok(cmd(op, "handoff_revoke", { id: link.id }));
  assert.equal(await view(), null);
  const { links } = await ok(cmd(op, "handoff_list", { incident: desk.id }));
  assert.equal(links[0].views, views.length);
  const events = await op.c.from("case_event").select("id", { head: true, count: "exact" })
    .eq("incident", desk.id).eq("kind", "handoff_viewed").throwOnError();
  assert.equal(events.count, views.length);
  const capped = await ok(cmd(op, "handoff_create", { incident: desk.id, recipient: "security" }));
  const cappedViews = await Promise.all(Array.from({ length: 31 }, () => view(capped.path)));
  assert.equal(cappedViews.filter(Boolean).length, 30);
});

test("finishing an in-progress guard assignment after abandonment retires its read access", async (t) => {
  const op = await staff("operator@ichido.demo");
  const guard = await staff("guard1@ichido.demo");
  const station = randomUUID();
  await admin.from("station").insert({ id: station, label: {}, branch: {}, counter_hours: {}, security_company: "test" }).throwOnError();
  t.after(async () => {
    await admin.from("desk").delete().eq("station", station).throwOnError();
    await admin.from("light").delete().eq("station", station).throwOnError();
    await admin.from("station").delete().eq("id", station).throwOnError();
  });
  const { data: incident } = await admin.rpc("record_fault", {
    p_station: station, p_key: randomUUID().replaceAll("-", ""), p_source: "simulator", p_fault: "card_retained",
  }).throwOnError();
  await ok(cmd(op, "claim", { incident }));
  await ok(cmd(op, "assign", { incident, assignee: guard.uid }));
  const job = await guard.c.from("field_job").select("generation").eq("incident", incident).single().throwOnError();
  const update = (state) => cmd(guard, "field", { incident, generation: job.data.generation, state });
  await ok(update("on_way"));
  await ok(cmd(op, "abandon", { incident }));
  await ok(update("done"));
  assert.deepEqual((await guard.c.from("field_job").select("incident").eq("incident", incident).throwOnError()).data, []);
  assert.deepEqual((await guard.c.from("station").select("id").eq("id", station).throwOnError()).data, []);
});

test("authenticated caller command quotas count rejected requests independently", async () => {
  const phone = await caller();
  for (const [name, args, limit] of [["rate", { rating: 1 }, 5], ["set_lang", { lang: "en" }, 10]]) {
    for (let i = 0; i < limit; i++) assert.equal((await cmd(phone, name, args)).status, 403);
    assert.equal((await cmd(phone, name, args)).status, 429);
  }
});
