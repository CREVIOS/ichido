// All user-visible wording lives here. Manual "retained-card/v1" is written for a FICTIONAL bank.
// Operators can send only intents in REPLIES; callers see the pre-written text in their language.
// Bengali and Japanese below are drafts awaiting native review (see README).

export const MANUAL_VERSION = "retained-card/v1";

export const LANGS = ["bn", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];
export type L10n = Record<Lang, string>;
export type Fact = "unknown" | "yes" | "no";
export type Status = "received" | "review" | "field" | "guided";
export type FieldState = "none" | "requested" | "on_way" | "arrived" | "done";

export const LANG_NAME: L10n = { bn: "বাংলা", en: "English", ja: "やさしい日本語" };
export const LANG_LOCALE: L10n = { bn: "bn-BD", en: "en-US", ja: "ja-JP" };
export const pick = (v: unknown, lang: Lang): string => (v && typeof v === "object" ? (v as L10n)[lang] ?? "" : "");

export const STATUS: Record<Status, L10n> = {
  received: { ja: "お問い合わせを受け付けました", bn: "আপনার অনুরোধ পাওয়া গেছে", en: "Request received" },
  review: { ja: "担当者が確認中です", bn: "একজন কর্মী দেখছেন", en: "An operator is reviewing" },
  field: { ja: "現地確認を依頼しました", bn: "ঘটনাস্থলে পরীক্ষার অনুরোধ পাঠানো হয়েছে", en: "Site check requested" },
  guided: { ja: "案内を確認しました", bn: "নির্দেশনা নিশ্চিত হয়েছে", en: "Guidance confirmed" },
};

// Machine faults the monitoring side can report. The device button sends DEVICE_FAULT.
export const FAULTS: Record<string, L10n> = {
  card_retained: { ja: "取引後にカードが排出されない", bn: "লেনদেনের পরে কার্ড বের হয়নি", en: "Card not returned after the transaction" },
};
export const DEVICE_FAULT = "card_retained";

export const REMOTE_RELEASE: Record<string, string> = { failed: "失敗", released: "成功" };

// Read-back of the caller's own statements. A missing fact is "unknown", never a negative.
export const FACTS = {
  card_back: {
    question: { bn: "কার্ড কি ফেরত এসেছে?", en: "Did the card come back out?", ja: "カードは でてきましたか？" },
    yes: { ja: "カードは戻ってきたとのこと", bn: "কার্ড ফেরত এসেছে", en: "The card came back" },
    no: { ja: "カードは戻ってきていないとのこと", bn: "কার্ড ফেরত আসেনি", en: "The card did not come back" },
    unknown: { ja: "不明", bn: "জানা নেই", en: "Unknown" },
  },
  cash_received: {
    question: { bn: "টাকা কি পেয়েছেন?", en: "Did you get the cash?", ja: "お金は うけとりましたか？" },
    yes: { ja: "現金は受け取ったとのこと（本人申告）", bn: "টাকা পেয়েছেন", en: "The cash was received" },
    no: { ja: "現金は受け取っていないとのこと（本人申告）", bn: "টাকা পাননি", en: "The cash was not received" },
    unknown: { ja: "不明", bn: "জানা নেই", en: "Unknown" },
  },
} as const;
export type FactKey = keyof typeof FACTS;
export const FACT_KEYS = Object.keys(FACTS) as FactKey[];
export const ANSWER: Record<Fact, L10n> = {
  yes: { bn: "হ্যাঁ", en: "Yes", ja: "はい" },
  no: { bn: "না", en: "No", ja: "いいえ" },
  unknown: { bn: "জানি না", en: "Not sure", ja: "わからない" },
};
export const SENTENCE_SEP: L10n = { bn: "। ", en: ". ", ja: "。" };

