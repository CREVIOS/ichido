import type { Lang, Status, Fact, FieldState, L10n } from "@/content/catalogue";

export type Station = { id: string; label: L10n; kind?: string };
export type Desk = {
  id: string; station: string; source: string; fault: string; status: Status; operator_id: string | null; lang: Lang | null;
  card_back: Fact; cash_received: Fact; confirmed_rev: number | null; caller_words: string | null; caller_words_ja?: string | null; clarifying: boolean;
  remote_release: string | null; abandoned: boolean; text_only?: boolean; created_at: string; finished_at: string | null; stated_amount?: number | null;
  fraud_at?: string | null; abusive_at?: string | null; mass_incident?: string | null;
  triage?: { situation: string | null; taps: string[]; ask: string[]; model?: string } | null;   // the intake AI's suggestion (codes)
  ai_summary?: string | null; ai_summary_by?: string | null; ai_summary_at?: string | null;
};
export type CallerCard = {
  field_state: FieldState; eta: string | null; choice: string | null; reply_id: string | null;
  teachback: string | null; teachback_ja: string | null; teachback_reply: string | null; needs_human: boolean;
  notice?: string; flags: string[]; bank_status: string | null; bank_due: string | null;
};
export type OpenDesk = Desk & {
  case_event: { at: string }[]; reply: { id: string; sent_at?: string }[]; escalation: { reason: string }[];
};
export type Targets = Partial<Record<string, number>>;
export type CaseEvent = { id: number; actor: string; actor_name: string | null; kind: string; data: Record<string, string>; at: string };
export type Reply = { id: string; intent: string; slots: { branch?: L10n; hours?: L10n }; sent_at: string };
export type Job = { acknowledged_at?: string | null; declined_at?: string | null; provider_at?: string | null; help_at?: string | null; assignee: string; state: FieldState; eta: string | null };
export type Guard = { uid: string; display_name: string };
export type BotStep = { step: string; status: "waiting" | "done" | "skipped"; code: string | null; due_at: string | null; data: Record<string, unknown>; at: string };
export type Suggestion = {
  intent: string | null; dispatch: boolean; guard: { uid: string; name: string } | null; fraud?: boolean; reasons: string[]; risks: string[];
  model: string; steps: { tool: string; ms: number }[]; ms: number;
};
export type Prepared = { rev: number; suggestion: Suggestion };
export type Run =(name: string, body?: Record<string, unknown>) => Promise<unknown>;

export const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
export const when = (t: string) =>
  new Date(t).toDateString() === new Date().toDateString() ? hhmm(t) : new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
