// All user-visible wording lives here. Manual "retained-card/v1" is written for a FICTIONAL bank.
// Operators can send only intents in REPLIES; callers see the pre-written text in their language.
// Bengali, Vietnamese, Indonesian, Nepali and Japanese below are drafts awaiting native review (see README).

import { BOT, DESK, HANDOFF, STAFF_JA } from "./staff.ts";
import { CALLER_FLAGS, FAULT_NAMES, FAULT_REPLIES, REPLY_RULES, faultEventText } from "./faults.ts";
import { EXCLUSIVE_GROUPS, PACKS, contentPack, isUrgentTap, packCaller, packOfFault, packStaffField, type PackId } from "./packs/index.ts";
import { REVIEW } from "./review.ts";
import { OPS_FAULTS, opsEventText } from "./ops.ts";

export const MANUAL_VERSION = "retained-card/v1";

// Picker order: Bengali first (the first community we built with), then the three largest foreign-worker
// nationalities in Nagasaki Prefecture (Vietnam, Indonesia, Nepal; end-Oct 2025), then English and easy Japanese.
export const LANGS = ["bn", "vi", "id", "ne", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];
export type L10n = Record<Lang, string>;
export type Fact = "unknown" | "yes" | "no";
export type Status = "received" | "review" | "field" | "guided";
export type FieldState = "none" | "requested" | "on_way" | "arrived" | "done";

export const LANG_NAME: L10n = { bn: "বাংলা", vi: "Tiếng Việt", id: "Bahasa Indonesia", ne: "नेपाली", en: "English", ja: "やさしい日本語" };
export const LANG_LOCALE: L10n = { bn: "bn-BD", vi: "vi-VN", id: "id-ID", ne: "ne-NP", en: "en-US", ja: "ja-JP" };
// Soniox has no Nepali speech recognition, so Nepali callers type (the agent cannot transcribe them).
export const VOICE_LANGS: readonly Lang[] = ["bn", "vi", "id", "en", "ja"];
// A station row added before a language existed falls back to its English text.
export const pick = (v: unknown, lang: Lang): string => (v && typeof v === "object" ? (v as L10n)[lang] ?? (v as L10n).en ?? "" : "");

export const STATUS: Record<Status, L10n> = {
  received: { ja: "そうだんを うけつけました", bn: "আপনার অনুরোধ পাওয়া গেছে", en: "Request received", vi: "Đã nhận yêu cầu của bạn", id: "Permintaan Anda sudah diterima", ne: "तपाईंको अनुरोध प्राप्त भयो" },
  review: { ja: "係の 人が しらべて います", bn: "একজন কর্মী দেখছেন", en: "An operator is reviewing", vi: "Nhân viên đang xem xét", id: "Petugas sedang memeriksa", ne: "एक जना कर्मचारीले हेर्दै हुनुहुन्छ" },
  field: { ja: "けいびの 人に ATM に 来て たしかめるよう たのみました", bn: "ঘটনাস্থলে পরীক্ষার অনুরোধ পাঠানো হয়েছে", en: "Site check requested", vi: "Đã yêu cầu kiểm tra tại chỗ", id: "Pemeriksaan di lokasi sudah diminta", ne: "घटनास्थलमा जाँचको अनुरोध गरियो" },
  guided: { ja: "つぎに することを いっしょに たしかめました", bn: "নির্দেশনা নিশ্চিত হয়েছে", en: "Guidance confirmed", vi: "Đã xác nhận hướng dẫn", id: "Panduan sudah dikonfirmasi", ne: "निर्देशन पुष्टि भयो" },
};

// Machine faults the monitoring side can report. The device button sends DEVICE_FAULT.
export const FAULTS: Record<string, L10n> = {
  card_retained: {
    ja: "ATM を つかった あと、カードが でてこない", bn: "লেনদেনের পরে কার্ড বের হয়নি", en: "Card not returned after the transaction",
    vi: "Thẻ không được trả ra sau giao dịch", id: "Kartu tidak keluar setelah transaksi", ne: "कारोबारपछि कार्ड बाहिर आएन",
  },
  ...FAULT_NAMES,
  ...OPS_FAULTS,
};
export const DEVICE_FAULT = "card_retained";
export const isFault = (k: unknown): k is string => typeof k === "string" && Object.hasOwn(FAULTS, k);
// A pack's situations (fault codes), in catalogue order; the ATM's are every code no other pack owns.
export const situationsOf = (pack: PackId) => Object.keys(FAULTS).filter((f) => packOfFault(f) === pack);
// A pack's approved replies, in catalogue order (the rule names the pack; the ATM's default).
export const intentsOf = (pack: PackId) => Object.keys(REPLIES).filter((k) => (REPLY_RULES[k]?.pack ?? "atm") === pack);

export const REMOTE_RELEASE: Record<string, string> = { failed: "失敗", released: "成功" };

const UNKNOWN: L10n = { ja: "わからない", bn: "জানা নেই", en: "Unknown", vi: "Không rõ", id: "Tidak diketahui", ne: "थाहा छैन" };