export const FIELD_STATE: Record<FieldState, L10n> = {
  none: { ja: "未依頼", bn: "", en: "" },
  requested: { ja: "現地確認を依頼しました", bn: "নিরাপত্তাকর্মী পাঠানোর অনুরোধ করা হয়েছে", en: "A security staff visit was requested" },
  on_way: { ja: "警備員が向かっています", bn: "নিরাপত্তাকর্মী আসছেন", en: "Security staff are on the way" },
  arrived: { ja: "警備員が到着しました", bn: "নিরাপত্তাকর্মী পৌঁছেছেন", en: "Security staff have arrived" },
  done: { ja: "現地対応完了（カードの扱いは銀行所定の手続き）", bn: "ঘটনাস্থলের কাজ শেষ। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে", en: "On-site work is finished. The card is handled by the bank's own procedure" },
};

// The guard's own estimate. Options the guard can pick; empty = unknown.
export const ETA_OPTIONS = ["10-20", "20-30", "30-45", "45-60", ""];
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBn = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
export function etaText(eta: string | null | undefined, lang: Lang): string {
  if (!eta) return { ja: "到着目安は未定です", bn: "আনুমানিক সময় এখনো জানা নেই", en: "Arrival time is not known yet" }[lang];
  return {
    ja: `到着目安 ${eta.replace("-", "〜")}分（警備員の見込み・変わることがあります）`,
    bn: `আনুমানিক ${toBn(eta)} মিনিট (কর্মীর নিজের অনুমান, বদলাতে পারে)`,
    en: `About ${eta.replace("-", "–")} minutes (the guard's own estimate; it may change)`,
  }[lang];
}

// Slots are filled on the server from the station row, per language.
export type ReplySlots = { branch?: L10n; hours?: L10n };
export const REPLIES: Record<string, { code: string; title: string; text: (s: ReplySlots) => L10n; offersChoice?: boolean }> = {
  HELD_WAIT_OR_LEAVE: {
    code: "A-3",
    title: "機械障害によりカードを保管中（待つ／帰るを選択）",
    offersChoice: true,
    text: (s) => ({
      ja: `カードは機械の中で保管されています。お待ちいただくか、お帰りいただくかを選べます。お帰りの場合は、銀行からご連絡のうえ、${s.branch?.ja}の窓口（${s.hours?.ja}）で、銀行所定の手続きでお受け取りください。`,
      bn: `আপনার কার্ড মেশিনের ভেতরে রাখা আছে। আপনি অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে; পরে ${s.branch?.bn}-এ (${s.hours?.bn}) ব্যাংকের নিয়ম অনুযায়ী কার্ড নিতে পারবেন।`,
      en: `Your card is being held inside the machine. You can wait, or you can leave. If you leave, the bank will contact you, and you can collect it at the ${s.branch?.en} counter (${s.hours?.en}) following the bank's procedure.`,
    }),
  },
  HANDSET: {
    code: "A-6",
    title: "ATMの受話器で状況を確認",
    text: () => ({
      ja: "ここで状況を確認したいときは、ATMに備え付けの受話器をお使いください。",
      bn: "এখানে পরিস্থিতির খবর জানতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
      en: "To ask for an update here, use the handset built into the ATM.",
    }),
  },
  OFFICIAL_CHANNEL: {
    code: "A-7",
    title: "銀行の公式窓口へ",
    text: () => ({
      ja: "銀行に問い合わせるときは、銀行の公式窓口をご利用ください。",
      bn: "ব্যাংকের সঙ্গে যোগাযোগ করতে হলে ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
      en: "To contact the bank, use the bank's official contact channel.",
    }),
  },
};

export const ACTOR: Record<string, string> = { device: "機械", caller: "お客様", agent: "AI", operator: "担当者", field: "警備員", system: "システム" };

