// One-tap rating: only after a guided close, once, 1–3.
import test from "node:test";
import assert from "node:assert/strict";
import { staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";

test("a caller rates once, only after the case closed as guided", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a);
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "yes", cash_received: "yes" }));
  await ok(cmd(a, "confirm", { rev: 1 }));
  assert.equal((await cmd(a, "rate", { rating: 3 })).status, 409, "not before the case closes");
  const { id: reply } = await ok(cmd(op, "send", { incident, intent: "OFFICIAL_CHANNEL" }));
  await ok(cmd(a, "teachback", { text: "I will contact the bank's official channel." }));
  await ok(cmd(op, "outcome", { incident, reply, result: "understood" }));
  assert.equal((await cmd(a, "rate", { rating: 4 })).status, 400);
  await ok(cmd(a, "rate", { rating: 3 }));
  assert.equal((await cmd(a, "rate", { rating: 1 })).status, 409, "only once");
  assert.equal((await a.c.from("caller_card").select("rating").single()).data.rating, 3);
  assert.equal((await op.c.rpc("insights_ratings", { p_days: 7 })).data["3"] >= 1, true);
  assert.ok((await a.c.rpc("insights_ratings", { p_days: 7 })).error, "callers cannot read insights");
});
