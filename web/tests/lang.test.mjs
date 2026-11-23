// A caller can switch language while the case is open; the operator sees the change on the timeline.
import test from "node:test";
import { frontlineCase } from "./frontline-fixture.mjs";
import assert from "node:assert/strict";
import { staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";

test("a caller switches language mid-case, only to a supported language, only while open", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a, "bn");
  assert.equal((await cmd(a, "set_lang", { lang: "fr" })).status, 400);
  await ok(cmd(a, "set_lang", { lang: "vi" }));
  assert.equal((await a.c.from("caller_card").select("lang").single()).data.lang, "vi");
  assert.equal((await op.c.from("desk").select("lang").eq("id", incident).single()).data.lang, "vi");
  const events = (await op.c.from("case_event").select("kind, data").eq("incident", incident)).data;
  assert.ok(events.some((e) => e.kind === "lang_changed" && e.data.from === "bn" && e.data.to === "vi"));
  await ok(cmd(op, "abandon", { incident }));
  assert.ok([403, 409].includes((await cmd(a, "set_lang", { lang: "en" })).status), "not after the case closes");
});

test("switching a frontline caller's language preserves the original submitted locale", async (t) => {
  const f = await frontlineCase(t, "bn");
  await f.turn("start");
  await ok(cmd(f.phone, "set_lang", { lang: "ne" }));
  await f.turn("text", { text: "म कर्मचारीसँग कुरा गर्न चाहन्छु" });
  const turns = await f.monitor();
  assert.equal(turns.find((r) => r.wording === "greeting").locale, "bn");
  assert.equal(turns.find((r) => r.wording === "text").locale, "ne");
});
