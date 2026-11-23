// Types for scenario packs (web/content/packs/*). Type-only, so pack files never import catalogue.ts at runtime.
import type { L10n, ReplySlots } from "../catalogue.ts";

export type PackId = "atm" | "hospital" | "city_office" | "transit" | "shelter";

// A caller's own tap. suggests: the situation it points to (a hint for the operator, never automatic).
// urgent: a red flag (only the pack's urgent reply may be sent while it is on). group: shown under one heading;
// groups in EXCLUSIVE_GROUPS (packs/common.ts) take one answer.
export type Tap = { label: L10n; staff: string; suggests?: string; urgent?: boolean; group?: string };

// faults: the situations the reply fits (omitted = any situation of its pack). needsFlags: at least one of these
// taps. blockedBy: never while any of these is on. Enforced in SQL by ichido.reply_rule.
export type Rule = { autonomous?: boolean; pack?: PackId; faults?: string[]; needsFlags?: string[]; blockedBy?: string[] };
export type PackReply = { code: string; title: string; text: (s: ReplySlots) => L10n; offersChoice?: boolean; rule: Rule };

// Who serves a pack's cases. The field role and /field serve every pack, with this wording.
export type Responder = { staff: string; caller: L10n };

export type PackMeta = {
  id: PackId;
  kinds: string[];                       // station.kind values that use this pack
  name: { staff: string; en: string };
  place: string;                         // what staff call the station, formal Japanese
  responder: Responder;
  recipients: Record<string, string>;    // hand-off codes and their formal Japanese names
  why?: string;                          // one sourced sentence for the landing page (English)
};

export type Pack = PackMeta & {
  device: string;                                          // the situation a Help Point press opens
  situations: Record<string, { name: L10n; staff: string }>;
  taps: Record<string, Tap>;
  common: string[];                                        // taps shown in every situation of the pack
  bySituation: Record<string, string[]>;                   // and these for the situation (or one the caller pointed to)
  replies: Record<string, PackReply>;
  scope?: L10n;                                            // what the assistant never does here
  hint: L10n;                                              // where to find a person right now
};
