import type { Lang, ReplySlots } from "./catalogue.ts";
import { manual as v1 } from "./manual-v1.ts";
import { manual as v2 } from "./manual-v2.ts";
import { manual as v3 } from "./manual-v3.ts";

const versions = new Map([["retained-card/v1", v1], ["retained-card/v2", { ...v1, ...v2 }], ["retained-card/v3", { ...v1, ...v2, ...v3 }]]);
export type SentReply = { manual_version: string; intent: string; slots: ReplySlots };

export function sentText(reply: SentReply, lang: Lang) {
  const manual = versions.get(reply.manual_version);
  if (!manual || !Object.hasOwn(manual, reply.intent)) return null;
  return manual[reply.intent][lang].replace(/\{(branch|hours|reference)\}/g, (_, key: keyof ReplySlots) =>
    key === "reference" ? reply.slots.reference ?? "—" : reply.slots[key]?.[lang] ?? reply.slots[key]?.en ?? "");
}
