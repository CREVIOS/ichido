const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const NE_DIGITS = "०१२३४५६७८९";

// Withhold any text that looks like a PIN, card, account or ID number before it leaves the server.
// Catches digit runs (ASCII, Bengali, Devanagari, full-width) and four or more number words in a row.
// ponytail: number words for the caller languages only; free speech still reaches the speech provider before this runs.
const NUMBER_WORDS = new Set([
  "zero", "oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "ゼロ", "れい", "いち", "に", "さん", "よん", "し", "ご", "ろく", "なな", "しち", "はち", "きゅう", "く",
  "零", "一", "二", "三", "四", "五", "六", "七", "八", "九",
  // Vietnamese, with the spoken variants (linh/lẻ for zero, tư for four, lăm for five)
  "không", "linh", "lẻ", "một", "mốt", "hai", "ba", "bốn", "tư", "năm", "lăm", "sáu", "bảy", "tám", "chín",
  // Indonesian
  "nol", "kosong", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
  // Nepali
  "शून्य", "सुन्ना", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
]);
export function looksLikeNumber(text: string): boolean {
  const normalised = text
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[०-९]/g, (d) => String(NE_DIGITS.indexOf(d)))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[\s\-‐-―ー.・,]/g, "");
  if (/\d{4,}/.test(normalised)) return true;
  let run = 0;
  // NFC so Vietnamese typed with combining accents matches the precomposed words above.
  for (const w of text.normalize("NFC").toLowerCase().split(/[\s,、。.・\-।]+/).filter(Boolean)) {
    run = NUMBER_WORDS.has(w) ? run + 1 : 0;
    if (run >= 4) return true;
  }
  return false;
}
