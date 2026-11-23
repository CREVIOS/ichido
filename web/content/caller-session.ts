import type { Lang, Fact, Status, FieldState, L10n } from "./catalogue.ts";

export type CallerCase = {
  transfer_reason: string | null;
  handler: "legacy" | "ai" | "queued" | "human";
  id: string; station: string; fault: string; lang: Lang | null; confirmed_rev: number | null; status: Status;
  field_state: FieldState; eta: string | null; choice: string | null; teachback: string | null; teachback_result: string | null; needs_human: boolean; rating: number | null; text_only: boolean;
  callback_channel: string | null; confirmed_flags: string[]; eta_at: string | null;
  reply_id: string | null; flags: string[]; bank_status: string | null; bank_due: string | null;
  fraud?: boolean; notice?: string | null;
};
// triage: the AI's suggestion as catalogue codes (lib/triage.ts); nothing counts until the caller taps it.
export type Triage = { situation: string | null; taps: string[]; ask: string[]; clarify: boolean };
export type Draft = { rev: number; card_back: Fact; cash_received: Fact; words: string | null; words_lang: Lang | null; needs_clarification: boolean; triage?: Triage | null };
export type Reply = { manual_version: string; author: "human" | "ai"; id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
export type Station = { label: L10n; branch: L10n; hours: L10n; contact: string | null };
export type Turn = { seq: number; rev: number; speaker: string; words: string | null; wording: string; locale: Lang };
export type FollowUpCase = Pick<CallerCase,"id"|"fault"|"lang"|"bank_status"|"bank_due"|"callback_channel"> & {
  station_id: string; reply: Pick<Reply,"intent"|"slots"|"manual_version"> | null; station: Station | null;
};
export type CallerView = {
  screen?: { card: CallerCase; draft: Draft; station: Station; reply: Reply | null; turns: Turn[]; generation: string };
  staff?: boolean; reason?: import("./caller-journey.ts").EndReason; lang?: Lang; follow?: FollowUpCase | null;
};

export function canConfirm(atm: boolean, draft: Draft, flags: readonly string[]) {
  if (draft.needs_clarification) return false;
  return atm ? draft.card_back !== "unknown" || draft.cash_received !== "unknown" || flags.includes("need_other") : flags.length > 0;
}