// Read-back of the caller's own statements. A missing fact is "unknown", never a negative.
export const FACTS = {
  card_back: {
    question: { bn: "কার্ড কি ফেরত এসেছে?", en: "Did the card come back out?", ja: "カードは でてきましたか？", vi: "Thẻ đã được trả ra chưa?", id: "Apakah kartu sudah keluar?", ne: "के कार्ड बाहिर आयो?" },
    yes: { ja: "カードは でてきた と ききました", bn: "কার্ড ফেরত এসেছে", en: "The card came back", vi: "Thẻ đã được trả ra", id: "Kartu sudah keluar", ne: "कार्ड बाहिर आयो" },
    no: { ja: "カードは でてこなかった と ききました", bn: "কার্ড ফেরত আসেনি", en: "The card did not come back", vi: "Thẻ chưa được trả ra", id: "Kartu tidak keluar", ne: "कार्ड बाहिर आएन" },
    unknown: UNKNOWN,
  },
  cash_received: {
    question: { bn: "টাকা কি পেয়েছেন?", en: "Did you get the cash?", ja: "お金は うけとりましたか？", vi: "Bạn đã nhận được tiền chưa?", id: "Apakah Anda sudah menerima uangnya?", ne: "के तपाईंले पैसा पाउनुभयो?" },
    yes: { ja: "お金は うけとった と ききました", bn: "টাকা পেয়েছেন", en: "The cash was received", vi: "Đã nhận được tiền", id: "Uang sudah diterima", ne: "पैसा पाउनुभयो" },
    no: { ja: "お金は うけとって いない と ききました", bn: "টাকা পাননি", en: "The cash was not received", vi: "Chưa nhận được tiền", id: "Uang tidak diterima", ne: "पैसा पाउनुभएन" },
    unknown: UNKNOWN,
  },
} as const;
export type FactKey = keyof typeof FACTS;
// The same facts in formal Japanese for staff screens, records and hand-offs (callers see the easy-Japanese FACTS above).
export const FACT_STAFF: Record<FactKey, Record<Fact, string>> = {
  card_back: { yes: "カードは戻ってきたとのこと", no: "カードは戻ってきていないとのこと", unknown: "不明" },
  cash_received: { yes: "現金は受け取ったとのこと（本人申告）", no: "現金は受け取っていないとのこと（本人申告）", unknown: "不明" },
};
export const FACT_KEYS = Object.keys(FACTS) as FactKey[];
export const ANSWER: Record<Fact, L10n> = {
  yes: { bn: "হ্যাঁ", en: "Yes", ja: "はい", vi: "Có", id: "Ya", ne: "हो" },
  no: { bn: "না", en: "No", ja: "いいえ", vi: "Không", id: "Tidak", ne: "होइन" },
  unknown: { bn: "জানি না", en: "Not sure", ja: "わからない", vi: "Không chắc", id: "Tidak tahu", ne: "थाहा छैन" },
};
export const SENTENCE_SEP: L10n = { bn: "। ", en: ". ", ja: "。", vi: ". ", id: ". ", ne: "। " };

export const FIELD_STATE: Record<FieldState, L10n> = {
  none: { ja: "まだ たのんで いません", bn: "", en: "", vi: "", id: "", ne: "" },
  requested: {
    ja: "けいびの 人に ATM に 来て たしかめるよう たのみました", bn: "নিরাপত্তাকর্মী পাঠানোর অনুরোধ করা হয়েছে", en: "A security staff visit was requested",
    vi: "Đã yêu cầu nhân viên bảo vệ đến", id: "Petugas keamanan sudah diminta datang", ne: "सुरक्षाकर्मी पठाउन अनुरोध गरियो",
  },
  on_way: {
    ja: "けいびの 人が こちらに むかって います", bn: "নিরাপত্তাকর্মী আসছেন", en: "Security staff are on the way",
    vi: "Nhân viên bảo vệ đang đến", id: "Petugas keamanan sedang dalam perjalanan", ne: "सुरक्षाकर्मी आउँदै हुनुहुन्छ",
  },
  arrived: {
    ja: "けいびの 人が つきました", bn: "নিরাপত্তাকর্মী পৌঁছেছেন", en: "Security staff have arrived",
    vi: "Nhân viên bảo vệ đã đến", id: "Petugas keamanan sudah tiba", ne: "सुरक्षाकर्मी आइपुग्नुभयो",
  },
  done: {
    ja: "けいびの 人の しごとは おわりました。カードは 銀行の きまりに そって あつかいます", bn: "ঘটনাস্থলের কাজ শেষ। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে", en: "On-site work is finished. The card is handled by the bank's own procedure",
    vi: "Công việc tại chỗ đã xong. Thẻ được xử lý theo quy trình riêng của ngân hàng", id: "Pekerjaan di lokasi sudah selesai. Kartu ditangani sesuai prosedur bank sendiri", ne: "घटनास्थलको काम सकियो। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ",
  },
};

// The guard's own estimate. Options the guard can pick; empty = unknown.
export const ETA_OPTIONS = ["10-20", "20-30", "30-45", "45-60", ""];
const digitsIn = (set: string) => (s: string) => s.replace(/[0-9]/g, (d) => set[Number(d)]);
export const toBn = digitsIn("০১২৩৪৫৬৭৮৯");
export const toNe = digitsIn("०१२३४५६७८९");
export function etaText(eta: string | null | undefined, lang: Lang): string {
  if (!eta) return {
    ja: "いつ つくかは まだ わかりません", bn: "আনুমানিক সময় এখনো জানা নেই", en: "Arrival time is not known yet",
    vi: "Chưa biết khi nào nhân viên bảo vệ đến", id: "Waktu kedatangan belum diketahui", ne: "आइपुग्ने समय अझै थाहा छैन",
  }[lang];
  const range = eta.replace("-", "–");
  return {
    ja: `あと ${eta.replace("-", "〜")}分くらいで つきます（けいびの 人の よそうです。かわる ことも あります）`,
    bn: `আনুমানিক ${toBn(eta)} মিনিট (কর্মীর নিজের অনুমান, বদলাতে পারে)`,
    en: `About ${range} minutes (the guard's own estimate; it may change)`,
    vi: `Khoảng ${range} phút (ước tính của nhân viên bảo vệ, có thể thay đổi)`,
    id: `Sekitar ${range} menit (perkiraan petugas sendiri, bisa berubah)`,
    ne: `करिब ${toNe(range)} मिनेट (सुरक्षाकर्मीको आफ्नै अनुमान, फरक पर्न सक्छ)`,
  }[lang];
}

