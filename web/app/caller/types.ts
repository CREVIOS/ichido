import type { Lang, Fact, Status, FieldState, L10n } from "@/content/catalogue";

export type CallerCase = {
  id: string; station: string; fault: string; lang: Lang | null; confirmed_rev: number | null; status: Status;
  field_state: FieldState; eta: string | null; choice: string | null; teachback: string | null; teachback_result: string | null; needs_human: boolean;
};
export type Draft = { rev: number; card_back: Fact; cash_received: Fact; words: string | null; needs_clarification: boolean };
export type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
export type Station = { label: L10n };
