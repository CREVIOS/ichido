const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const NE_DIGITS = "०१२३४५६७८९";

// Withhold any text that looks like a PIN, card, account or ID number before it leaves the server.
// Catches digit runs (ASCII, Bengali, Devanagari, full-width) and four or more number words in a row.
// ponytail: number words for the caller languages only; free speech still reaches the speech provider before this runs.
const NUMBER_WORDS = new Set([
  "zero", "oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "ゼロ", "ぜろ", "まる", "〇", "れい", "いち", "に", "さん", "よん", "し", "ご", "ろく", "なな", "しち", "はち", "きゅう", "く",
  "零", "一", "二", "三", "四", "五", "六", "七", "八", "九",
  // Vietnamese, with the spoken variants (linh/lẻ for zero, tư for four, lăm for five)
  "không", "linh", "lẻ", "một", "mốt", "hai", "ba", "bốn", "tư", "năm", "lăm", "sáu", "bảy", "tám", "chín",
  // Indonesian
  "nol", "kosong", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
  // Nepali
  "शून्य", "सुन्ना", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
]);
// Treat even short standalone number fragments as sensitive in a multi-turn conversation.
export function frontlineNumber(text: string): boolean {
  if (looksLikeNumber(text) || /\p{N}|[〇零一二三四五六七八九]{2}/u.test(text)) return true;
  const normalized = text.normalize("NFKC").replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 96));
  if (/(?:ぜろ|まる|れい|いち|に|さん|よん|しち|し|ご|ろく|なな|はち|きゅう|く){2,}/u.test(normalized)) return true;
  const words = normalized.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
  return words.some((w) => NUMBER_WORDS.has(w));
}
// Words for an ID, insurance, residence-card, My Number, passport or account number in the caller languages: with three
// or more digits anywhere in the text, the text is withheld even when the digits are split up.
const ID_WORDS = /number|no\.|card|insurance|passport|account|my ?number|番号|記号|保険|在留|マイナンバー|パスポート|口座|ばんごう|নম্বর|কার্ড|বিমা|পাসপোর্ট|số|thẻ|bảo hiểm|hộ chiếu|tài khoản|nomor|kartu|asuransi|paspor|rekening|नम्बर|कार्ड|बीमा|राहदानी|खाता/i;
export function looksLikeNumber(text: string): boolean {
  const normalised = text
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[०-९]/g, (d) => String(NE_DIGITS.indexOf(d)))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[\s\-‐-―ー.・,]/g, "");
  if (/\d{4,}/.test(normalised)) return true;
  // Card-style IDs split by letters (a residence card is AB12345678CD; 記号12-番号345 on an insurance card).
  if (/[a-z]\d{2,}[a-z]+\d/i.test(normalised) || ((normalised.match(/\d/g) ?? []).length >= 3 && ID_WORDS.test(text))) return true;
  let run = 0;
  // NFC so Vietnamese typed with combining accents matches the precomposed words above.
  for (const w of text.normalize("NFC").toLowerCase().split(/[\s,、。.・\-।]+/).filter(Boolean)) {
    run = NUMBER_WORDS.has(w) ? run + 1 : 0;
    if (run >= 4) return true;
  }
  return false;
}

// Staff summaries can also contain contact details or a name copied from the conversation.
export function identifyingSummary(text: string) {
  return looksLikeNumber(text) || /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|(?:氏名|住所|電話番号|担当者名)\s*[:：]|[一-龯ァ-ン]{2,12}(?:さん|様)(?!子)|(?:my name is|named|lives at)\s+\S+)/iu.test(text);
}
