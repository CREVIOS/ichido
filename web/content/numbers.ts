const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

// Withhold any text that looks like a PIN, card, account or ID number before it leaves the server.
// Catches digit runs (ASCII, Bengali, full-width) and four or more number words in a row.
// ponytail: number words for bn/en/ja only; free speech still reaches the speech provider before this runs.
const NUMBER_WORDS = new Set([
  "zero", "oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "ゼロ", "れい", "いち", "に", "さん", "よん", "し", "ご", "ろく", "なな", "しち", "はち", "きゅう", "く",
  "零", "一", "二", "三", "四", "五", "六", "七", "八", "九",
]);
export function looksLikeNumber(text: string): boolean {
  const normalised = text
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[\s\-‐-―ー.・,]/g, "");
  if (/\d{4,}/.test(normalised)) return true;
  let run = 0;
  for (const w of text.toLowerCase().split(/[\s,、。.・\-]+/).filter(Boolean)) {
    run = NUMBER_WORDS.has(w) ? run + 1 : 0;
    if (run >= 4) return true;
  }
  return false;
}