// Timeline sentences for staff, rendered from event codes and data.
export function eventText(kind: string, d: Record<string, string | undefined>): string {
  switch (kind) {
    case "fault": return `障害通知：${FAULTS[d.fault ?? ""]?.ja ?? d.fault}${d.source === "simulator" ? "（模擬）" : ""}`;
    case "paired": return `お客様が多言語窓口に接続（${LANG_NAME[d.lang as Lang] ?? d.lang}）`;
    case "claimed": return "担当者が対応を開始";
    case "remote_release": return `遠隔解除を試行 → ${REMOTE_RELEASE[d.result ?? ""] ?? d.result}`;
    case "confirmed": return `お客様が内容を確認（${FACTS.card_back[(d.card_back ?? "unknown") as Fact].ja}／${FACTS.cash_received[(d.cash_received ?? "unknown") as Fact].ja}）`;
    case "reply": return `承認済み返答を送信：${REPLIES[d.intent ?? ""]?.code ?? ""} ${REPLIES[d.intent ?? ""]?.title ?? d.intent}`;
    case "dispatch": return `警備会社へ現地確認を依頼（${d.assignee ?? ""}）`;
    case "field": return `${FIELD_STATE[(d.state ?? "none") as FieldState].ja}${d.state === "on_way" ? `（目安 ${d.eta ? d.eta.replace("-", "〜") + "分" : "未定"}）` : ""}`;
    case "choice": return d.choice === "wait" ? "お客様：現地で待つ" : "お客様：帰宅し銀行からの連絡を待つ";
    case "teachback": return "お客様が次の手順を自分の言葉で説明";
    case "human": return "お客様が担当者との会話を希望";
    case "clarify": return "理解が不十分 → 再案内";
    case "guided": return "案内を確認しました（お客様が次の手順を説明）";
    default: return kind;
  }
}

// After-call record: one sentence per piece of evidence that actually exists.
export function summaryDraft(x: { card_back: Fact; cash_received: Fact; remote_release: string | null; dispatched: boolean; choice: string | null }): string {
  return [
    x.card_back !== "unknown" && `${FACTS.card_back[x.card_back].ja}。`,
    x.cash_received !== "unknown" && `${FACTS.cash_received[x.cash_received].ja}。`,
    x.remote_release && `遠隔解除${REMOTE_RELEASE[x.remote_release]}。`,
    x.dispatched && "警備会社へ現地確認を依頼。",
    x.choice && `${eventText("choice", { choice: x.choice })}。`,
    "お客様が次の行動を自分の言葉で説明した。",
  ].filter(Boolean).join("");
}

export const FUNNEL: { key: string; ja: string; en: string }[] = [
  { key: "received", ja: "受付", en: "Received" },
  { key: "claimed", ja: "担当", en: "Claimed" },
  { key: "confirmed", ja: "申告確認", en: "Caller confirmed" },
  { key: "replied", ja: "返答送信", en: "Reply sent" },
  { key: "dispatched", ja: "出動依頼", en: "Dispatched" },
  { key: "guided", ja: "案内確認", en: "Guidance confirmed" },
];

