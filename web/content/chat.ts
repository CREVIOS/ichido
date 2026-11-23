import { ANSWER, CALLER_FLAGS, FACTS, FACT_KEYS, FAULT_UI, FRONTLINE, GROUP_TITLE, UI, sentText, callerPack, flagsFor, type Fact, type ReplySlots, type FactKey, type Lang, type L10n } from "./catalogue.ts";
import { committedReadback } from "./frontline-policy.ts";
import { canConfirm, type CallerCase, type Draft, type Reply, type Turn } from "./caller-session.ts";

// All non-English wording awaits native review.
export const CHAT = {
  settings: {en:"Reading settings", ja:"よみかた", bn:"পড়ার সেটিংস", vi:"Cài đặt đọc", id:"Pengaturan baca", ne:"पढ्ने सेटिङ"},
  details: {en:"Case details", ja:"そうだんの くわしい こと", bn:"কেসের বিবরণ", vi:"Chi tiết hỗ trợ", id:"Rincian kasus", ne:"केसको विवरण"},
  operator: {en:"Operator", ja:"うけつけの 人", bn:"কর্মী", vi:"Nhân viên", id:"Petugas", ne:"कर्मचारी"},
  asked: {en:"Person requested", ja:"人を よびました", bn:"কর্মীকে ডাকা হয়েছে", vi:"Đã gọi nhân viên", id:"Petugas dipanggil", ne:"कर्मचारी बोलाइयो"},
  joined: {en:"Person connected", ja:"人と つながりました", bn:"কর্মী যুক্ত হয়েছেন", vi:"Đã kết nối nhân viên", id:"Petugas terhubung", ne:"कर्मचारी जोडिनुभयो"},
  delivered: {en:"Delivered", ja:"とどきました", bn:"পৌঁছেছে", vi:"Đã chuyển", id:"Terkirim", ne:"पुग्यो"},
  sending: {en:"Sending…", ja:"おくって います", bn:"পাঠানো হচ্ছে…", vi:"Đang gửi…", id:"Mengirim…", ne:"पठाउँदै…"},
  retry: {en:"Not sent — retry", ja:"おくれません。もういちど おくる", bn:"পাঠানো যায়নি — আবার পাঠান", vi:"Chưa gửi — thử lại", id:"Belum terkirim — coba lagi", ne:"पठाइएन — फेरि प्रयास गर्नुहोस्"},
  typing: {en:"Ichido is replying…", ja:"一度が へんじを 書いて います", bn:"ইচিদো উত্তর দিচ্ছে…", vi:"Ichido đang trả lời…", id:"Ichido sedang menjawab…", ne:"इचिदो जवाफ दिँदै छ…"},
  message: {en:"Message", ja:"文を かく", bn:"বার্তা", vi:"Tin nhắn", id:"Pesan", ne:"सन्देश"},
  options: {en:"Other answers", ja:"ほかの こたえ", bn:"অন্যান্য উত্তর", vi:"Câu trả lời khác", id:"Jawaban lain", ne:"अन्य उत्तर"},
} satisfies Record<string,L10n>;

export type ChatLine = { id: number; from: "ai" | "caller" | "operator" | "system"; text: string; lang: Lang };
export function callerLines(turns: Turn[], lang: Lang, reply?: Reply | null): ChatLine[] {
  const lines: ChatLine[] = [];
  const approved = reply && turns.findLast(t => t.wording === reply.intent && t.speaker === reply.author);
  for (const t of turns) {
    let from: ChatLine["from"] = "system";
    let text = "";
    let locale = lang;
    if (reply && t === approved) {
      from = reply.author === "human" ? "operator" : "ai";
      text = sentText(reply,lang) ?? "";
    } else if (t.words && t.speaker === "caller") {
      from = "caller"; text = t.words; locale = t.locale;
    } else if (t.wording === "readback" && t.speaker === "ai") {
      from = "ai"; text = t.facts ? committedReadback(t.facts,lang) : FRONTLINE.readback[lang];
    } else if (t.wording === "greeting") {
      from = "ai"; text = FRONTLINE.greeting[lang];
    } else if (t.wording === "withheld") {
      if (lines.at(-1)?.text === UI.numbersWithheld[lang]) continue;
      text = UI.numbersWithheld[lang];
    } else if (["queued","connected","risk","fallback"].includes(t.wording)) {
      text = FRONTLINE[t.wording as "queued" | "connected" | "risk" | "fallback"][lang];
    } else if (t.speaker === "caller" && (t.wording === "confirm" || t.wording === "change" || t.wording === "unsure")) {
      from = "caller"; text = t.wording === "confirm" ? UI.confirm[lang] : t.wording === "change" ? FRONTLINE.change[lang] : ANSWER.unknown[lang];
    }
    if (text) lines.push({id:t.seq,from,text,lang:locale});
  }
  return lines;
}

