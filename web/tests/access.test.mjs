// The path with no voice: a silent text alert from the sticker page opens a flagged case, and the pairing code
// reaches the Help Point display only after the operator presses 端末に表示, only for that station's secret,
// and goes away when it is used or expires.
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { APP, caller, closeOpen, cmd, ok, staff } from "./helpers.mjs";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const poll = (headers = {}) => fetch(`${APP}/api/device`, { headers: { "x-station": "TABLE-A", authorization: "Bearer local-device-secret", "x-display": "1", ...headers } });
const screen = async (headers) => {
  const res = await poll(headers);
  return { status: res.status, lines: (await res.text()).split("\n") };
};
const codeOn = (lines) => lines.find((l) => l.startsWith("code="))?.slice(5) ?? null;

test.beforeEach(async () => {
  await service.schema("ichido").from("silent_alert").delete().neq("station", "");
  await service.schema("ichido").from("pair_attempt").delete().neq("station", "");
});

test("a silent alert opens a text-only case; the code reaches the device only after the operator shows it", async () => {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  const who = await caller();
  await ok(cmd(who, "silent_alert", { station: "TABLE-A" }));

  const { data: open } = await op.c.from("desk").select("id, source, text_only").is("finished_at", null).eq("station", "TABLE-A");
  assert.equal(open.length, 1);
  const incident = open[0].id;
  assert.deepEqual({ source: open[0].source, text_only: open[0].text_only }, { source: "caller", text_only: true });
  const { data: events } = await op.c.from("case_event").select("kind").eq("incident", incident).order("id");
  assert.deepEqual(events.map((e) => e.kind), ["fault", "text_only"]);

  // A second press, by anyone, flags the same case once.
  await ok(cmd(await caller(), "silent_alert", { station: "TABLE-A" }));
  const { count } = await op.c.from("case_event").select("id", { count: "exact", head: true }).eq("incident", incident).eq("kind", "text_only");
  assert.equal(count, 1);

  // Nothing on the screen yet: a spoken code is not a displayed one.
  await ok(cmd(op, "claim", { incident }));
  const spoken = await ok(cmd(op, "issue_code", { incident }));
  assert.equal(codeOn((await screen()).lines), null);

  // Only the operator who owns the case can show it; then only that station's secret reads it.
  const other = await staff("operator2@ichido.demo");
  assert.equal((await cmd(other, "show_code_on_device", { incident })).status, 403);
  assert.equal((await cmd(who, "show_code_on_device", { incident })).status, 403);
  const { code } = await ok(cmd(op, "show_code_on_device", { incident }));
  assert.notEqual(code, spoken.code);
  const shown = await screen();
  assert.equal(shown.status, 200);
  assert.equal(shown.lines[0], "review");
  assert.equal(codeOn(shown.lines), code);
  assert.ok(Number(shown.lines.find((l) => l.startsWith("ttl=")).slice(4)) > 280);
  for (const headers of [{ authorization: "Bearer wrong" }, { authorization: "" }, { "x-station": "NO-SUCH-STATION" }]) {
    const r = await screen(headers);
    assert.equal(r.status, 401);
    assert.ok(!r.lines.join("\n").includes(code));
  }
  // A device without a display keeps the plain one-word answer.
  assert.equal(await (await poll({ "x-display": "" })).text(), "review");
  // The spoken code was replaced, so it no longer pairs.
  assert.equal((await cmd(who, "pair", { station: "TABLE-A", code: spoken.code, lang: "ja" })).status, 403);

  // Pairing with the shown code clears the screen; the case continues by text.
  await ok(cmd(who, "pair", { station: "TABLE-A", code, lang: "ja" }));
  assert.equal(codeOn((await screen()).lines), null);
  const { data: card } = await who.c.from("caller_card").select("text_only").eq("id", incident).single();
  assert.equal(card.text_only, true);
  assert.equal((await cmd(who, "silent_alert", { station: "TABLE-A" })).status, 409);
  const { data: timeline } = await op.c.from("case_event").select("kind").eq("incident", incident).order("id");
  assert.ok(timeline.some((e) => e.kind === "device_code"));
  await closeOpen(op);
});

test("a shown code expires off the screen", async () => {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  await ok(cmd(await caller(), "silent_alert", { station: "TABLE-A" }));
  const { data: open } = await op.c.from("desk").select("id").is("finished_at", null).eq("station", "TABLE-A");
  const incident = open[0].id;
  await ok(cmd(op, "claim", { incident }));
  await ok(cmd(op, "show_code_on_device", { incident }));
  assert.ok(codeOn((await screen()).lines));
  await service.schema("ichido").from("pair_code").update({ expires: new Date(Date.now() - 1000).toISOString() }).eq("incident", incident);
  assert.equal(codeOn((await screen()).lines), null);
  // Closing the case removes it as well.
  await ok(cmd(op, "show_code_on_device", { incident }));
  await ok(cmd(op, "abandon", { incident }));
  assert.equal(codeOn((await screen()).lines), null);
});

test("silent alerts are rate-limited, refused to staff and to paired phones", async () => {
  const op = await staff("operator@ichido.demo");
  await closeOpen(op);
  const who = await caller();
  for (let i = 0; i < 3; i++) await ok(cmd(who, "silent_alert", { station: "TABLE-A" }));
  const limited = await cmd(who, "silent_alert", { station: "TABLE-A" });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, "rate_limited");
  assert.equal((await cmd(op, "silent_alert", { station: "TABLE-A" })).status, 403);
  assert.equal((await cmd(await caller(), "silent_alert", { station: "NO-SUCH-STATION" })).status, 404);
  await closeOpen(op);
});