// Slots are filled on the server from the station row, per language.
export type ReplySlots = { branch?: L10n; hours?: L10n };
// needsHeld: the wording says the card is still inside, so the server sends it only when the caller
// confirmed the card did not come back and no remote release succeeded.
type Reply = { code: string; title: string; text: (s: ReplySlots) => L10n; offersChoice?: boolean; needsHeld?: boolean };
export const REPLIES: Record<string, Reply> = {
  HELD_WAIT_OR_LEAVE: {
    code: "A-3",
    title: "機械障害によりカードを保管中（待つ／帰るを選択）",
    offersChoice: true,
    needsHeld: true,
    text: (s) => ({
      ja: `カードは ATM の 中に あります。ここで まっても、かえっても いいです。かえった ときは 銀行から れんらくします。カードは 銀行の きまりに そって あつかいます。${s.branch?.ja} の まどぐちでも きけます。あいて いるのは ${s.hours?.ja} です。`,
      bn: `আপনার কার্ড মেশিনের ভেতরে আছে। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। ${pick(s.branch, "bn")}-এর কাউন্টারেও (${pick(s.hours, "bn")}) জানতে পারবেন।`,
      en: `Your card is inside the machine. You can wait here, or you can leave. If you leave, the bank will contact you. The card is handled under the bank's own procedure. The ${pick(s.branch, "en")} counter (${pick(s.hours, "en")}) can also help.`,
      vi: `Thẻ của bạn đang ở trong máy. Bạn có thể chờ ở đây, hoặc có thể ra về. Nếu bạn ra về, ngân hàng sẽ liên lạc với bạn. Thẻ được xử lý theo quy trình riêng của ngân hàng. Quầy giao dịch của ${pick(s.branch, "vi")} (${pick(s.hours, "vi")}) cũng có thể giúp bạn.`,
      id: `Kartu Anda ada di dalam mesin. Anda bisa menunggu di sini, atau Anda bisa pulang. Jika Anda pulang, bank akan menghubungi Anda. Kartu ditangani sesuai prosedur bank sendiri. Loket ${pick(s.branch, "id")} (${pick(s.hours, "id")}) juga dapat membantu.`,
      ne: `तपाईंको कार्ड मेसिनभित्र छ। तपाईं यहीँ पर्खन सक्नुहुन्छ, वा जान सक्नुहुन्छ। जानुभयो भने बैंकले तपाईंलाई सम्पर्क गर्नेछ। कार्डको विषय बैंकको आफ्नै प्रक्रियाअनुसार हुन्छ। ${pick(s.branch, "ne")} को काउन्टरमा पनि सोध्न सक्नुहुन्छ (${pick(s.hours, "ne")})।`,
    }),
  },
  HANDSET: {
    code: "A-6",
    title: "ATMの受話器で状況を確認",
    text: () => ({
      ja: "いま どうなって いるか ききたい ときは、ATM に ついて いる 電話を つかって ください。",
      bn: "এখানে পরিস্থিতির খবর জানতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
      en: "To ask for an update here, use the handset built into the ATM.",
      vi: "Nếu muốn hỏi tình hình tại đây, hãy dùng ống nghe gắn trên máy ATM.",
      id: "Untuk menanyakan perkembangan di sini, gunakan gagang telepon yang terpasang di ATM.",
      ne: "यहाँ अवस्थाबारे सोध्न चाहनुहुन्छ भने एटीएममा जडान गरिएको फोनको रिसिभर प्रयोग गर्नुहोस्।",
    }),
  },
  OFFICIAL_CHANNEL: {
    code: "A-7",
    title: "銀行の公式窓口へ",
    text: () => ({
      ja: "銀行に ききたい ときは、銀行が きめた まどぐちに れんらくして ください。",
      bn: "ব্যাংকের সঙ্গে যোগাযোগ করতে হলে ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
      en: "To contact the bank, use the bank's official contact channel.",
      vi: "Để liên hệ với ngân hàng, hãy dùng kênh liên hệ chính thức của ngân hàng.",
      id: "Untuk menghubungi bank, gunakan saluran kontak resmi bank.",
      ne: "बैंकसँग सम्पर्क गर्न बैंकको आधिकारिक सम्पर्क माध्यम प्रयोग गर्नुहोस्।",
    }),
  },
  ...FAULT_REPLIES,
};

export const replyOf = (intent: unknown): Reply | undefined =>
  typeof intent === "string" && Object.hasOwn(REPLIES, intent) ? REPLIES[intent] : undefined;
export const CHOICE_INTENTS = Object.keys(REPLIES).filter((k) => REPLIES[k].offersChoice);

export const ACTOR: Record<string, string> = { device: "機械", caller: "お客様", agent: "AI", operator: "担当者", field: "警備員", system: "システム", bot: "Ichido Bot" };

// One-tap rating after a guided case closes: 1 = hard, 2 = okay, 3 = good. Faces only, no free text.
export const RATINGS = [3, 2, 1] as const;
export const RATING: Record<number, L10n> = {
  3: { bn: "ভালো", en: "Good", ja: "よかった", vi: "Tốt", id: "Baik", ne: "राम्रो" },
  2: { bn: "মোটামুটি", en: "Okay", ja: "ふつう", vi: "Bình thường", id: "Biasa saja", ne: "ठिकै" },
  1: { bn: "কঠিন ছিল", en: "Hard", ja: "むずかしかった", vi: "Khó khăn", id: "Sulit", ne: "गाह्रो भयो" },
};
const RATING_JA: Record<number, string> = { 3: "よかった", 2: "ふつう", 1: "むずかしかった" };

