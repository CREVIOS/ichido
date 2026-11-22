import assert from "node:assert/strict";
import test from "node:test";
import { findings } from "../scripts/check-yasashii.mjs";

test("easy Japanese checks phrase length, kanji density, keigo and unfamiliar katakana", () => {
  const forty = "あ".repeat(40);
  assert.deepEqual(findings(`${forty}　あ。${forty}？ カードの コード`), []);
  assert.ok(findings(forty + "あ").includes("over 40 characters without a break"));
  assert.deepEqual(findings("人".repeat(7) + "あ".repeat(13)), []);
  assert.ok(findings("確認 した").includes("kanji 50%"));
  for (const word of ["いたします", "ございます", "申し上げ", "存じ", "させて いただく"]) {
    assert.ok(findings(word).some((rule) => rule.startsWith("keigo:")), word);
  }
  assert.deepEqual(findings("ｶｰﾄﾞ と エスカレーション"), ["katakana: エスカレーション"]);
});
