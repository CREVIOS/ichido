// Concurrency and recovery: the cases Codex's review found could go wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { staff, caller, cmd, ok, device, newKey, openPairedCase, closeOpen } from "./helpers.mjs";

test("two operators claiming at once: exactly one wins", async () => {
  const op1 = await staff("operator@ichido.demo");
  const op2 = await staff("operator2@ichido.demo");
  await closeOpen(op1);
  assert.equal((await device(newKey())).status, 204);
  const { data: open } = await op1.c.from("desk").select("id").is("finished_at", null);
  const incident = open[0].id;
  const results = await Promise.all([cmd(op1, "claim", { incident }), cmd(op2, "claim", { incident })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const { data: claims } = await op1.c.from("case_event").select("id").eq("incident", incident).eq("kind", "claimed");
  assert.equal(claims.length, 1);
  const winner = results[0].status === 200 ? op1 : op2;
  await ok(cmd(winner, "abandon", { incident }));
});

test("two edits on the same revision: one wins, the other gets 409", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a);
  const results = await Promise.all([
    cmd(a, "draft", { base_rev: 0, card_back: "no" }),
    cmd(a, "draft", { base_rev: 0, card_back: "yes" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  await ok(cmd(op, "abandon", { incident }));
});

test("the held-card reply is refused when the caller said the card came back", async () => {
  const op = await staff("operator@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a);
  await ok(cmd(a, "draft", { base_rev: 0, card_back: "yes", cash_received: "yes" }));
  await ok(cmd(a, "confirm", { rev: 1 }));
  assert.equal((await cmd(op, "send", { incident, intent: "HELD_WAIT_OR_LEAVE" })).status, 409);
  await ok(cmd(op, "send", { incident, intent: "OFFICIAL_CHANNEL" }));
  await ok(cmd(op, "abandon", { incident }));
});

test("a lost caller can be reset and a new phone paired; staff sessions never see a caller case", async () => {
  const op = await staff("operator@ichido.demo");
  const first = await caller();
  const second = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, first);
  assert.equal((await cmd(op, "issue_code", { incident })).status, 409, "no second code while a caller is connected");
  await ok(cmd(op, "reset_caller", { incident }));
  const { code } = await ok(cmd(op, "issue_code", { incident }));
  await ok(cmd(second, "pair", { station: "TABLE-A", code, lang: "en" }));
  assert.equal((await cmd(first, "draft", { base_rev: 1, card_back: "no" })).status, 403, "the old phone is out");
  assert.deepEqual((await ok(cmd(op, "mine"))), { incident: null, staff: true });
  await ok(cmd(op, "abandon", { incident }));
  // The station is free again: a new fault opens a new case.
  assert.equal((await device(newKey())).status, 204);
  const { data: open } = await op.c.from("desk").select("id").is("finished_at", null);
  assert.notEqual(open[0].id, incident);
  await closeOpen(op);
});

test("pairing guesses are rate-limited", async () => {
  const op = await staff("operator@ichido.demo");
  const guesser = await caller();
  await closeOpen(op);
  assert.equal((await device(newKey())).status, 204);
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await cmd(guesser, "pair", { station: "TABLE-A", code: "ZZZZZZ", lang: "bn" })).status);
  assert.ok(statuses.includes(429), statuses.join(","));
  await closeOpen(op);
});