// Timeline sentences for staff, rendered from event codes and data. fault: the case's situation, so a non-ATM case
// names its own responder instead of the security company.
export function eventText(kind: string, d: Record<string, string | undefined>, fault?: string): string {
  const pack = packOfFault(fault);
  if (pack !== "atm") {
    const who = PACKS[pack].responder.staff;
    if (kind === "dispatch" || kind === "redispatch") return `${who}へ${kind === "dispatch" ? "" : "再"}依頼（${d.assignee ?? ""}）`;
    if (kind === "confirmed") return "お客様が申告（選択肢）を確認";
    if (kind === "field") return `${packStaffField(pack)![(d.state ?? "none") as FieldState]}${d.state === "on_way" ? `（目安 ${d.eta ? d.eta.replace("-", "〜") + "分" : "未定"}）` : ""}`;
  }
  switch (kind) {
    case "fault": return `障害通知：${isFault(d.fault) ? STAFF_JA.fault[d.fault] : "不明な障害"}${d.source === "simulator" ? "（手動登録）" : ""}`;
    case "paired": return `お客様が多言語窓口に接続（${LANG_NAME[d.lang as Lang] ?? d.lang}）`;
    case "claimed": return "担当者が対応を開始";
    case "escalated": return `エスカレーション（レベル${d.level}）：${DESK.escalationReason[d.reason ?? ""] ?? "対応期限を超過"}`;
    case "remote_release": return `遠隔解除を試行 → ${REMOTE_RELEASE[d.result ?? ""] ?? d.result}`;
    case "confirmed": return `お客様が内容を確認（${FACT_STAFF.card_back[(d.card_back ?? "unknown") as Fact]}／${FACT_STAFF.cash_received[(d.cash_received ?? "unknown") as Fact]}）`;
    case "reply": return `承認済み返答を送信：${replyOf(d.intent)?.code ?? ""} ${replyOf(d.intent)?.title ?? d.intent}`;
    case "caller_reset": return "お客様の接続をリセット（新しいコードが必要）";
    case "abandoned": return "案件を終了（お客様と連絡が取れず）";
    case "field": return `${STAFF_JA.field[(d.state ?? "none") as FieldState]}${d.state === "on_way" ? `（目安 ${d.eta ? d.eta.replace("-", "〜") + "分" : "未定"}）` : ""}`;
    case "choice": return d.choice === "wait" ? "お客様：現地で待つ" : "お客様：帰宅し銀行からの連絡を待つ";
    case "teachback": return "お客様が次の手順を自分の言葉で説明";
    case "human": return "お客様が担当者との会話を希望";
    case "clarify": return "理解が不十分 → 再案内";
    case "suggested": return `AI提案（${d.model ?? "Gemini"}）：${replyOf(d.intent)?.code ?? "—"}${String(d.dispatch) === "true" ? `・${d.guard ?? "警備員"}へ依頼` : ""}（判断は担当者）`;
    case "handoff": return `引継票を発行（${HANDOFF.recipient[d.recipient ?? ""] ?? d.recipient}宛）`;
    case "handoff_viewed": return `引継票が閲覧されました（${HANDOFF.recipient[d.recipient ?? ""] ?? d.recipient}宛）`;
    case "handoff_revoked": return `引継票を失効（${HANDOFF.recipient[d.recipient ?? ""] ?? d.recipient}宛）`;
    case "lang_changed": return `お客様が言語を変更（${LANG_NAME[d.from as Lang] ?? d.from ?? "—"} → ${LANG_NAME[d.to as Lang] ?? d.to}）`;
    case "rated": return `お客様の評価：${RATING_JA[Number(d.rating)] ?? d.rating}`;
    case "guided": return "案内を確認しました（お客様が次の手順を説明）";
    case "bot_prepared": return BOT.prepared(replyOf(d.intent)?.code ?? "—");
    case "bot_routed": case "bot_remind": case "bot_closed": return BOT.event(kind, d);
    default: return accessEventText(kind, d) ?? faultEventText(kind, d) ?? REVIEW.events[kind] ?? opsEventText(kind, d) ?? kind;
  }
}

// After-call record: one sentence per piece of evidence that actually exists. A non-ATM case (fault) lists the
// caller's own taps and names the pack's responder.
export function summaryDraft(x: { card_back: Fact; cash_received: Fact; remote_release: string | null; dispatched: boolean; choice: string | null; fault?: string; flags?: string[] }): string {
  const pack = packOfFault(x.fault);
  if (pack !== "atm") return [
    x.flags?.length && `お客様の申告：${x.flags.map((f) => CALLER_FLAGS[f]?.staff ?? f).join("、")}。`,
    x.dispatched && `${PACKS[pack].responder.staff}へ対応を依頼。`,
    "お客様が次の行動を自分の言葉で説明した。",
  ].filter(Boolean).join("");
  return [
    x.card_back !== "unknown" && `${FACT_STAFF.card_back[x.card_back]}。`,
    x.cash_received !== "unknown" && `${FACT_STAFF.cash_received[x.cash_received]}。`,
    x.remote_release && `遠隔解除${REMOTE_RELEASE[x.remote_release]}。`,
    x.dispatched && "警備会社へ現地確認を依頼。",
    x.choice && `${eventText("choice", { choice: x.choice })}。`,
    "お客様が次の行動を自分の言葉で説明した。",
  ].filter(Boolean).join("");
}

// Cumulative: each stage counts only cases that passed the previous one.
export const FUNNEL: { key: string; ja: string; en: string }[] = [
  { key: "received", ja: "受付", en: "Received" },
  { key: "claimed", ja: "担当", en: "Claimed" },
  { key: "confirmed", ja: "申告確認", en: "Caller confirmed" },
  { key: "replied", ja: "返答送信", en: "Reply sent" },
  { key: "guided", ja: "案内確認", en: "Guidance confirmed" },
];

const HANDSET_HINT: L10n = {
  bn: "এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
  en: "use the handset built into the ATM.",
  ja: "ATM の 受話器を つかって ください。",
  vi: "hãy dùng ống nghe gắn trên máy ATM.",
  id: "gunakan gagang telepon yang terpasang di ATM.",
  ne: "एटीएममा जडान गरिएको फोनको रिसिभर प्रयोग गर्नुहोस्।",
};