export type Choice = { label: string; name?: string; selected?: boolean; act: string; fields?: Record<string,unknown>; question?: FactKey };
export function chatChoices(card: CallerCase, draft: Draft, lang: Lang, question: FactKey | null): Choice[] {
  const choices: Choice[] = [];
  const pack = callerPack(card.fault);
  if (card.confirmed_rev === null) {
    if (question && pack.atm && !card.flags.includes("need_other")) {
      for (const value of ["yes","no","unknown"] as const) choices.push({label:ANSWER[value][lang], name:FACTS[question].question[lang] + " — " + ANSWER[value][lang], selected:draft[question] === value, act:"facts",fields:{key:question,value}});
      choices.push({label:CHAT.options[lang],act:"options"});
      return choices;
    }
    if (canConfirm(pack.atm,draft,card.flags)) choices.push({label:UI.confirm[lang],act:"confirm"});
    if (pack.atm && !card.flags.includes("need_other")) {
      for (const key of FACT_KEYS) choices.push({label:FACTS[key].question[lang],act:"question",question:key});
    }
    const flags = [...new Set([...(draft.triage?.taps ?? []), ...flagsFor(card.fault,card.flags)])];
    for (const flag of flags) {
      const tap = CALLER_FLAGS[flag];
      if (!tap) continue;
      const selected = card.flags.includes(flag);
      const group = (tap.group && GROUP_TITLE[tap.group]) || FAULT_UI.flagsTitle;
      choices.push({label:tap.label[lang],name:group[lang] + " — " + tap.label[lang],selected,act:"tap",fields:{flag,on:!selected}});
    }
  }
  if (card.handler === "ai" && draft.rev > 0) {
    choices.splice(choices[0]?.act === "confirm" ? 1 : 0, 0, {label:FRONTLINE.change[lang],act:"change"});
    choices.push({label:ANSWER.unknown[lang],act:"unsure"});
  }
  return choices;
}

export type MonitorTurn = {
  seq: number; at:string; delivery:string; manual_version:string | null; slots: ReplySlots | null; locale: Lang; words: string | null; ja: string | null; speaker: string; wording: string;
  facts: { flag?: string; on?: boolean; card_back?: Fact; cash_received?: Fact; triage?: { taps: string[]; ask: string[]; situation: string | null } };
};

export function monitorText(t: MonitorTurn, lang: Lang = t.locale) {
  if (t.words) return lang === t.locale ? t.words : t.ja;
  if (t.wording === "withheld") return UI.numbersWithheld[lang];
  if (t.wording === "tap" && t.facts.flag) return `${CALLER_FLAGS[t.facts.flag]?.label[lang]} · ${ANSWER[t.facts.on ? "yes" : "no"][lang]}`;
  if (t.wording === "facts") return FACT_KEYS.flatMap(key => t.facts[key] ? [FACTS[key].question[lang] + " — " + ANSWER[t.facts[key]][lang]] : []).join(" ");
  if (t.wording === "readback" && t.facts.card_back && t.facts.cash_received) return committedReadback({card_back:t.facts.card_back,cash_received:t.facts.cash_received,triage:t.facts.triage},lang);
  if (t.wording === "confirm") return UI.confirm[lang];
  if (t.wording === "unsure") return UI.unsure[lang];
  if (Object.hasOwn(FRONTLINE,t.wording)) return FRONTLINE[t.wording as keyof typeof FRONTLINE][lang];
  return t.manual_version && sentText({ manual_version:t.manual_version,intent:t.wording,slots:t.slots ?? {} },lang);
}

export function monitorEvent(wording:string) {
  return ["start","connected","queued","risk","withheld","fallback"].includes(wording);
}
export function sameMonitorGroup(t:MonitorTurn, other?:MonitorTurn) {
  return other?.speaker === t.speaker && !monitorEvent(other.wording) && Math.abs(Date.parse(t.at)-Date.parse(other.at)) < 300000;
}
