import { ACCESS, ANSWER, BANK_STATUS, CALLER_FLAGS, DISASTER, DISASTER_NOTICES, ERRORS, FACTS, FAULTS, FAULT_UI, FIELD_STATE, MOBILE, RATING, REPLIES, STATION, STATUS, UI, VOICE, etaText, packCallerStrings } from "../content/catalogue.ts";

// Familiar banking and pairing terms, and the language name in the help-desk notice. Scenario packs add the official
// card name (マイナンバー) and words with no plain-Japanese equivalent a shelter or station must use.
const allowed = new Set(["カード", "コード", "シール", "ベンガル", "マイナンバー", "タクシー", "アレルギー", "ハラール", "ミルク"]);
const keigo = /いたします|ございま(?:す|し)|申し上げ|存じ|させていただ/u;

export function findings(text) {
  const issues = [];
  for (const sentence of text.normalize("NFKC").split(/[。.!?\n]+/u)) {
    const words = sentence.trim().split(/\s+/u);
    if (words.some((w) => [...w].length > 40)) issues.push("over 40 characters without a break");
    const letters = sentence.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/gu) ?? [];
    const kanji = letters.filter((c) => /\p{Script=Han}/u.test(c)).length;
    if (kanji > letters.length * 0.35) issues.push(`kanji ${Math.round(100 * kanji / letters.length)}%`);
    const formal = words.join("").match(keigo);
    if (formal) issues.push(`keigo: ${formal[0]}`);
    for (const word of sentence.match(/[\p{Script=Katakana}][\p{Script=Katakana}ー]*/gu) ?? []) {
      if (!allowed.has(word)) issues.push(`katakana: ${word}`);
    }
  }
  return [...new Set(issues)];
}

function* japanese(entries, path = "") {
  for (const [key, value] of Object.entries(entries)) {
    const name = path ? `${path}.${key}` : key;
    if (typeof value?.ja === "string") yield [name, value.ja];
    else if (value && typeof value === "object") yield* japanese(value, name);
  }
}

function checkCatalogue() {
  const slots = { branch: { ja: "駅前支店" }, hours: { ja: "平日 9時から 15時まで" } };
  const replies = Object.fromEntries(Object.entries(REPLIES).map(([key, r]) => [key, r.text(slots)]));
  const entries = japanese({ ACCESS, DISASTER, DISASTER_NOTICES: Object.fromEntries(Object.entries(DISASTER_NOTICES).map(([k, n]) => [k, n.text])), UI, STATION, VOICE, ERRORS, FACTS, FAULTS, ANSWER, STATUS, FIELD_STATE, RATING, MOBILE: { entry: { caller: MOBILE.entry.caller, staff: MOBILE.entry.staff }, station: MOBILE.station, back: MOBILE.back, speak: MOBILE.speak, stopSpeaking: MOBILE.stopSpeaking }, REPLIES: replies,
    ETA: { pending: { ja: etaText(null, "ja") }, provided: { ja: etaText("10-20", "ja") } },
    FAULT_UI, CALLER_FLAGS: Object.fromEntries(Object.entries(CALLER_FLAGS).map(([k, f]) => [k, f.label])),
    BANK_STATUS: Object.fromEntries(Object.entries(BANK_STATUS).map(([k, b]) => [k, { ja: b.caller("2026-12-01", "ja") }])),
    // Scenario packs (content/packs): situations, taps, replies and notices are merged above; this is the rest.
    PACKS: packCallerStrings() });
  const rows = [];
  let checked = 0;
  for (const [entry, text] of entries) {
    checked++;
    for (const rule of findings(text)) rows.push({ entry, rule, text });
  }
  if (rows.length) console.table(rows);
  console.log(`${checked} Japanese entries checked, ${rows.length} findings`);
  if (rows.length) process.exitCode = 1;
}

if (import.meta.main) checkCatalogue();