export const UI = {
  language: { bn: "ভাষা", en: "Language", ja: "ことば", vi: "Ngôn ngữ", id: "Bahasa", ne: "भाषा" },
  aiNotice: {
    bn: "আমি একটি AI সহকারী। আপনার কথা জাপানি অপারেটরের কাছে পৌঁছে দেব। সিদ্ধান্ত নেবেন একজন মানুষ।",
    en: "I'm an AI assistant. I pass what you say to a Japanese operator. A person makes every decision.",
    ja: "わたしは AI です。あなたの 話を 日本語を 話す 係の 人に つたえます。どうするかは 人が 決めます。",
    vi: "Tôi là trợ lý AI. Tôi chuyển lời bạn nói đến nhân viên trực người Nhật. Mọi quyết định đều do con người đưa ra.",
    id: "Saya asisten AI. Saya menyampaikan apa yang Anda katakan kepada petugas berbahasa Jepang. Semua keputusan diambil oleh manusia.",
    ne: "म एक AI सहायक हुँ। तपाईंले भनेको कुरा म जापानी कर्मचारीसम्म पुर्‍याउँछु। हरेक निर्णय मानिसले नै गर्छन्।",
  },
  neverAsk: {
    bn: "আমি কখনো PIN, কার্ড নম্বর, অ্যাকাউন্ট নম্বর বা আইডি নম্বর জিজ্ঞাসা করব না।",
    en: "I will never ask for your PIN, card number, account number or ID number.",
    ja: "暗証番号（あんしょうばんごう）は ききません。カードや 銀行の こうざの 番号、身分を しめす ものの 番号も ききません。",
    vi: "Tôi sẽ không bao giờ hỏi mã PIN, số thẻ, số tài khoản hay số giấy tờ tùy thân của bạn.",
    id: "Saya tidak akan pernah menanyakan PIN, nomor kartu, nomor rekening, atau nomor identitas Anda.",
    ne: "म कहिल्यै तपाईंको PIN, कार्ड नम्बर, खाता नम्बर वा परिचयपत्रको नम्बर सोध्दिनँ।",
  },
  whatHappened: {
    bn: "কী হয়েছে, নিজের ভাষায় লিখুন", en: "Tell us what happened, in your own words", ja: "なにが あったか 書いてください",
    vi: "Hãy kể điều đã xảy ra, bằng lời của bạn", id: "Ceritakan apa yang terjadi, dengan kata-kata Anda sendiri", ne: "के भयो, आफ्नै शब्दमा लेख्नुहोस्",
  },
  understood: { bn: "আমি যা বুঝেছি", en: "What I understood", ja: "わかったこと", vi: "Những gì tôi hiểu", id: "Yang saya pahami", ne: "मैले बुझेको कुरा" },
  confirm: {
    bn: "হ্যাঁ, ঠিক আছে — পাঠান", en: "Yes, that's right — send", ja: "はい、これで おくる",
    vi: "Đúng rồi — gửi đi", id: "Ya, sudah benar — kirim", ne: "हो, ठीक छ — पठाउनुहोस्",
  },
  unsure: {
    bn: "আমি ঠিক বুঝতে পারিনি। নিচের প্রশ্নগুলোর উত্তর বেছে নিন।",
    en: "I wasn't sure what you meant. Please choose the answers below.",
    ja: "よく わかりませんでした。下の しつもんに こたえて ください。",
    vi: "Tôi chưa hiểu rõ ý bạn. Hãy chọn câu trả lời bên dưới.",
    id: "Saya kurang yakin maksud Anda. Silakan pilih jawaban di bawah.",
    ne: "मैले राम्ररी बुझिनँ। तलका प्रश्नहरूको उत्तर छान्नुहोस्।",
  },
  send: { bn: "পাঠান", en: "Send", ja: "おくる", vi: "Gửi", id: "Kirim", ne: "पठाउनुहोस्" },
  numbersWithheld: {
    bn: "এখানে নম্বর মনে হচ্ছে, তাই পাঠানো হয়নি। নম্বর ছাড়া আবার লিখুন।",
    en: "That looked like a number, so it was not sent. Please try again without numbers.",
    ja: "番号のような ものが あったので おくっていません。番号なしで もう一度 おねがいします。",
    vi: "Nội dung có vẻ là một dãy số nên chưa được gửi. Hãy viết lại mà không có số.",
    id: "Itu tampak seperti nomor, jadi tidak dikirim. Silakan coba lagi tanpa angka.",
    ne: "यसमा नम्बर जस्तो देखियो, त्यसैले पठाइएन। नम्बर नराखी फेरि लेख्नुहोस्।",
  },
  approved: {
    bn: "অপারেটর · ব্যাংকের অনুমোদিত বার্তা", en: "Operator · the bank's approved message", ja: "係の 人からの おしらせ（銀行が きめた 文）",
    vi: "Nhân viên · tin nhắn đã được ngân hàng duyệt", id: "Petugas · pesan resmi dari bank", ne: "कर्मचारी · बैंकले स्वीकृत गरेको सन्देश",
  },
  listen: { bn: "শুনুন", en: "Listen", ja: "きく", vi: "Nghe", id: "Dengarkan", ne: "सुन्नुहोस्" },
  waitOrLeave: { bn: "আপনি কী করবেন?", en: "What would you like to do?", ja: "どうしますか？", vi: "Bạn muốn làm gì?", id: "Apa yang ingin Anda lakukan?", ne: "तपाईं के गर्न चाहनुहुन्छ?" },
  wait: { bn: "অপেক্ষা করব", en: "I'll wait", ja: "まつ", vi: "Tôi sẽ chờ", id: "Saya akan menunggu", ne: "म पर्खन्छु" },
  leave: { bn: "চলে যাব", en: "I'll leave", ja: "かえる", vi: "Tôi sẽ ra về", id: "Saya akan pulang", ne: "म जान्छु" },
  teachBack: {
    bn: "এরপর কী করবেন, নিজের কথায় বলবেন?", en: "In your own words, what will you do next?", ja: "つぎに どうしますか。じぶんの ことばで おしえてください。",
    vi: "Bằng lời của bạn, tiếp theo bạn sẽ làm gì?", id: "Dengan kata-kata Anda sendiri, apa yang akan Anda lakukan selanjutnya?", ne: "अब तपाईं के गर्नुहुन्छ? आफ्नै शब्दमा भन्नुहोस्।",
  },
  teachBackSent: {
    bn: "পাঠানো হয়েছে — অপারেটর দেখছেন", en: "Sent — the operator is checking", ja: "おくりました。係の 人が かくにん しています",
    vi: "Đã gửi — nhân viên đang kiểm tra", id: "Terkirim — petugas sedang memeriksa", ne: "पठाइयो — कर्मचारीले हेर्दै हुनुहुन्छ",
  },
  clarify: {
    bn: "যে অংশটি বুঝতে অসুবিধা হয়েছে, সেটি কর্মীকে আবার জিজ্ঞেস করতে পারেন।", en: "You can ask the operator again about anything that is unclear.", ja: "わからない ところは 係の 人に もう一度 きけます。",
    vi: "Bạn có thể hỏi lại nhân viên về bất cứ điều gì chưa rõ.", id: "Anda bisa bertanya lagi kepada petugas tentang hal yang belum jelas.", ne: "नबुझेको कुरा कर्मचारीलाई फेरि सोध्न सक्नुहुन्छ।",
  },
  human: {
    bn: "এখনই একজন মানুষের সাথে কথা বলুন", en: "Talk to a person now", ja: "人と はなす",
    vi: "Nói chuyện với nhân viên ngay", id: "Bicara dengan petugas sekarang", ne: "अहिले नै मानिससँग कुरा गर्नुहोस्",
  },
  humanAsked: {
    bn: `অপারেটরকে জানানো হয়েছে। এখনই কথা বলতে চাইলে ${HANDSET_HINT.bn}`,
    en: `The operator has been told. To talk now, ${HANDSET_HINT.en}`,
    ja: `係の 人に つたえました。いま はなしたい ときは ${HANDSET_HINT.ja}`,
    vi: `Đã báo cho nhân viên. Nếu muốn nói chuyện ngay, ${HANDSET_HINT.vi}`,
    id: `Petugas sudah diberi tahu. Untuk bicara sekarang, ${HANDSET_HINT.id}`,
    ne: `कर्मचारीलाई जानकारी दिइयो। अहिले नै कुरा गर्न ${HANDSET_HINT.ne}`,
  },
  rateTitle: {
    bn: "আজকের সাহায্য কেমন ছিল?", en: "How was the help today?", ja: "きょうの たすけは どうでしたか？",
    vi: "Sự hỗ trợ hôm nay thế nào?", id: "Bagaimana bantuan hari ini?", ne: "आजको सहयोग कस्तो लाग्यो?",
  },
  rateThanks: {
    bn: "ধন্যবাদ। আপনার উত্তর সংরক্ষিত হয়েছে।", en: "Thank you. Your answer has been saved.", ja: "こたえて くれて ありがとう。あなたの こたえを 記録しました。",
    vi: "Cảm ơn bạn. Câu trả lời của bạn đã được lưu.", id: "Terima kasih. Jawaban Anda sudah disimpan.", ne: "धन्यवाद। तपाईंको उत्तर सुरक्षित गरियो।",
  },
  showStaff: {
    bn: "জাপানি কর্মীকে দেখান", en: "Show to staff", ja: "係の 人に みせる",
    vi: "Cho nhân viên người Nhật xem", id: "Tunjukkan kepada petugas", ne: "जापानी कर्मचारीलाई देखाउनुहोस्",
  },
  caseNo: { bn: "কেস নম্বর", en: "Case", ja: "この そうだんの 番号", vi: "Mã hồ sơ", id: "Nomor kasus", ne: "केस नम्बर" },
  waiting: {
    bn: `অপারেটর এখনো আপনার বিষয়টি দেখছেন। জরুরি হলে ${HANDSET_HINT.bn}`,
    en: `The operator is still looking at your case. If it is urgent, ${HANDSET_HINT.en}`,
    ja: `係の 人が まだ かくにん しています。いそぐ ときは ${HANDSET_HINT.ja}`,
    vi: `Nhân viên vẫn đang xem trường hợp của bạn. Nếu gấp, ${HANDSET_HINT.vi}`,
    id: `Petugas masih memeriksa kasus Anda. Jika mendesak, ${HANDSET_HINT.id}`,
    ne: `कर्मचारीले अझै तपाईंको विषय हेर्दै हुनुहुन्छ। जरुरी भए ${HANDSET_HINT.ne}`,
  },
  notConnected: {
    bn: "এই ফোনটি কোনো কেসের সাথে যুক্ত নয়। অপারেটরের কাছে কোড চেয়ে Help Point আবার স্ক্যান করুন।",
    en: "This phone is not connected to a case. Ask the operator for a code and scan the Help Point again.",
    ja: "この 電話は 案件に つながって いません。係の 人に コードを きいてください。",
    vi: "Điện thoại này chưa được kết nối với hồ sơ nào. Hãy xin mã từ nhân viên rồi quét lại Help Point.",
    id: "Ponsel ini belum terhubung ke kasus apa pun. Mintalah kode kepada petugas, lalu pindai Help Point lagi.",
    ne: "यो फोन कुनै केससँग जोडिएको छैन। कर्मचारीसँग कोड मागेर Help Point फेरि स्क्यान गर्नुहोस्।",
  },
  // The prefecture's desk is confirmed to cover Vietnamese; Indonesian and Nepali are not claimed until checked.
  helpDesk: {
    bn: "আরও সাহায্য: নাগাসাকি প্রিফেকচারের বিদেশি বাসিন্দা পরামর্শ কেন্দ্র — বাংলাসহ ২২টি ভাষায়, সোম–শুক্র ৯:০০–১৬:০০ (জাপান সময়)।",
    en: "More help: Nagasaki Prefecture's foreign residents' consultation desk — 22 languages including Bengali, weekdays 9:00–16:00 (Japan time).",
    ja: "長崎県には 外国から 来た 人の そうだん まどぐちも あります。ベンガル語など 22の ことばで 話せます。げつようびから きんようびの 9時から 16時までです（日本の 時間）。",
    vi: "Hỗ trợ thêm: Quầy tư vấn cho người nước ngoài của tỉnh Nagasaki — 22 ngôn ngữ, có tiếng Việt, thứ Hai–thứ Sáu 9:00–16:00 (giờ Nhật).",
    id: "Bantuan lain: Layanan konsultasi warga asing Prefektur Nagasaki — 22 bahasa, Senin–Jumat 9:00–16:00 (waktu Jepang).",
    ne: "थप सहयोग: नागासाकी प्रिफेक्चरको विदेशी बासिन्दा परामर्श केन्द्र — २२ भाषामा, सोम–शुक्र ९:००–१६:०० (जापान समय)।",
  },
} satisfies Record<string, L10n>;

