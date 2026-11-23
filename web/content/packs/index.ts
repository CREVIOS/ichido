// Scenario packs: Ichido at any staffed service point, not only an ATM. A station's kind picks its pack; a pack
// brings its own situations (the desk's fault codes), caller taps, approved replies with rules, responder wording and
// hand-off recipients. The ATM pack's content stays in content/faults.ts and catalogue.ts; content/faults.ts merges
// the others in, so every screen and the SQL rules see one catalogue (supabase/migrations/20261123160000_packs.sql).
// No runtime import from catalogue.ts or faults.ts: they import this file.
import type { FieldState, L10n, Lang } from "../catalogue.ts";
import type { Pack, PackId, PackMeta, PackReply, Rule, Tap } from "./types.ts";
import { EXCLUSIVE_GROUPS, GROUP_TITLE, NEVER_ASK_ID, etaNote, fieldText, staffField, toldText, waitingText } from "./common.ts";
import { HOSPITAL } from "./hospital.ts";
import { CITY } from "./city.ts";
import { TRANSIT } from "./transit.ts";
import { SHELTER, SHELTER_NOTICES } from "./shelter.ts";

export type { Pack, PackId, PackMeta, Tap } from "./types.ts";
export { EXCLUSIVE_GROUPS, GROUP_TITLE, SHELTER_NOTICES };
export { PACK_DESK } from "./desk.ts";

// The flagship. Its situations, taps and replies are the fault paths in content/faults.ts.
const ATM: PackMeta = {
  id: "atm", kinds: ["atm", "mobile_branch"], name: { staff: "ATM", en: "ATM" }, place: "ATM",
  responder: { staff: "警備員", caller: { ja: "けいびの 人", en: "a security guard", bn: "নিরাপত্তাকর্মী", vi: "nhân viên bảo vệ", id: "petugas keamanan", ne: "सुरक्षाकर्मी" } },
  recipients: { bank: "銀行", police: "警察", security: "警備会社" },
};

export const CONTENT_PACKS: Pack[] = [HOSPITAL, CITY, TRANSIT, SHELTER];
export const PACKS: Record<PackId, PackMeta> = { atm: ATM, hospital: HOSPITAL, city_office: CITY, transit: TRANSIT, shelter: SHELTER };
export const PACK_IDS = Object.keys(PACKS) as PackId[];
const CONTENT: Partial<Record<PackId, Pack>> = Object.fromEntries(CONTENT_PACKS.map((p) => [p.id, p]));

// station.kind → pack (an unknown kind is treated as an ATM, the database's default).
export const packOfKind = (kind: string | null | undefined): PackId =>
  PACK_IDS.find((id) => PACKS[id].kinds.includes(kind ?? "")) ?? "atm";
export const KINDS = PACK_IDS.flatMap((id) => PACKS[id].kinds);

const SITUATION_PACK: Record<string, PackId> = Object.fromEntries(CONTENT_PACKS.flatMap((p) => Object.keys(p.situations).map((s) => [s, p.id])));
// A case's situation (desk.fault) → its pack. Everything that is not another pack's situation is an ATM fault.
export const packOfFault = (fault: string | null | undefined): PackId => (fault && SITUATION_PACK[fault]) || "atm";
export const contentPack = (fault: string | null | undefined): Pack | undefined => CONTENT[packOfFault(fault)];
// The situation a press on this station's Help Point opens.
export const defaultSituation = (kind: string | null | undefined): string | null => CONTENT[packOfKind(kind)]?.device ?? null;

// Merged into content/faults.ts (FAULT_NAMES, FAULT_STAFF, CALLER_FLAGS, FAULT_REPLIES, REPLY_RULES).
const all = <T>(f: (p: Pack) => Record<string, T>) => Object.assign({}, ...CONTENT_PACKS.map(f)) as Record<string, T>;
export const PACK_SITUATION_NAMES = all((p) => Object.fromEntries(Object.entries(p.situations).map(([k, s]) => [k, s.name])));
export const PACK_SITUATION_STAFF = all((p) => Object.fromEntries(Object.entries(p.situations).map(([k, s]) => [k, s.staff])));
export const PACK_TAPS: Record<string, Tap> = all((p) => p.taps);
export const PACK_REPLIES: Record<string, PackReply> = all((p) => p.replies);
export const PACK_RULES: Record<string, Rule> = all((p) => Object.fromEntries(Object.entries(p.replies).map(([k, r]) => [k, { ...r.rule, pack: p.id }])));
export const PACK_RECIPIENTS: Record<string, string> = Object.assign({}, ...PACK_IDS.map((id) => PACKS[id].recipients));
export const isUrgentTap = (flag: string) => Boolean(PACK_TAPS[flag]?.urgent);

// A station default is not a stated need. Expand details for the selected need or a corrected situation.
export function packTapsFor(p: Pack, fault: string, flags: readonly string[]): string[] {
  const selected = flags.map(f => p.taps[f]?.suggests).filter((s): s is string => Boolean(s));
  const needs = p.common.filter(f => p.taps[f]?.group === "need");
  const details = flags.includes("diet_allergy") ? ["allergy_me","allergy_child","allergy_other"] : (selected.length || fault === p.device || flags.includes("need_other") ? selected : [fault]).flatMap(s => p.bySituation[s] ?? []);
  return [...new Set([...needs, "need_other", ...p.common, ...details])].filter(f =>
    !f.startsWith("allergy_") || flags.includes("diet_allergy"));
}
// Every tap a pack accepts from its callers (the server refuses others).
export const packTaps = (p: Pack) => [...new Set(["need_other", ...p.common, ...Object.values(p.bySituation).flat()])];

// Caller wording for a non-ATM case: what is never asked, the assistant's limits, where to find a person, and what
// the responder is doing. catalogue.ts callerPack() returns the ATM's own wording for ATM cases.
export function packCaller(p: Pack) {
  return {
    neverAsk: NEVER_ASK_ID,
    scope: p.scope,
    waiting: (l: Lang) => waitingText(p.hint, l),
    humanAsked: (l: Lang) => toldText(p.hint, l),
    field: (s: FieldState, l: Lang) => fieldText(s, p.responder.caller, l),
    eta: (eta: string | null | undefined, l: Lang) => etaNote(eta, l),
  };
}
export const packStaffField = (id: PackId): Record<FieldState, string> | null => (id === "atm" ? null : staffField(PACKS[id].responder.staff));

// Every Japanese caller string the packs add beyond situations, taps and replies (scripts/check-yasashii.mjs).
export function packCallerStrings(): Record<string, L10n> {
  const out: Record<string, L10n> = { NEVER_ASK_ID, ...Object.fromEntries(Object.entries(GROUP_TITLE).map(([k, v]) => [`group.${k}`, v])) };
  for (const p of CONTENT_PACKS) {
    out[`${p.id}.hint`] = p.hint;
    if (p.scope) out[`${p.id}.scope`] = p.scope;
    out[`${p.id}.responder`] = p.responder.caller;
    for (const s of ["requested", "on_way", "arrived", "done"] as FieldState[]) out[`${p.id}.field.${s}`] = { ja: fieldText(s, p.responder.caller, "ja") } as L10n;
    out[`${p.id}.waiting`] = { ja: waitingText(p.hint, "ja") } as L10n;
  }
  out.eta = { ja: etaNote("10-20", "ja") } as L10n;
  out.etaPending = { ja: etaNote(null, "ja") } as L10n;
  return out;
}
