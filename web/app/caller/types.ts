import type { Lang, Fact, Status, FieldState, L10n } from "@/content/catalogue";

export type CallerCase = {
  transfer_reason: string | null;
  handler: "legacy" | "ai" | "queued" | "human";
  id: string; station: string; fault: string; lang: Lang | null; confirmed_rev: number | null; status: Status;
  field_state: FieldState; eta: string | null; choice: string | null; teachback: string | null; teachback_result: string | null; needs_human: boolean; rating: number | null; text_only: boolean;
  reply_id: string | null; flags: string[]; bank_status: string | null; bank_due: string | null;
  fraud?: boolean; notice?: string | null;
};
// triage: the AI's suggestion as catalogue codes (lib/triage.ts); nothing counts until the caller taps it.
export type Triage = { situation: string | null; taps: string[]; ask: string[]; clarify: boolean };
export type Draft = { rev: number; card_back: Fact; cash_received: Fact; words: string | null; needs_clarification: boolean; triage?: Triage | null };
export type Reply = { author: "human" | "ai"; id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
export type Station = { label: L10n };