export * from "./staff.ts";
export * from "./review.ts";
export * from "./numbers.ts";
export * from "./home.ts";
export * from "./enterprise.ts";
export * from "./mobile.ts";
export * from "./access.ts";
import { accessEventText } from "./access.ts";
export * from "./faults.ts";
export * from "./packs/index.ts";
export * from "./ops.ts";
export * from "./auth.ts";
export * from "./mail.ts";
export * from "./alerts.ts";

// Pairing page behind the Help Point sticker.
export const STATION = {
  title: {
    bn: "সহায়তা কেন্দ্রের সাথে যুক্ত হন", en: "Connect to the help desk", ja: "まどぐちに つなぐ",
    vi: "Kết nối với quầy hỗ trợ", id: "Hubungkan ke layanan bantuan", ne: "सहायता केन्द्रसँग जोडिनुहोस्",
  },
  code: {
    bn: "অপারেটর যে কোডটি বলেছেন", en: "The code the operator gave you", ja: "係の 人が いった コード",
    vi: "Mã nhân viên đã đưa cho bạn", id: "Kode yang diberikan petugas", ne: "कर्मचारीले दिएको कोड",
  },
  go: { bn: "যুক্ত হন", en: "Connect", ja: "つなぐ", vi: "Kết nối", id: "Hubungkan", ne: "जोडिनुहोस्" },
  why: {
    bn: "এই স্টিকারে কোনো ব্যক্তিগত তথ্য নেই। অপারেটরের দেওয়া কোড ছাড়া কেউ আপনার কেস দেখতে পারবে না।",
    en: "This sticker holds no personal information. Nobody can open your case without the code the operator gives you.",
    ja: "この シールには あなたの 名前や そうだんの 中身は 書いて ありません。係の 人が つたえる コードが ないと そうだんの 中身は 見られません。",
    vi: "Nhãn dán này không chứa thông tin cá nhân. Không ai mở được hồ sơ của bạn nếu không có mã do nhân viên đưa.",
    id: "Stiker ini tidak berisi informasi pribadi. Tidak ada yang bisa membuka kasus Anda tanpa kode dari petugas.",
    ne: "यो स्टिकरमा कुनै व्यक्तिगत जानकारी छैन। कर्मचारीले दिएको कोडबिना कसैले पनि तपाईंको केस खोल्न सक्दैन।",
  },
  staffSession: {
    bn: "এই ব্রাউজারে একজন কর্মী সাইন ইন করা আছেন। কলারের জন্য একটি প্রাইভেট উইন্ডো ব্যবহার করুন।",
    en: "A staff member is signed in on this browser. Use a private window for the caller.",
    ja: "いまは 係の 人として つながって います。そうだんする 人は、見た 記録を のこさない 新しい 画面を ひらいて ください。",
    vi: "Một nhân viên đang đăng nhập trên trình duyệt này. Hãy dùng cửa sổ riêng tư cho người gọi.",
    id: "Seorang petugas sedang masuk di browser ini. Gunakan jendela pribadi untuk penelepon.",
    ne: "यो ब्राउजरमा एक जना कर्मचारी साइन इन हुनुहुन्छ। सहायता माग्ने व्यक्तिका लागि प्राइभेट विन्डो प्रयोग गर्नुहोस्।",
  },
  signOutStaff: {
    bn: "কর্মীকে সাইন আউট করে চালিয়ে যান", en: "Sign the staff member out and continue", ja: "係の 人の 接続を おえて つづける",
    vi: "Đăng xuất nhân viên và tiếp tục", id: "Keluarkan akun petugas dan lanjutkan", ne: "कर्मचारीलाई साइन आउट गरेर अगाडि बढ्नुहोस्",
  },
} satisfies Record<string, L10n>;

