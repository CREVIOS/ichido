import { CALLER_FLAGS, FRONTLINE, LANGS, REPLY_RULES, UI, replyBlock, replyOf, type Lang } from "./catalogue.ts";
import { frontlineNumber } from "./numbers.ts";

export type Transfer = { priority: 0 | 1 | 2; reason: string };
const DANGER = /can't breathe|cannot breathe|hard to breathe|chest pain|heavy bleeding|missing child|child is missing|told me to transfer|coaching me|শ্বাস নিতে|বুকে ব্যথা|রক্তপাত|শিশু নিখোঁজ|বাচ্চা হারিয়ে|টাকা পাঠাতে বল|khó thở|đau ngực|chảy nhiều máu|lạc con|bảo tôi chuyển tiền|sesak napas|sulit bernapas|nyeri dada|anak hilang|disuruh transfer|सास फेर्न|छाती दुख|रगत बग|बच्चा हरायो|पैसा पठाउन भन|息ができ|息が苦し|いきがくるし|胸が痛|子どもがいない|こどもがみつから|振り込め/u;
const PERSON = /\b(?:human|operator|agent|real person|a person|someone on staff|talk to someone|speak to someone|staff member)\b|মানুষ|কর্মী|অপারেটর|কারো সাথে কথা|কারও সঙ্গে কথা|nhân viên|người thật|petugas|operator|orang sungguhan|कर्मचारी|मान्छे|मानिस|अपरेटर|人と話|人とはな|人に代わ|係の人|担当者|オペレーター/u;
const NEED = /card.*(?:stuck|kept|retained|didn't come back|did not come back)|missing cash|cash.*didn.t come|scared|frightened|dispute|can't continue|ভয়|ভয়|কার্ড আটকে|rất sợ|bị giữ thẻ|takut|kartu tertelan|डर लाग|कार्ड अड्क|こわい|怖い|カードが戻ら/u;

export function screenTurn(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'");
  const match = normalized + " " + normalized.replace(/\s+/g, "");
  const urgentTap = Object.values(CALLER_FLAGS).some((tap) => tap.urgent &&
    Object.values(tap.label).some((s) => normalized.includes(s.normalize("NFKC").toLowerCase())));
  let transfer: Transfer | null = null;
  if (urgentTap || DANGER.test(match)) transfer = { priority: 0, reason: "suspected_risk" };
  else if (PERSON.test(match)) transfer = { priority: 1, reason: "human_request" };
  else if (NEED.test(match)) transfer = { priority: 1, reason: "staff_needed" };
  return { withheld: frontlineNumber(text), transfer };
}

export type ConversationKey = "greeting" | "disclosure" | "queued" | "connected" | "fallback" | "readback" | "withheld";
export function conversationText(key: ConversationKey, lang: Lang) {
  return key === "withheld" ? UI.numbersWithheld[lang] : FRONTLINE[key][lang];
}

export function approvedInfo(intent: string, fault: string, flags: string[], confirmed: boolean, lang: Lang) {
  const rule = Object.hasOwn(REPLY_RULES, intent) && REPLY_RULES[intent];
  if (!rule || !rule.autonomous || flags.length !== 1 || flags[0] !== "need_news") return null;
  if (replyBlock(intent, false, { fault, flags, confirmed, card_back: "unknown", remote_release: null })) return null;
  const words = replyOf(intent)?.text({});
  return words && LANGS.every((l) => words[l]?.trim() && !frontlineNumber(words[l])) ? words[lang] : null;
}
