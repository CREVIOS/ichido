// Landing page and document metadata (English, for judges and visitors).

export const META = {
  title: "Ichido 一度 — say it once",
  description: "The machine's alert, the caller's own words and the operator's decision become one case, in the caller's language.",
};

export const HOME = {
  nav: [
    { href: "#how", label: "How it works" },
    { href: "#screens", label: "Screens" },
    { href: "#rules", label: "Rules" },
  ],
  repo: { href: "https://github.com/CREVIOS/ichido", label: "GitHub" },
  signIn: "Staff sign in",
  primary: { href: "/operator", label: "Open the console" },
  secondary: { href: "/s/TABLE-A", label: "Help Point" },
  news: { label: "TSUNAGU", text: "Update the way we connect — Nagasaki" },
  title: ["Say it once.", "In your own language."],
  lead: "When an ATM keeps your card, the monitoring centre already knows the machine failed. Ichido joins that alert, your own words and the operator's decision into one case — in Bengali, English or easy Japanese.",
  how: {
    title: "How Ichido works",
    steps: [
      { k: "01 — Machine", t: "The ATM raises its own alert", b: "A Help Point beside the machine reports the fault the moment it happens. The case opens before anyone has to explain anything." },
      { k: "02 — Caller", t: "You say it once, in your language", b: "Speak or type. The assistant reads back what it understood; you correct it and confirm. It never asks for a PIN, card, account or ID number." },
      { k: "03 — Operator", t: "A person decides, with the bank's words", b: "The operator sees the alert, your original words and what you confirmed. Replies come only from the bank's approved catalogue." },
      { k: "04 — Next step", t: "You leave knowing what happens next", b: "Wait for the guard with their own estimate, or leave and be contacted. You explain the next step back before the case closes." },
    ],
  },
  screens: {
    title: "One case, four screens",
    lead: "Everyone sees the same case, and only the part they need.",
    items: [
      { href: "/operator", title: "Monitoring centre", sub: "監視センター", body: "Queue, machine state, the caller's own words beside the facts they confirmed, approved replies, dispatch." },
      { href: "/s/TABLE-A", title: "Help Point", sub: "বাংলা · English · やさしい日本語", body: "Scan the sticker, enter the operator's single-use code, say what happened." },
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
  // The hero illustration of the console. Station names are the fictional ones used throughout.
  preview: {
    badge: "Help Point · TABLE-A",
    badgeState: "Caller confirmed",
    queue: [
      { title: "長崎駅前 店舗外ATM", meta: "2分前", status: "review", lang: "bn" },
      { title: "浜町アーケード ATM", meta: "14分前", status: "field", lang: "en" },
      { title: "出島ワーフ ATM", meta: "31分前", status: "guided", lang: "ja" },
    ],
    words: "কার্ড বের হয়নি, টাকা পেয়েছি। আমি কি অপেক্ষা করব?",
    slots: {
      branch: { ja: "長崎駅前支店（架空）", bn: "নাগাসাকি স্টেশন শাখা (কাল্পনিক)", en: "Nagasaki Station branch (fictional)" },
      hours: { ja: "平日 9:00〜15:00", bn: "সোম–শুক্র, ৯:০০–১৫:০০", en: "weekdays 9:00–15:00" },
    },
  },
};