// Voice intake. Names every service the caller's voice or text can reach.
export const VOICE = {
  start: { bn: "কথা বলুন", en: "Speak", ja: "はなす", vi: "Nói", id: "Bicara", ne: "बोल्नुहोस्" },
  stop: { bn: "থামুন", en: "Stop", ja: "とめる", vi: "Dừng", id: "Berhenti", ne: "रोक्नुहोस्" },
  notice: {
    bn: "কথা বললে আপনার কণ্ঠ LiveKit হয়ে Soniox-এর স্পিচ রিকগনিশনে যায়, আর আমার উত্তর ElevenLabs পড়ে শোনায়। লিখলে লেখা আমাদের সার্ভারে যায় (চালু থাকলে OpenAI-ও)। অপারেটরের সহায়তার জন্য Google Gemini শুধু নিশ্চিত তথ্য দেখে, আপনার কথা নয়। নম্বর বলবেন না।",
    en: "If you speak, your voice goes through LiveKit to Soniox speech recognition, and ElevenLabs reads my replies aloud. If you type, the text goes to our server (and to OpenAI if enabled). Google Gemini helps the operator using only the facts you confirmed, never your words. Please don't say any numbers.",
    ja: "話すと 声は LiveKit を とおって Soniox に とどきます。Soniox が 声を 文字に します。ElevenLabs が こたえを よみます。書いた ことばは わたしたちの 機械に とどきます。設定に よっては OpenAI にも とどきます。係の 人を たすける Google Gemini は、あなたが たしかめた 内容だけを 見ます。あなたの ことばは 見ません。番号は いわないで ください。",
    vi: "Nếu bạn nói, giọng nói của bạn đi qua LiveKit đến dịch vụ nhận dạng giọng nói Soniox, và ElevenLabs đọc to câu trả lời của tôi. Nếu bạn gõ chữ, nội dung được gửi đến máy chủ của chúng tôi (và đến OpenAI nếu được bật). Google Gemini hỗ trợ nhân viên chỉ dựa trên những thông tin bạn đã xác nhận, không bao giờ dùng lời của bạn. Xin đừng nói bất kỳ con số nào.",
    id: "Jika Anda berbicara, suara Anda melewati LiveKit ke pengenalan suara Soniox, dan ElevenLabs membacakan balasan saya. Jika Anda mengetik, teksnya dikirim ke server kami (dan ke OpenAI jika diaktifkan). Google Gemini membantu petugas hanya dengan fakta yang sudah Anda konfirmasi, tidak pernah dengan kata-kata Anda. Mohon jangan menyebutkan angka apa pun.",
    ne: "बोल्नुभयो भने तपाईंको आवाज LiveKit हुँदै Soniox को स्पिच रिकग्निसनमा जान्छ, र ElevenLabs ले मेरो जवाफ पढेर सुनाउँछ। लेख्नुभयो भने लेखिएको कुरा हाम्रो सर्भरमा जान्छ (चालु भएमा OpenAI मा पनि)। कर्मचारीलाई सहयोग गर्न Google Gemini ले तपाईंले पुष्टि गरेका तथ्य मात्र हेर्छ, तपाईंका शब्दहरू होइन। कृपया कुनै पनि नम्बर नभन्नुहोस्।",
  },
  connecting: { bn: "সংযোগ হচ্ছে…", en: "Connecting…", ja: "つないで います…", vi: "Đang kết nối…", id: "Menghubungkan…", ne: "जोडिँदै छ…" },
  hearing: { bn: "শুনছি…", en: "Listening…", ja: "きいています…", vi: "Đang nghe…", id: "Mendengarkan…", ne: "सुन्दै छु…" },
  unavailable: {
    bn: "এখন কণ্ঠ চালু নেই — লিখে বলুন।", en: "Voice is not available now — please type.", ja: "いまは 声が つかえません。書いて ください。",
    vi: "Hiện chưa dùng được giọng nói — hãy gõ chữ.", id: "Suara belum tersedia sekarang — silakan ketik.", ne: "अहिले आवाज उपलब्ध छैन — कृपया लेख्नुहोस्।",
  },
} satisfies Record<string, L10n>;

