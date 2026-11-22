// Hand-off links: operator-only, read-only, no caller free text, audited views, revocable.
import test from "node:test";
import assert from "node:assert/strict";
import { APP, staff, caller, cmd, ok, openPairedCase, closeOpen } from "./helpers.mjs";

test("a hand-off link shows the record without the caller's words, logs views, and can be revoked", async () => {
  const op = await staff("operator@ichido.demo");
  const g = await staff("guard1@ichido.demo");
  const a = await caller();
  await closeOpen(op);
  const incident = await openPairedCase(op, a);
  const words = "PRIVATE-WORDS-the card stayed inside";
  await ok(cmd(a, "draft", { base_rev: 0, text: words }));
  await ok(cmd(a, "draft", { base_rev: 1, card_back: "no", cash_received: "yes" }));
  await ok(cmd(a, "confirm", { rev: 2 }));

  assert.equal((await cmd(g, "handoff_create", { incident, recipient: "bank" })).status, 403);
  assert.equal((await cmd(a, "handoff_create", { incident, recipient: "bank" })).status, 403);
  assert.equal((await cmd(op, "handoff_create", { incident, recipient: "press" })).status, 400);
  const { id, path } = await ok(cmd(op, "handoff_create", { incident, recipient: "bank" }));

  const page = await (await fetch(`${APP}${path}`)).text();
  assert.ok(page.includes("引継票") && page.includes("銀行 御中"), "renders the record");
  assert.ok(page.includes("カードは戻ってきていないとのこと"), "includes the confirmed facts");
  assert.ok(!page.includes("PRIVATE-WORDS"), "never the caller's own words");
  const { links } = await ok(cmd(op, "handoff_list", { incident }));
  assert.equal(links[0].views, 1);
  assert.ok((await op.c.from("case_event").select("kind").eq("incident", incident)).data.some((e) => e.kind === "handoff_viewed"));

  await ok(cmd(op, "handoff_revoke", { id }));
  assert.ok((await (await fetch(`${APP}${path}`)).text()).includes("無効"), "revoked links stop working");
  assert.ok((await (await fetch(`${APP}/h/not-a-real-token-aaaaaaaaaaaa`)).text()).includes("無効"));
  await ok(cmd(op, "abandon", { incident }));
});
