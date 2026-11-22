import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeNumber } from "../content/catalogue.ts";

test("withholds digit runs in ASCII, Bengali and full-width digits, with separators", () => {
  for (const s of ["1234", "card 1234-5678", "পিন ১২৩৪", "１２３４", "12 34 56", "০১৭১১-২২৩৩৪৪"]) assert.equal(looksLikeNumber(s), true, s);
});

test("lets ordinary sentences and short numbers through", () => {
  for (const s of ["কার্ডটা ফেরত আসেনি", "the card did not come back", "30 minutes", "ATMで 2回 ためした"]) assert.equal(looksLikeNumber(s), false, s);
});

test("withholds four or more number words in a row", () => {
  for (const s of ["one two three four", "এক দুই তিন চার", "いち に さん し", "my pin is five six seven eight"]) assert.equal(looksLikeNumber(s), true, s);
  for (const s of ["one card, two tries", "এক মিনিট অপেক্ষা করব"]) assert.equal(looksLikeNumber(s), false, s);
});