export const UI = {
  aiNotice: {
    bn: "আমি একটি AI সহকারী। আপনার কথা জাপানি অপারেটরের কাছে পৌঁছে দেব। সিদ্ধান্ত নেবেন একজন মানুষ।",
    en: "I'm an AI assistant. I pass what you say to a Japanese operator. A person makes every decision.",
    ja: "わたしは AI の アシスタントです。あなたの 話を 係の 人に つたえます。決めるのは 人です。",
  },
  neverAsk: {
    bn: "আমি কখনো PIN, কার্ড নম্বর, অ্যাকাউন্ট নম্বর বা আইডি নম্বর জিজ্ঞাসা করব না।",
    en: "I will never ask for your PIN, card number, account number or ID number.",
    ja: "暗証番号・カード番号・口座番号・身分証の番号は ききません。",
  },
  whatHappened: { bn: "কী হয়েছে, নিজের ভাষায় লিখুন", en: "Tell us what happened, in your own words", ja: "なにが あったか 書いてください" },
  understood: { bn: "আমি যা বুঝেছি", en: "What I understood", ja: "わかったこと" },
  confirm: { bn: "হ্যাঁ, ঠিক আছে — পাঠান", en: "Yes, that's right — send", ja: "はい、これで おくる" },
  send: { bn: "পাঠান", en: "Send", ja: "おくる" },
  numbersWithheld: {
    bn: "এখানে নম্বর মনে হচ্ছে, তাই পাঠানো হয়নি। নম্বর ছাড়া আবার লিখুন।",
    en: "That looked like a number, so it was not sent. Please try again without numbers.",
    ja: "番号のような ものが あったので おくっていません。番号なしで もう一度 おねがいします。",
  },
  approved: { bn: "অপারেটর · ব্যাংকের অনুমোদিত বার্তা", en: "Operator · the bank's approved message", ja: "係の 人 ・ 銀行の きまった 文" },
  listen: { bn: "শুনুন", en: "Listen", ja: "きく" },
  waitOrLeave: { bn: "আপনি কী করবেন?", en: "What would you like to do?", ja: "どうしますか？" },
  wait: { bn: "অপেক্ষা করব", en: "I'll wait", ja: "まつ" },
  leave: { bn: "চলে যাব", en: "I'll leave", ja: "かえる" },
  teachBack: { bn: "এরপর কী করবেন, নিজের কথায় বলবেন?", en: "In your own words, what will you do next?", ja: "つぎに どうしますか。じぶんの ことばで おしえてください。" },
  teachBackSent: { bn: "পাঠানো হয়েছে — অপারেটর দেখছেন", en: "Sent — the operator is checking", ja: "おくりました。係の 人が かくにん しています" },
  clarify: { bn: "যে অংশটি বুঝতে অসুবিধা হয়েছে, সেটি কর্মীকে আবার জিজ্ঞেস করতে পারেন।", en: "You can ask the operator again about anything that is unclear.", ja: "わからない ところは 係の 人に もう一度 きけます。" },
  human: { bn: "এখনই একজন মানুষের সাথে কথা বলুন", en: "Talk to a person now", ja: "人と はなす" },
  humanAsked: { bn: "অপারেটরকে জানানো হয়েছে", en: "The operator has been told", ja: "係の 人に つたえました" },
  showStaff: { bn: "জাপানি কর্মীকে দেখান", en: "Show to staff", ja: "係の 人に みせる" },
  caseNo: { bn: "কেস নম্বর", en: "Case", ja: "案件番号" },
  waiting: {
    bn: "এখনো কোনো কর্মীর সঙ্গে সংযোগ হয়নি। এখানে জানতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
    en: "An operator has not joined yet. To ask for help here, use the ATM's built-in handset.",
    ja: "まだ 係の 人に つながって いません。ATM の 受話器を つかって ください。",
  },
  notConnected: {
    bn: "এই ফোনটি কোনো কেসের সাথে যুক্ত নয়। অপারেটরের কাছে কোড চেয়ে Help Point আবার স্ক্যান করুন।",
    en: "This phone is not connected to a case. Ask the operator for a code and scan the Help Point again.",
    ja: "この 電話は 案件に つながって いません。係の 人に コードを きいてください。",
  },
  helpDesk: {
    bn: "আরও সাহায্য: নাগাসাকি প্রিফেকচারের বিদেশি বাসিন্দা পরামর্শ কেন্দ্র — বাংলাসহ ২২টি ভাষায়, সোম–শুক্র ৯:০০–১৬:০০ (জাপান সময়)।",
    en: "More help: Nagasaki Prefecture's foreign residents' consultation desk — 22 languages including Bengali, weekdays 9:00–16:00 (Japan time).",
    ja: "そのほかの そうだん：長崎県外国人相談窓口（22言語・平日 9:00〜16:00）。",
  },
} satisfies Record<string, L10n>;

// Withhold any text that looks like a PIN, card, account or ID number before it leaves the server.
// ponytail: digit-run heuristic; spelled-out numbers ("one two three four") are not caught — the agent never asks for numbers.
export function looksLikeNumber(text: string): boolean {
  const normalised = text
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[\s\-‐-―ー.・,]/g, "");
  return /\d{4,}/.test(normalised);
}
