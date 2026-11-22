// Caller wording every non-ATM pack shares. Bengali, Vietnamese, Indonesian and Nepali are drafts awaiting native
// review; Japanese is easy Japanese (npm run check:ja).
import type { FieldState, L10n, Lang } from "../catalogue.ts";
import type { Tap } from "./types.ts";

// A reply slot (the station's place and hours) in one language, English when a translation is missing.
export const slot = (v: L10n | undefined, l: Lang) => v?.[l] ?? v?.en ?? "";

// Never asked, and withheld if typed (content/numbers.ts).
export const NEVER_ASK_ID: L10n = {
  ja: "在留カードや マイナンバー、ほけんしょう、ぎんこうの 番号は ききません。ここに 書かないで ください。",
  en: "I will never ask for your residence card, health insurance, My Number, passport or bank numbers. Please do not type them here.",
  bn: "আমি কখনো আপনার রেসিডেন্স কার্ড, স্বাস্থ্যবিমা, মাই নাম্বার, পাসপোর্ট বা ব্যাংকের নম্বর জিজ্ঞাসা করব না। এখানে সেগুলো লিখবেন না।",
  vi: "Tôi sẽ không bao giờ hỏi số thẻ cư trú, bảo hiểm y tế, My Number, hộ chiếu hay tài khoản ngân hàng của bạn. Xin đừng nhập các số đó ở đây.",
  id: "Saya tidak akan pernah menanyakan nomor kartu izin tinggal, asuransi kesehatan, My Number, paspor, atau rekening bank Anda. Jangan ketik nomor-nomor itu di sini.",
  ne: "म कहिल्यै तपाईंको रेसिडेन्स कार्ड, स्वास्थ्य बीमा, माई नम्बर, राहदानी वा बैंकको नम्बर सोध्दिनँ। ती नम्बर यहाँ नलेख्नुहोस्।",
};

// The assistant only captures facts and routes to a person.
export const NO_MEDICAL: L10n = {
  ja: "この AI は びょうきの 名前や くすりの ことに こたえません。あなたの こたえを 人に つたえる だけです。",
  en: "This assistant does not diagnose or give medical advice. It only passes your answers to a person.",
  bn: "এই সহকারী রোগ নির্ণয় বা চিকিৎসা-পরামর্শ দেয় না। এটি শুধু আপনার উত্তর একজন মানুষের কাছে পৌঁছে দেয়।",
  vi: "Trợ lý này không chẩn đoán và không đưa ra lời khuyên y tế. Trợ lý chỉ chuyển câu trả lời của bạn đến một người.",
  id: "Asisten ini tidak mendiagnosis dan tidak memberi saran medis. Asisten hanya menyampaikan jawaban Anda kepada seseorang.",
  ne: "यो सहायकले रोग पत्ता लगाउँदैन वा उपचार सल्लाह दिँदैन। यसले तपाईंका उत्तर एक जना मानिससम्म मात्र पुर्‍याउँछ।",
};
export const NO_LEGAL: L10n = {
  ja: "この AI は ほうりつや 在留しかくの そうだんに こたえません。あなたの こたえを 人に つたえる だけです。",
  en: "This assistant does not give legal or immigration advice. It only passes your answers to a person.",
  bn: "এই সহকারী আইনি বা ভিসা-সংক্রান্ত পরামর্শ দেয় না। এটি শুধু আপনার উত্তর একজন মানুষের কাছে পৌঁছে দেয়।",
  vi: "Trợ lý này không tư vấn pháp lý hay tư vấn về cư trú. Trợ lý chỉ chuyển câu trả lời của bạn đến một người.",
  id: "Asisten ini tidak memberi saran hukum atau imigrasi. Asisten hanya menyampaikan jawaban Anda kepada seseorang.",
  ne: "यो सहायकले कानुनी वा भिसासम्बन्धी सल्लाह दिँदैन। यसले तपाईंका उत्तर एक जना मानिससम्म मात्र पुर्‍याउँछ।",
};

