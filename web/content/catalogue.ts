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
export const isFault = (k: unknown): k is string => typeof k === "string" && Object.hasOwn(FAULTS, k);

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
      ja: `カードは機械の中にあります。ここでお待ちいただくか、お帰りいただくかを選べます。お帰りの場合は銀行からご連絡します。カードの扱いは銀行所定の手続きによります。${s.branch?.ja}の窓口（${s.hours?.ja}）でもご案内できます。`,
      bn: `আপনার কার্ড মেশিনের ভেতরে আছে। আপনি এখানে অপেক্ষা করতে পারেন, অথবা চলে যেতে পারেন। চলে গেলে ব্যাংক আপনার সাথে যোগাযোগ করবে। কার্ডের বিষয়টি ব্যাংকের নিজস্ব নিয়মে হবে। ${s.branch?.bn}-এর কাউন্টারেও (${s.hours?.bn}) জানতে পারবেন।`,
      en: `Your card is inside the machine. You can wait here, or you can leave. If you leave, the bank will contact you. The card is handled under the bank's own procedure. The ${s.branch?.en} counter (${s.hours?.en}) can also help.`,
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

export const replyOf = (intent: unknown): Reply | undefined =>
  typeof intent === "string" && Object.hasOwn(REPLIES, intent) ? REPLIES[intent] : undefined;
export const CHOICE_INTENTS = Object.keys(REPLIES).filter((k) => REPLIES[k].offersChoice);

export const ACTOR: Record<string, string> = { device: "機械", caller: "お客様", agent: "AI", operator: "担当者", field: "警備員", system: "システム" };

// One-tap rating after a guided case closes: 1 = hard, 2 = okay, 3 = good. Faces only, no free text.
export const RATINGS = [3, 2, 1] as const;
export const RATING: Record<number, L10n> = {
  3: { bn: "ভালো", en: "Good", ja: "よかった" },
  2: { bn: "মোটামুটি", en: "Okay", ja: "ふつう" },
  1: { bn: "কঠিন ছিল", en: "Hard", ja: "むずかしかった" },
};
const RATING_JA: Record<number, string> = { 3: "よかった", 2: "ふつう", 1: "むずかしかった" };

