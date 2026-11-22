import { FAULTS, MOBILE, isFault, type Fact, type Lang, type Status } from "@content/catalogue";

// Row shapes and formatting shared by the operator screens (same columns the web console reads).
export type Desk = {
  id: string; station: string; source: string; fault: string; status: Status; operator_id: string | null; lang: Lang | null;
  card_back: Fact; cash_received: Fact; confirmed_rev: number | null; caller_words: string | null; clarifying: boolean;
  remote_release: string | null; abandoned: boolean; created_at: string; finished_at: string | null;
};

export const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
export const when = (t: string) =>
  new Date(t).toDateString() === new Date().toDateString()
    ? hhmm(t)
    : new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const minutesAgo = (t: string) => Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000));
export const faultJa = (f: string) => (isFault(f) ? FAULTS[f].ja : MOBILE.operator.unknownFault);
export const errorJa = (code: string) => MOBILE.staff.errors[code] ?? MOBILE.staff.errors.server;
