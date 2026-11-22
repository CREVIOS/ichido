import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeNumber } from "../content/catalogue.ts";

test("withholds digit runs in ASCII, Bengali and full-width digits, with separators", () => {
  for (const s of ["1234", "card 1234-5678", "পিন ১২৩৪", "１２３４", "12 34 56", "০১৭১১-২২৩৩৪৪"]) assert.equal(looksLikeNumber(s), true, s);
});

test("lets ordinary sentences and short numbers through", () => {
  for (const s of ["কার্ডটা ফেরত আসেনি", "the card did not come back", "30 minutes", "ATMで 2回 ためした"]) assert.equal(looksLikeNumber(s), false, s);
});