// Timeline sentences for staff, rendered from event codes and data.
export function eventText(kind: string, d: Record<string, string | undefined>): string {
  switch (kind) {
    case "fault": return `障害通知：${isFault(d.fault) ? FAULTS[d.fault].ja : "不明な障害"}${d.source === "simulator" ? "（手動登録）" : ""}`;
    case "paired": return `お客様が多言語窓口に接続（${LANG_NAME[d.lang as Lang] ?? d.lang}）`;
    case "claimed": return "担当者が対応を開始";
    case "remote_release": return `遠隔解除を試行 → ${REMOTE_RELEASE[d.result ?? ""] ?? d.result}`;
    case "confirmed": return `お客様が内容を確認（${FACTS.card_back[(d.card_back ?? "unknown") as Fact].ja}／${FACTS.cash_received[(d.cash_received ?? "unknown") as Fact].ja}）`;
    case "reply": return `承認済み返答を送信：${replyOf(d.intent)?.code ?? ""} ${replyOf(d.intent)?.title ?? d.intent}`;
    case "dispatch": return `警備会社へ現地確認を依頼（${d.assignee ?? ""}）`;
    case "redispatch": return `別の警備員へ再依頼（${d.assignee ?? ""}）`;
    case "caller_reset": return "お客様の接続をリセット（新しいコードが必要）";
    case "abandoned": return "案件を終了（お客様と連絡が取れず）";
    case "field": return `${FIELD_STATE[(d.state ?? "none") as FieldState].ja}${d.state === "on_way" ? `（目安 ${d.eta ? d.eta.replace("-", "〜") + "分" : "未定"}）` : ""}`;
    case "choice": return d.choice === "wait" ? "お客様：現地で待つ" : "お客様：帰宅し銀行からの連絡を待つ";
    case "teachback": return "お客様が次の手順を自分の言葉で説明";
    case "human": return "お客様が担当者との会話を希望";
    case "clarify": return "理解が不十分 → 再案内";
    case "suggested": return `AI提案（${d.model ?? "Gemini"}）：${replyOf(d.intent)?.code ?? "—"}${String(d.dispatch) === "true" ? `・${d.guard ?? "警備員"}へ依頼` : ""}（判断は担当者）`;
    case "handoff": return `引継票を発行（${HANDOFF.recipient[d.recipient ?? ""] ?? d.recipient}宛）`;
    case "handoff_viewed": return `引継票が閲覧されました（${HANDOFF.recipient[d.recipient ?? ""] ?? d.recipient}宛）`;
    case "handoff_revoked": return `引継票を失効（${HANDOFF.recipient[d.recipient ?? ""] ?? d.recipient}宛）`;
    case "rated": return `お客様の評価：${RATING_JA[Number(d.rating)] ?? d.rating}`;
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

// Cumulative: each stage counts only cases that passed the previous one.
export const FUNNEL: { key: string; ja: string; en: string }[] = [
  { key: "received", ja: "受付", en: "Received" },
  { key: "claimed", ja: "担当", en: "Claimed" },
  { key: "confirmed", ja: "申告確認", en: "Caller confirmed" },
  { key: "replied", ja: "返答送信", en: "Reply sent" },
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
  unsure: {
    bn: "আমি ঠিক বুঝতে পারিনি। নিচের প্রশ্নগুলোর উত্তর বেছে নিন।",
    en: "I wasn't sure what you meant. Please choose the answers below.",
    ja: "よく わかりませんでした。下の しつもんに こたえて ください。",
  },
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
  humanAsked: {
    bn: "অপারেটরকে জানানো হয়েছে। এখনই কথা বলতে চাইলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
    en: "The operator has been told. To talk now, use the handset built into the ATM.",
    ja: "係の 人に つたえました。いま はなしたい ときは ATM の 受話器を つかって ください。",
  },
  rateTitle: { bn: "আজকের সাহায্য কেমন ছিল?", en: "How was the help today?", ja: "きょうの たすけは どうでしたか？" },
  rateThanks: { bn: "ধন্যবাদ। আপনার উত্তর সংরক্ষিত হয়েছে।", en: "Thank you. Your answer has been saved.", ja: "ありがとう ございました。" },
  showStaff: { bn: "জাপানি কর্মীকে দেখান", en: "Show to staff", ja: "係の 人に みせる" },
  caseNo: { bn: "কেস নম্বর", en: "Case", ja: "案件番号" },
  waiting: {
    bn: "অপারেটর এখনো আপনার বিষয়টি দেখছেন। জরুরি হলে এটিএমে লাগানো ফোনের রিসিভারটি ব্যবহার করুন।",
    en: "The operator is still looking at your case. If it is urgent, use the handset built into the ATM.",
    ja: "係の 人が まだ かくにん しています。いそぐ ときは ATM の 受話器を つかって ください。",
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

export * from "./staff";
import { HANDOFF } from "./staff";
export * from "./numbers";
export * from "./home";
export * from "./mobile";

// Pairing page behind the Help Point sticker.
export const STATION = {
  title: { bn: "সহায়তা কেন্দ্রের সাথে যুক্ত হন", en: "Connect to the help desk", ja: "まどぐちに つなぐ" },
  code: { bn: "অপারেটর যে কোডটি বলেছেন", en: "The code the operator gave you", ja: "係の 人が いった コード" },
  go: { bn: "যুক্ত হন", en: "Connect", ja: "つなぐ" },
  why: {
    bn: "এই স্টিকারে কোনো ব্যক্তিগত তথ্য নেই। অপারেটরের দেওয়া কোড ছাড়া কেউ আপনার কেস দেখতে পারবে না।",
    en: "This sticker holds no personal information. Nobody can open your case without the code the operator gives you.",
    ja: "このページには 個人の 情報は ありません。コードが ないと 案件は ひらけません。",
  },
  staffSession: {
    bn: "এই ব্রাউজারে একজন কর্মী সাইন ইন করা আছেন। কলারের জন্য একটি প্রাইভেট উইন্ডো ব্যবহার করুন।",
    en: "A staff member is signed in on this browser. Use a private window for the caller.",
    ja: "この ブラウザには 係の 人が サインイン しています。お客様には プライベート ウィンドウを つかって ください。",
  },
  signOutStaff: { bn: "কর্মীকে সাইন আউট করে চালিয়ে যান", en: "Sign the staff member out and continue", ja: "係の 人を サインアウト して つづける" },
} satisfies Record<string, L10n>;

// Voice intake. Names every service the caller's voice or text can reach.
export const VOICE = {
  start: { bn: "কথা বলুন", en: "Speak", ja: "はなす" },
  stop: { bn: "থামুন", en: "Stop", ja: "とめる" },
  notice: {
    bn: "কথা বললে আপনার কণ্ঠ LiveKit হয়ে Soniox-এর স্পিচ রিকগনিশনে যায়, আর আমার উত্তর ElevenLabs পড়ে শোনায়। লিখলে লেখা আমাদের সার্ভারে যায় (চালু থাকলে OpenAI-ও)। অপারেটরের সহায়তার জন্য Google Gemini শুধু নিশ্চিত তথ্য দেখে, আপনার কথা নয়। নম্বর বলবেন না।",
    en: "If you speak, your voice goes through LiveKit to Soniox speech recognition, and ElevenLabs reads my replies aloud. If you type, the text goes to our server (and to OpenAI if enabled). Google Gemini helps the operator using only the facts you confirmed, never your words. Please don't say any numbers.",
    ja: "はなすと 声は LiveKit を とおって Soniox の 音声認識に おくられ、ElevenLabs が こたえを よみあげます。書くと 文字は サーバーに おくられます（設定に よっては OpenAI にも）。係の 人を たすける Google Gemini は、あなたが かくにんした 内容だけを 見ます。番号は いわないで ください。",
  },
  connecting: { bn: "সংযোগ হচ্ছে…", en: "Connecting…", ja: "つないで います…" },
  hearing: { bn: "শুনছি…", en: "Listening…", ja: "きいています…" },
  unavailable: { bn: "এখন কণ্ঠ চালু নেই — লিখে বলুন।", en: "Voice is not available now — please type.", ja: "いまは 声が つかえません。書いて ください。" },
} satisfies Record<string, L10n>;

// Errors a caller can see, by the stable code the server returns.
export const ERRORS: Record<string, L10n> = {
  conflict: { bn: "অবস্থা বদলে গেছে — স্ক্রিন আপডেট হয়েছে, আবার দেখুন।", en: "Something changed — the screen has been updated, please check again.", ja: "じょうたいが かわりました。画面を もう一度 みてください。" },
  forbidden: { bn: "এই কেসটি এখন খোলা যাচ্ছে না।", en: "This case cannot be opened now.", ja: "いま この 案件は ひらけません。" },
  rate_limited: { bn: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।", en: "Too many tries. Please wait a few minutes.", ja: "なんども ためしました。すこし まってから もう一度。" },
  server: { bn: "কিছু একটা ঠিকমতো হয়নি। আবার চেষ্টা করুন।", en: "Something went wrong. Please try again.", ja: "うまく いきませんでした。もう一度 おねがいします。" },
};
export const errorText = (code: string, lang: Lang) => (Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.server)[lang];

// The sentence the assistant reads back, built from the current draft facts.
export function readBackText(lang: Lang, facts: Record<FactKey, Fact>): string | null {
  const known = FACT_KEYS.filter((k) => facts[k] !== "unknown");
  if (!known.length) return null;
  return `${UI.understood[lang]}: ${known.map((k) => FACTS[k][facts[k]][lang]).join(SENTENCE_SEP[lang])}`;
}