const WAIT: L10n = {
  ja: "係の 人が まだ かくにん しています。", en: "Staff are still looking at your request.", bn: "কর্মীরা এখনো আপনার অনুরোধ দেখছেন।",
  vi: "Nhân viên vẫn đang xem yêu cầu của bạn.", id: "Petugas masih memeriksa permintaan Anda.", ne: "कर्मचारीले अझै तपाईंको अनुरोध हेर्दै हुनुहुन्छ।",
};
const TOLD: L10n = {
  ja: "係の 人に つたえました。", en: "Staff have been told.", bn: "কর্মীদের জানানো হয়েছে।",
  vi: "Đã báo cho nhân viên.", id: "Petugas sudah diberi tahu.", ne: "कर्मचारीलाई जानकारी दिइयो।",
};
const SEP: L10n = { ja: "", en: " ", bn: " ", vi: " ", id: " ", ne: " " };
export const waitingText = (hint: L10n, l: Lang) => `${WAIT[l]}${SEP[l]}${hint[l]}`;
export const toldText = (hint: L10n, l: Lang) => `${TOLD[l]}${SEP[l]}${hint[l]}`;

// What the caller sees while the pack's responder comes to them (the ATM keeps its guard wording in catalogue.ts).
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const digits = (set: string) => (s: string) => s.replace(/[0-9]/g, (d) => set[Number(d)]);
export function fieldText(state: FieldState, r: L10n, l: Lang): string {
  const t: Record<FieldState, L10n> = {
    none: { ja: "", en: "", bn: "", vi: "", id: "", ne: "" },
    requested: { ja: `${r.ja}に きて もらうよう たのみました`, en: `We asked ${r.en} to come to you`, bn: `${r.bn}-কে আসতে বলা হয়েছে`, vi: `Đã nhờ ${r.vi} đến chỗ bạn`, id: `Sudah meminta ${r.id} datang ke tempat Anda`, ne: `${r.ne}लाई आउन अनुरोध गरियो` },
    on_way: { ja: `${r.ja}が こちらに むかって います`, en: `On the way to you: ${r.en}`, bn: `${r.bn} আসছেন`, vi: `${cap(r.vi)} đang đến`, id: `${cap(r.id)} sedang dalam perjalanan`, ne: `${r.ne} आउँदै हुनुहुन्छ` },
    arrived: { ja: `${r.ja}が つきました`, en: `Arrived: ${r.en}`, bn: `${r.bn} পৌঁছেছেন`, vi: `${cap(r.vi)} đã đến`, id: `${cap(r.id)} sudah tiba`, ne: `${r.ne} आइपुग्नुभयो` },
    done: { ja: "その場の たいおうは おわりました", en: "Help on site is finished", bn: "ঘটনাস্থলের সাহায্য শেষ হয়েছে", vi: "Hỗ trợ tại chỗ đã xong", id: "Bantuan di tempat sudah selesai", ne: "घटनास्थलको सहयोग सकियो" },
  };
  return t[state][l];
}
export function etaNote(eta: string | null | undefined, l: Lang): string {
  if (!eta) return { ja: "いつ つくかは まだ わかりません", en: "Arrival time is not known yet", bn: "আনুমানিক সময় এখনো জানা নেই", vi: "Chưa biết khi nào nhân viên đến", id: "Waktu kedatangan belum diketahui", ne: "आइपुग्ने समय अझै थाहा छैन" }[l];
  const range = eta.replace("-", "–");
  return {
    ja: `あと ${eta.replace("-", "〜")}分くらいで つきます（係の 人の よそうです。かわる ことも あります）`,
    en: `About ${range} minutes (their own estimate; it may change)`,
    bn: `আনুমানিক ${digits("০১২৩৪৫৬৭৮৯")(eta)} মিনিট (কর্মীর নিজের অনুমান, বদলাতে পারে)`,
    vi: `Khoảng ${range} phút (ước tính của nhân viên, có thể thay đổi)`,
    id: `Sekitar ${range} menit (perkiraan petugas sendiri, bisa berubah)`,
    ne: `करिब ${digits("०१२३४५६७८९")(range)} मिनेट (कर्मचारीको आफ्नै अनुमान, फरक पर्न सक्छ)`,
  }[l];
}
export const staffField = (r: string): Record<FieldState, string> => ({
  none: "未依頼", requested: `${r}へ対応を依頼しました`, on_way: `${r}が向かっています`, arrived: `${r}が到着しました`, done: "現地対応完了",
});

