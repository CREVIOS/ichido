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

// Timeline sentences for staff, rendered from event codes and data.
export function eventText(kind: string, d: Record<string, string | undefined>): string {
  switch (kind) {
    case "fault": return `障害通知：${isFault(d.fault) ? FAULTS[d.fault].ja : "不明な障害"}${d.source === "simulator" ? "（模擬）" : ""}`;
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

// Staff sign-in (staff screens are Japanese).
export const STAFF = {
  email: "メール",
  password: "パスワード",
  signIn: "サインイン",
  signOut: "サインアウト",
  otherAccount: "別のアカウントで入る",
  noAccess: (role: string) => `このページを見る権限がありません（${role}）。`,
  demo: "デモ環境・架空のデータ",
};

// Landing page (English, for judges and visitors).
export const HOME = {
  badge: "Hackathon demo",
  badgeStrong: "fictional bank, synthetic data",
  title: "Say it once.",
  lead: "When an ATM keeps your card, nobody in front of it should be left without words or without a next step. Ichido joins the machine's alert, the caller's own words and the operator's decision into one case, in the caller's language.",
  open: "Open →",
  footer: "The ATM is simulated by an ESP32 prop or an on-screen action. Nothing here connects to a real bank, ATM or security company. The assistant never asks for a PIN, card, account or ID number.",
  roles: [
    { href: "/operator", title: "監視センター", sub: "Operator console", body: "The machine's fault, the caller's own words, approved replies and dispatch on one screen." },
    { href: "/s/TABLE-A", title: "Help Point", sub: "Caller · বাংলা / English / やさしい日本語", body: "Scan the sticker, enter the operator's code, say what happened in your language." },
    { href: "/field", title: "警備員", sub: "Security guard", body: "Only your own assignments. One tap for on the way, arrived, done." },
    { href: "/insights", title: "インサイト", sub: "Insights", body: "How cases flow from the machine alert to a caller who can explain their next step." },
  ],
};

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
  start: { bn: "🎙 কথা বলুন", en: "🎙 Speak", ja: "🎙 はなす" },
  stop: { bn: "■ থামুন", en: "■ Stop", ja: "■ とめる" },
  notice: {
    bn: "কথা বললে আপনার কণ্ঠ LiveKit হয়ে Google-এর স্পিচ রিকগনিশনে যায়, আর আমার উত্তর Azure পড়ে শোনায়। লিখলে লেখা আমাদের সার্ভারে যায় (চালু থাকলে OpenAI-ও)। নম্বর বলবেন না।",
    en: "If you speak, your voice goes through LiveKit to Google speech recognition, and Azure reads my replies aloud. If you type, the text goes to our server (and to OpenAI if enabled). Please don't say any numbers.",
    ja: "はなすと 声は LiveKit を とおって Google の 音声認識に おくられ、Azure が こたえを よみあげます。書くと 文字は サーバーに おくられます（設定に よっては OpenAI にも）。番号は いわないで ください。",
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

// The sentence the assistant reads back, built from the current draft facts.
export function readBackText(lang: Lang, facts: Record<FactKey, Fact>): string | null {
  const known = FACT_KEYS.filter((k) => facts[k] !== "unknown");
  if (!known.length) return null;
  return `${UI.understood[lang]}: ${known.map((k) => FACTS[k][facts[k]][lang]).join(SENTENCE_SEP[lang])}`;
}

// Mobile app (mobile/). Caller-facing strings in all three languages; staff strings in Japanese, as in STAFF.
export const MOBILE = {
  // Role entry is shown to everyone, so each label carries Japanese and English.
  entry: {
    caller: { ja: "お客様", en: "Caller" },
    staff: { ja: "スタッフ", en: "Staff" },
    signedIn: (name: string) => `${name} としてサインイン中`,
  },
  station: {
    label: { bn: "Help Point-এর নাম বা লিংক", en: "Help Point name or link", ja: "Help Point の 名前 か リンク" },
    hint: { bn: "স্টিকারে লেখা আছে, যেমন TABLE-A", en: "It is printed on the sticker, for example TABLE-A", ja: "ステッカーに 書いて あります（れい：TABLE-A）" },
    open: { bn: "খুলুন", en: "Open", ja: "ひらく" },
  },
  back: { bn: "ফিরে যান", en: "Back", ja: "もどる" },
  // Voice buttons without the symbols the web strings carry; the app draws an icon instead.
  speak: { bn: "কথা বলুন", en: "Speak", ja: "はなす" },
  stopSpeaking: { bn: "থামুন", en: "Stop", ja: "とめる" },
  // Seeded local demo accounts (supabase/seed.sql), prefilled on the sign-in form.
  demoAccount: { operator: "operator@ichido.demo", field: "guard1@ichido.demo", manager: "manager@ichido.demo" } as Record<string, string>,

  staff: {
    close: "閉じる",
    count: (n: number) => `${n}件`,
    errors: {
      conflict: "状態が変わったか、条件を満たしていません。画面を更新しました。",
      forbidden: "この操作はできません。",
      not_found: "案件が見つかりません。",
      bad_request: "入力が正しくありません。",
      server: "サーバーエラーが発生しました。",
    } as Record<string, string>,
  },
  operator: {
    title: "監視センター",
    queue: "対応キュー",
    open: "対応中",
    history: "完了した案件",
    env: "デモ・架空の銀行",
    empty: "対応中の案件はありません。Help Point のボタン、または右上のメニューから模擬障害を起こせます。",
    simulate: "障害を模擬",
    simulateAt: (label: string) => `ATM障害を模擬：${label}`,
    minutesAgo: (n: number) => `${n}分前`,
    unknownFault: "不明な障害",
    abandonedChip: "終了（連絡なし）",
    facts: { atm: "ATM", fault: "障害", release: "遠隔解除", notTried: "未実施", source: "経路", device: "Help Point", simulator: "模擬障害", received: "受付" },
    actions: "案件の操作",
    releaseFailed: "遠隔解除を試行（模擬：失敗）",
    releaseOk: "遠隔解除を試行（模擬：成功）",
    resetCaller: "お客様の接続をリセット",
    abandon: "案件を終了（お客様と連絡が取れない）",
    record: "対応記録",
    recordDraft: "自動作成・要確認",
    finished: "完了",
    finishedAbandoned: "お客様と連絡が取れないため終了しました。",
    finishedDone: "この案件は完了しています。",
    unclaimed: "未担当",
    claim: "この案件を担当する",
    otherOperator: "他の担当者が対応中",
    otherOperatorBody: "この案件は別のオペレーターが担当しています。",
    words: "お客様のことば",
    wantsHuman: "担当者との会話を希望",
    confirming: "お客様が内容を確認しています。確認後にここに表示されます。",
    notPaired: "お客様はまだ多言語窓口に接続していません。",
    clarifying: "AI が確認の質問をしています。",
    original: (lang: string) => `原文 · ${lang}`,
    byChoice: "（選択肢で回答）",
    confirmed: "お客様が確認した内容",
    rev: (n: number) => `版 ${n}`,
    choice: "お客様の選択",
    choiceWait: "現地で待つ",
    choiceLeave: "帰宅し連絡を待つ",
    timeline: "経過",
    teachBack: "お客様が説明した「次の手順」",
    machineTranslation: "機械翻訳",
    noTranslation: (lang: string) => `翻訳なし：${lang}が分かる担当者に確認してください。`,
    olderTeachBack: "この説明は以前の返答に対するものです。",
    understood: "理解を確認できた",
    clarify: "再案内が必要",
    pairTitle: "多言語窓口",
    pairValid: "5分・1回",
    pairBody: "日本語で説明が難しいお客様に、このコードを伝えます。お客様は Help Point の QR から入力します。",
    pairIssue: "接続コードを発行",
    pairReissue: "コードを再発行",
    replies: "承認済み返答",
    slotsHint: (lang: string) => `支店名と窓口時間は、送信時にこのATMの登録情報から差し込まれます。お客様には ${lang} で届きます。`,
    sendReply: "お客様へ送信",
    waitConfirm: "お客様の確認待ち",
    heldMismatch: "お客様の申告または遠隔解除の結果と合いません",
    sentCount: (n: number) => `送信済み ${n}件`,
    dispatch: "取次・出動依頼",
    guard: "警備員",
    eta: (eta: string) => `到着目安 ${eta.replace("-", "〜")}分（警備員の見込み）`,
    etaUnknown: "到着目安：未定",
    dispatchBody: "警備会社へ現地確認を依頼します。カードの扱いは銀行所定の手続きによります。",
    assign: (name: string, again: boolean) => `${name} へ${again ? "再依頼" : "依頼"}`,
    callerScreen: (text: string) => `お客様の画面：${text}`,
  },
  field: {
    title: "割当",
    header: (name: string) => `警備員 · ${name}`,
    empty: "現在、割当はありません。",
    changed: "この割当は変更されました。",
    failed: "更新できませんでした。",
    eta: "到着目安",
    etaMine: "到着目安（あなたの見込み）",
    minutes: (eta: string) => `${eta.replace("-", "〜")}分`,
    etaUnknown: "未定",
    onWay: "向かっています",
    arrived: "到着",
    done: "対応完了",
    note: "本人確認・カードの返却はこの画面では扱いません。カードの扱いは銀行所定の手続きによります。",
  },
  insights: {
    title: "インサイト",
    period: (d: number) => `直近${d}日`,
    funnel: "案件の流れ",
    funnelBody: "障害通知から「お客様が次の手順を自分の言葉で説明」まで。各段階は前の段階を通過した案件のみを数えます。",
    passRate: (n: number) => `通過率 ${n}%`,
    received: "受付件数",
    noData: "データがありません",
    noLanguage: "多言語窓口を使わず",
    perDay: "日別の受付",
    hours: "時間帯",
    peak: (from: number, to: number) => `ピーク：${from}〜${to}時`,
    hour: (h: number) => `${h}時`,
    firstReply: "初回返答まで",
    seconds: (n: number) => `${n}秒`,
    minutes: (n: string) => `${n}分`,
    firstReplyBody: "障害通知から、承認済み返答を送信するまでの中央値",
    reachedGuided: "案内確認まで到達",
    dispatched: "警備員の出動依頼",
    abandoned: "連絡が取れず終了",
    choices: "お客様の選択",
    choiceWait: "現地で待つ",
    choiceLeave: "帰宅して連絡を待つ",
    choicesNote: "「待つ／帰る」を選べる返答を受けたお客様のみ",
    footer: "件数のみを集計しています。お客様の言葉や個人を特定できる情報は表示しません。デモ環境の数値は合成データを含みます。",
  },
};
