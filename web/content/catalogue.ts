// Reviewed wording, manual "retained-card/v1" for a FICTIONAL bank.
// Operators can only send intents listed in REPLIES; the caller sees the pre-written text in their language.
// All Bengali and Japanese below is a draft awaiting native review (see README).

export const MANUAL_VERSION = "retained-card/v1";

export type Lang = "bn" | "en" | "ja";
export type Fact = "unknown" | "yes" | "no";
export type Status = "received" | "review" | "field" | "guided";

export const LANG_NAME: Record<Lang, string> = { bn: "বাংলা", en: "English", ja: "やさしい日本語" };

export const STATUS: Record<Status, Record<Lang, string>> = {
  received: { ja: "お問い合わせを受け付けました", bn: "আপনার অনুরোধ পাওয়া গেছে", en: "Your request was received" },
  review: { ja: "担当者が確認中です", bn: "একজন কর্মী দেখছেন", en: "An operator is reviewing it" },
  field: { ja: "現地確認を依頼しました", bn: "ঘটনাস্থলে পরীক্ষার অনুরোধ পাঠানো হয়েছে", en: "A site check has been requested" },
  guided: { ja: "案内を確認しました", bn: "নির্দেশনা নিশ্চিত হয়েছে", en: "Guidance confirmed" },
};

// Read-back of the caller's own statements. A missing fact is "unknown", never a negative.
export const FACTS = {
  card_back: {
    label: { ja: "カード", bn: "কার্ড", en: "Card" },
    yes: { ja: "カードは戻ってきたとのこと", bn: "কার্ড ফেরত এসেছে", en: "The card came back" },
    no: { ja: "カードは戻ってきていないとのこと", bn: "কার্ড ফেরত আসেনি", en: "The card did not come back" },
    unknown: { ja: "不明", bn: "জানা নেই", en: "Unknown" },
  },
  cash_received: {
    label: { ja: "現金", bn: "টাকা", en: "Cash" },
    yes: { ja: "現金は受け取ったとのこと（本人申告）", bn: "টাকা পেয়েছেন", en: "The cash was received" },
    no: { ja: "現金は受け取っていないとのこと（本人申告）", bn: "টাকা পাননি", en: "The cash was not received" },
    unknown: { ja: "不明", bn: "জানা নেই", en: "Unknown" },
  },
} as const;
export type FactKey = keyof typeof FACTS;

export const FIELD_STATE: Record<string, Record<Lang, string>> = {
  none: { ja: "", bn: "", en: "" },
  requested: { ja: "現地確認を依頼しました", bn: "নিরাপত্তাকর্মী পাঠানোর অনুরোধ করা হয়েছে", en: "A security staff visit was requested" },
  on_way: { ja: "警備員が向かっています", bn: "নিরাপত্তাকর্মী আসছেন", en: "Security staff are on the way" },
  arrived: { ja: "警備員が到着しました", bn: "নিরাপত্তাকর্মী পৌঁছেছেন", en: "Security staff have arrived" },
  done: { ja: "現地対応が終わりました。カードの扱いは銀行所定の手続きによります", bn: "ঘটনাস্থলের কাজ শেষ। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে", en: "On-site work is finished. The card is handled by the bank's own procedure" },
};

export function etaText(eta: string | null | undefined, lang: Lang): string {
  if (!eta) return { ja: "到着目安は未定です（警備員の見込み）", bn: "আনুমানিক সময় এখনো জানা নেই", en: "Arrival time is not known yet" }[lang];
  return { ja: `到着目安 ${eta}分（警備員の見込み・変わることがあります）`, bn: `আনুমানিক ${toBn(eta)} মিনিট (কর্মীর নিজের অনুমান, বদলাতে পারে)`, en: `About ${eta} minutes (the guard's own estimate; it may change)` }[lang];
}

export type ReplySlots = { branch?: string; hours?: string };