// Headings over grouped taps. Groups in EXCLUSIVE_GROUPS take one answer (the caller's screen turns the others off).
export const GROUP_TITLE: Record<string, L10n> = {
  urgent: { ja: "いま おきて いる ときは おして ください", en: "Tap if this is happening now", bn: "এখন এমন হলে চাপুন", vi: "Chạm nếu việc này đang xảy ra", id: "Ketuk jika ini sedang terjadi", ne: "अहिले यस्तो भइरहेको छ भने थिच्नुहोस्" },
  need: { ja: "なにに こまって いますか", en: "What do you need help with?", bn: "কী বিষয়ে সাহায্য দরকার?", vi: "Bạn cần giúp về việc gì?", id: "Anda butuh bantuan apa?", ne: "के कुरामा सहयोग चाहियो?" },
  who: { ja: "だれの ことですか", en: "Who is it for?", bn: "কার জন্য?", vi: "Cho ai?", id: "Untuk siapa?", ne: "कसका लागि?" },
  where: { ja: "どこが ぐあい わるいですか", en: "Where is the problem?", bn: "কোথায় সমস্যা?", vi: "Khó chịu ở đâu?", id: "Di mana keluhannya?", ne: "कहाँ समस्या छ?" },
  since: { ja: "いつから ですか", en: "Since when?", bn: "কবে থেকে?", vi: "Từ khi nào?", id: "Sejak kapan?", ne: "कहिलेदेखि?" },
  pain: { ja: "どのくらい いたいですか", en: "How much does it hurt?", bn: "কতটা ব্যথা?", vi: "Đau đến mức nào?", id: "Seberapa sakit?", ne: "कति दुख्छ?" },
  letter: { ja: "なんの 手紙ですか", en: "What is the letter about?", bn: "চিঠিটা কী বিষয়ে?", vi: "Thư về việc gì?", id: "Surat itu tentang apa?", ne: "चिठी केबारे हो?" },
  item: { ja: "なにを なくしましたか", en: "What did you lose?", bn: "কী হারিয়েছেন?", vi: "Bạn mất gì?", id: "Apa yang hilang?", ne: "के हरायो?" },
  lostwhere: { ja: "どこで なくしましたか", en: "Where did you lose it?", bn: "কোথায় হারিয়েছেন?", vi: "Bạn mất ở đâu?", id: "Hilang di mana?", ne: "कहाँ हरायो?" },
  party: { ja: "だれと いっしょですか", en: "Who is with you?", bn: "আপনার সঙ্গে কে আছেন?", vi: "Ai đi cùng bạn?", id: "Siapa yang bersama Anda?", ne: "तपाईंसँग को हुनुहुन्छ?" },
};
export const EXCLUSIVE_GROUPS = new Set(["who", "since", "pain", "party"]);

// Taps more than one pack offers. (`helper`, a family member helping, comes from content/faults.ts.)
export const SHARED_TAPS: Record<string, Tap> = {
  need_interpreter: {
    staff: "通訳を希望",
    label: {
      ja: "つうやくの 人と はなしたい", en: "I want to talk through an interpreter", bn: "দোভাষীর মাধ্যমে কথা বলতে চাই",
      vi: "Tôi muốn nói chuyện qua phiên dịch", id: "Saya ingin bicara lewat penerjemah", ne: "म दोभाषेमार्फत कुरा गर्न चाहन्छु",
    },
  },
};