// Errors a caller can see, by the stable code the server returns.
export const ERRORS: Record<string, L10n> = {
  conflict: {
    bn: "অবস্থা বদলে গেছে — স্ক্রিন আপডেট হয়েছে, আবার দেখুন।", en: "Something changed — the screen has been updated, please check again.", ja: "じょうたいが かわりました。画面を もう一度 みてください。",
    vi: "Đã có thay đổi — màn hình đã được cập nhật, hãy xem lại.", id: "Ada yang berubah — layar sudah diperbarui, silakan periksa lagi.", ne: "अवस्था बदलियो — स्क्रिन अपडेट भयो, फेरि हेर्नुहोस्।",
  },
  forbidden: {
    bn: "এই কেসটি এখন খোলা যাচ্ছে না।", en: "This case cannot be opened now.", ja: "いま この 案件は ひらけません。",
    vi: "Hiện không thể mở hồ sơ này.", id: "Kasus ini tidak bisa dibuka sekarang.", ne: "यो केस अहिले खोल्न सकिँदैन।",
  },
  rate_limited: {
    bn: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।", en: "Too many tries. Please wait a few minutes.", ja: "なんども ためしました。すこし まってから もう一度。",
    vi: "Bạn đã thử quá nhiều lần. Hãy đợi vài phút.", id: "Terlalu banyak percobaan. Silakan tunggu beberapa menit.", ne: "धेरै पटक प्रयास भयो। केही मिनेट पर्खनुहोस्।",
  },
  server: {
    bn: "কিছু একটা ঠিকমতো হয়নি। আবার চেষ্টা করুন।", en: "Something went wrong. Please try again.", ja: "うまく いきませんでした。もう一度 おねがいします。",
    vi: "Đã có lỗi xảy ra. Hãy thử lại.", id: "Terjadi kesalahan. Silakan coba lagi.", ne: "केही गडबड भयो। फेरि प्रयास गर्नुहोस्।",
  },
};
export const errorText = (code: string, lang: Lang) => (Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.server)[lang];

// The caller wording that depends on the case's pack (content/packs): what is never asked, the assistant's limits,
// where to find a person, the responder's state and estimate, and the "field" status. The ATM keeps its own.
export function callerPack(fault: string) {
  const p = contentPack(fault);
  if (!p) return {
    atm: true, neverAsk: UI.neverAsk, scope: undefined as L10n | undefined,
    waiting: (l: Lang) => UI.waiting[l], humanAsked: (l: Lang) => UI.humanAsked[l],
    field: (s: FieldState, l: Lang) => FIELD_STATE[s][l], eta: etaText,
    status: (s: Status, l: Lang) => STATUS[s][l],
  };
  const c = packCaller(p);
  return { atm: false, ...c, status: (s: Status, l: Lang) => (s === "field" ? c.field("requested", l) : STATUS[s][l]) };
}

// The pack's urgent approved reply (the one a red-flag tap allows), shown to the caller at once while such a tap is on:
// the same words the operator would send. Null for no red flag, or a pack without one.
export function urgentText(fault: string, flags: readonly string[], lang: Lang): string | null {
  if (!flags.some(isUrgentTap)) return null;
  const intent = intentsOf(packOfFault(fault)).find((k) => REPLY_RULES[k]?.needsFlags?.some(isUrgentTap));
  return intent ? REPLIES[intent].text({})[lang] : null;
}
// The taps to turn off when the caller turns `flag` on in a one-answer group (who, since when, how much it hurts…).
export function exclusiveOff(flag: string, flags: readonly string[]): string[] {
  const g = CALLER_FLAGS[flag]?.group;
  return g && EXCLUSIVE_GROUPS.has(g) ? flags.filter((f) => f !== flag && CALLER_FLAGS[f]?.group === g) : [];
}

// The sentence the assistant reads back, built from the current draft facts.
export function readBackText(lang: Lang, facts: Record<FactKey, Fact>): string | null {
  const known = FACT_KEYS.filter((k) => facts[k] !== "unknown");
  if (!known.length) return null;
  return `${UI.understood[lang]}: ${known.map((k) => FACTS[k][facts[k]][lang]).join(SENTENCE_SEP[lang])}`;
}