// Operator-sendable replies. text() renders the reviewed wording with slots filled.
export const REPLIES: Record<string, { title: string; text: (s: ReplySlots) => Record<Lang, string> }> = {
  HELD_WAIT_OR_LEAVE: {
    title: "A-3 機械障害によりカードを保管中（待つ／帰るを選択）",
    text: ({ branch = "長崎駅前支店", hours = "平日 9:00〜15:00" }) => ({
      ja: `カードは機械の中で保管されています。お待ちいただくか、お帰りいただくかを選べます。お帰りの場合は、銀行からご連絡のうえ、${branch}の窓口（${hours}）で、銀行所定の手続きでお受け取りください。`,
      bn: `আপনার কার্ড মেশিনের ভেতরে রাখা আছে। আপনি অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে; পরে ${branch} শাখায় (${hours}) ব্যাংকের নিয়ম অনুযায়ী কার্ড নিতে পারবেন।`,
      en: `Your card is being held inside the machine. You can wait, or you can leave. If you leave, the bank will contact you, and you can collect it at the ${branch} counter (${hours}) following the bank's procedure.`,
    }),
  },
  HANDSET: {
    title: "A-6 ATMの受話器で状況を確認",
    text: () => ({
      ja: "ここで状況を確認したいときは、ATMに備え付けの受話器をお使いください。",
      bn: "এখানে পরিস্থিতির খবর জানতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
      en: "To ask for an update here, use the handset built into the ATM.",
    }),
  },
  OFFICIAL_CHANNEL: {
    title: "A-7 銀行の公式窓口へ",
    text: () => ({
      ja: "銀行に問い合わせるときは、銀行の公式窓口をご利用ください。",
      bn: "ব্যাংকের সঙ্গে যোগাযোগ করতে হলে ব্যাংকের অফিসিয়াল যোগাযোগের মাধ্যম ব্যবহার করুন।",
      en: "To contact the bank, use the bank's official contact channel.",
    }),
  },
};

export const UI = {
  aiNotice: {
    bn: "আমি একটি AI সহকারী। আপনার কথা জাপানি অপারেটরের কাছে পৌঁছে দেব। সিদ্ধান্ত নেবেন একজন মানুষ।",
    en: "I am an AI assistant. I pass what you say to a Japanese operator. A person makes every decision.",
    ja: "わたしは AI の アシスタントです。あなたの 話を 係の 人に つたえます。決めるのは 人です。",
  },
  neverAsk: {
    bn: "আমি কখনো PIN, কার্ড নম্বর, অ্যাকাউন্ট নম্বর বা আইডি নম্বর জিজ্ঞাসা করব না।",
    en: "I will never ask for your PIN, card number, account number or ID number.",
    ja: "暗証番号・カード番号・口座番号・身分証の番号は ききません。",
  },
  whatHappened: { bn: "কী হয়েছে, নিজের ভাষায় লিখুন বা বলুন", en: "Tell us what happened, in your own words", ja: "なにが あったか おしえてください" },
  understood: { bn: "আমি যা বুঝেছি", en: "What I understood", ja: "わかったこと" },
  confirm: { bn: "হ্যাঁ, ঠিক আছে — পাঠান", en: "Yes, that's right — send", ja: "はい、これで おくる" },
  numbersWithheld: {
    bn: "এখানে নম্বর মনে হচ্ছে, তাই পাঠানো হয়নি। নম্বর ছাড়া আবার লিখুন।",
    en: "That looked like a number, so it was not sent. Please try again without numbers.",
    ja: "番号のような ものが あったので おくっていません。番号なしで もう一度 おねがいします。",
  },
  waitOrLeave: { bn: "আপনি কী করবেন?", en: "What would you like to do?", ja: "どうしますか？" },
  wait: { bn: "অপেক্ষা করব", en: "I'll wait", ja: "まつ" },
  leave: { bn: "চলে যাব", en: "I'll leave", ja: "かえる" },
  teachBack: { bn: "এরপর কী করবেন, নিজের কথায় বলবেন?", en: "In your own words, what will you do next?", ja: "つぎに どうしますか。じぶんの ことばで おしえてください。" },
  teachBackSent: { bn: "পাঠানো হয়েছে — অপারেটর দেখছেন", en: "Sent — the operator is checking", ja: "おくりました。係の 人が かくにん しています" },
  clarify: { bn: "যে অংশটি বুঝতে অসুবিধা হয়েছে, সেটি কর্মীকে আবার জিজ্ঞেস করতে পারেন।", en: "You can ask the operator again about anything that is unclear.", ja: "わからない ところは 係の 人に もう一度 きけます。" },
  human: { bn: "এখনই একজন মানুষের সাথে কথা বলুন", en: "Talk to a person now", ja: "人と はなす" },
  showStaff: { bn: "জাপানি কর্মীকে দেখান", en: "Show to Japanese staff", ja: "係の 人に みせる" },
  waiting: {
    bn: "এখনো কোনো কর্মীর সঙ্গে সংযোগ হয়নি। এখানে জানতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
    en: "An operator has not joined yet. To ask for help here, use the ATM's built-in handset.",
    ja: "まだ 係の 人に つながって いません。ATM の 受話器を つかって ください。",
  },
} satisfies Record<string, Record<Lang, string>>;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export function toBn(s: string): string {
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// Withhold any text that looks like a PIN, card, account or ID number before it leaves the server.
// ponytail: digit-run heuristic; spelled-out numbers ("one two three four") are not caught — the agent never asks for numbers.
export function looksLikeNumber(text: string): boolean {
  const normalised = text
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[\s\-‐-―ー.・,]/g, "");
  return /\d{4,}/.test(normalised);
}
