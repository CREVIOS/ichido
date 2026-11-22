// Gemini decision support: only the operator who owns an open case may ask; without a key it answers "not configured".
import test from "node:test";
import assert from "node:assert/strict";
import { staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";

test("suggestions are for the owning operator only", async () => {
  const op = await staff("operator@ichido.demo");
  const op2 = await staff("operator2@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a);
  assert.equal((await cmd(op2, "suggest", { incident })).status, 409, "not the owner");
  assert.equal((await cmd(g, "suggest", { incident })).status, 403);
  assert.equal((await cmd(a, "suggest", { incident })).status, 403);
  const r = await ok(cmd(op, "suggest", { incident }));
  if (!process.env.GEMINI_API_KEY) assert.equal(r.suggestion, null);
  else assert.ok(r.suggestion === null || Array.isArray(r.suggestion.reasons));
  await ok(cmd(op, "abandon", { incident }));
});
