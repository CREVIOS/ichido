// Landing page and document metadata (English, for judges and visitors).

export const META = {
  title: "Ichido 一度 — say it once",
  description: "The machine's alert, the caller's own words and the operator's decision become one case, in the caller's language.",
};

export const HOME = {
  nav: [
    { href: "/#how", label: "How it works" },
    { href: "/#screens", label: "Screens" },
    { href: "/enterprise", label: "Enterprise" },
    { href: "/pricing", label: "Pricing" },
  ],
  repo: { href: "https://github.com/CREVIOS/ichido", label: "GitHub" },
  signIn: "Staff sign in",
  primary: { href: "/operator", label: "Open the console" },
  secondary: { href: "/s/TABLE-A", label: "Help Point" },
  news: { label: "TSUNAGU", text: "Update the way we connect — Nagasaki" },
  title: ["Say it once.", "In your own language."],
  lead: "When an ATM keeps your card, the monitoring centre already knows the machine failed. Ichido joins that alert, your own words and the operator's decision into one case — in Bengali, Vietnamese, Indonesian, Nepali, English or easy Japanese.",
  how: {
    title: "How Ichido works",
    steps: [
      { k: "MACHINE ALERT", t: "The ATM raises its own alert", b: "A Help Point beside the machine reports the fault the moment it happens. The case opens before anyone has to explain anything." },
      { k: "CALLER'S WORDS", t: "You say it once, in your language", b: "Speak or type. The assistant reads back what it understood; you correct it and confirm. It never asks for a PIN, card, account or ID number." },
      { k: "OPERATOR DECISION", t: "A person decides, with the bank's words", b: "The operator sees the alert, your original words and what you confirmed. Replies come only from the bank's approved catalogue." },
      { k: "NEXT STEP", t: "You leave knowing what happens next", b: "Wait for the guard with their own estimate, or leave and be contacted. You explain the next step back before the case closes." },
    ],
  },
  screens: {
    title: "One case, four screens",
    lead: "Everyone sees the same case, and only the part they need.",
    items: [
      { href: "/operator", title: "Monitoring centre", sub: "監視センター", body: "Queue, machine state, the caller's own words beside the facts they confirmed, approved replies, dispatch." },
      { href: "/s/TABLE-A", title: "Help Point", sub: "বাংলা · Tiếng Việt · Bahasa Indonesia · नेपाली · English · やさしい日本語", body: "Scan the sticker, enter the operator's single-use code, say what happened." },
      { href: "/field", title: "Security guard", sub: "警備員", body: "Only your own assignments. On the way with your own estimate, arrived, done." },
      { href: "/insights", title: "Insights", sub: "インサイト", body: "How cases flow from the machine's alert to a caller who can explain their next step." },
    ],
  },
  rules: {
    title: "Rules the product keeps",
    items: [
      { t: "The bank's words, not the model's", b: "Callers receive approved replies only. Branch names and hours come from the station record." },
      { t: "The caller checks the read-back", b: "A Japanese operator cannot check Bengali, so the caller confirms or corrects; the operator always sees the original words." },
      { t: "Never a number", b: "Text that looks like a PIN, card, account or ID number is withheld before it leaves the server." },
      { t: "No card handback on screen", b: "No ID check, no “collect your card” signal. What happens to a held card is the bank's procedure." },
      { t: "A code, not a sticker", b: "A caller reaches a case only with the operator's single-use, five-minute code. Guesses are rate-limited." },
      { t: "Each role sees only what it needs", b: "Row-level security: callers their own case, guards their own assignments, managers counts." },
    ],
  },
  cta: { title: "Start from the console", body: "Sign in with a staff account issued by your administrator.", button: "Open the console" },
  footer: "The bank, branch and security company shown are fictional. Nothing here connects to a real bank or ATM network.",
  howTag: { left: "HOW IT WORKS", right: "1.0" },
  people: {
    title: "Built for everyone at the machine",
    tag: { left: "PEOPLE", right: "3" },
    items: [
      { icon: "caller", tag: "Help Point · বাংলা", name: "The caller", text: "21:40, and the card stays inside. The screen, the handset and the voice on the phone all speak Japanese. With Ichido she says what happened once, in Bengali, corrects the read-back, and sees that the guard is on the way.", who: "Foreign resident", role: "Caller" },
      { icon: "operator", tag: "監視センター", name: "The operator", text: "The machine's alert is already on screen. Now the caller's own words sit beside it, confirmed by the caller, with only the bank's approved replies to send. No guessing at a language they don't read.", who: "Monitoring centre", role: "Operator" },
      { icon: "guard", tag: "警備員", name: "The guard", text: "One assignment, one tap for on the way, with their own honest estimate. The caller sees it on their phone the same second; nobody relays it twice.", who: "Security company", role: "Field" },
    ],
  },
  measure: {
    title: "Measure, inspect, improve",
    body: "Every case is counted, never read: how fast the first reply came, how many callers could explain their next step, which hours and languages need staff.",
    note: "Counts only. The insights board never shows a caller's words or anything that identifies them.",
    sample: "Illustration",
    received: [6, 8, 7, 9, 11, 10, 12, 13, 12, 15, 14, 16, 18, 17],
    guided: [3, 4, 4, 5, 6, 7, 8, 9, 9, 11, 11, 13, 15, 15],
    reply: "4.9分",
    rate: "57%",
  },
  // The hero illustration of the console. Station names are the fictional ones used throughout.
  preview: {
    badge: "Help Point · TABLE-A",
    badgeState: "Caller confirmed",
    queue: [
      { title: "長崎駅前 店舗外ATM", meta: "2分前", status: "review", lang: "bn" },
      { title: "浜町アーケード ATM", meta: "14分前", status: "field", lang: "vi" },
      { title: "出島ワーフ ATM", meta: "31分前", status: "guided", lang: "ja" },
    ],
    table: "すべて",
    head: ["ATM", "初回返答", "状態", "言語", "ID"],
    filter: "フィルター",
    rows: [
      { id: "NGS-01", title: "長崎駅前 店舗外ATM", reply: 6, time: "48秒", status: "review", lang: "bn", live: true },
      { id: "HMC-02", title: "浜町アーケード ATM", reply: 6, time: "1.2分", status: "field", lang: "en" },
      { id: "DJM-03", title: "出島ワーフ ATM", reply: 5, time: "2.0分", status: "guided", lang: "ja" },
      { id: "OUR-04", title: "大浦天主堂下 ATM", reply: 5, time: "2.6分", status: "guided", lang: "vi" },
      { id: "SAN-05", title: "思案橋 ATM", reply: 4, time: "3.4分", status: "received", lang: "en" },
      { id: "ISH-06", title: "諫早駅 ATM", reply: 4, time: "3.9分", status: "guided", lang: "ne" },
      { id: "SSB-07", title: "佐世保四ヶ町 ATM", reply: 3, time: "5.1分", status: "field", lang: "ja" },
      { id: "SMB-08", title: "島原港 ATM", reply: 3, time: "5.8分", status: "guided", lang: "id" },
      { id: "OMR-09", title: "長崎空港 ATM", reply: 2, time: "7.5分", status: "alert", lang: "bn" },
      { id: "INS-10", title: "稲佐山口 ATM", reply: 2, time: "8.2分", status: "guided", lang: "ja" },
    ],
    words: "কার্ড বের হয়নি, টাকা পেয়েছি। আমি কি অপেক্ষা করব?",
    slots: {
      branch: { ja: "出島銀行 駅前支店（架空）", bn: "দেজিমা ব্যাংক স্টেশন শাখা (কাল্পনিক)", en: "Dejima Bank Station branch (fictional)" },
      hours: { ja: "平日 9:00〜15:00", bn: "সোম–শুক্র, ৯:০০–১৫:০০", en: "weekdays 9:00–15:00" },
    },
  },
};

// The artwork used on the splash and sign-in screens (public domain).
export const ART = {
  credit: "長谷川等伯「松林図屏風」16世紀・東京国立博物館",
  creditEn: "Hasegawa Tōhaku, Pine Trees, 16th century — Tokyo National Museum (public domain)",
};
