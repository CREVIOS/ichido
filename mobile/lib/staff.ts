import { useEffect, useState } from "react";
import { FAULTS, MOBILE, SLA, isFault, type Fact, type Lang, type Status, STAFF_JA } from "@content/catalogue";

// Row shapes and formatting shared by the operator screens (same columns the web console reads).
export type Desk = {
  fraud_at?: string | null;
  id: string; station: string; source: string; fault: string; status: Status; operator_id: string | null; lang: Lang | null;
  handler: string; queued_at: string | null;
  card_back: Fact; cash_received: Fact; confirmed_rev: number | null; caller_words: string | null; caller_words_ja?: string | null; clarifying: boolean;
  remote_release: string | null; abandoned: boolean; created_at: string; finished_at: string | null;
};

export const hhmm = (t: string) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
export const when = (t: string) =>
  new Date(t).toDateString() === new Date().toDateString()
    ? hhmm(t)
    : new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const minutesAgo = (t: string, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(t)) / 60000));
export const faultJa = (f: string) => (isFault(f) ? STAFF_JA.fault[f] : MOBILE.operator.unknownFault);
export const errorJa = (code: string) => MOBILE.staff.errors[code] ?? MOBILE.staff.errors.server;

// A clock for countdowns and "n minutes ago", ticking every 15 seconds.
export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

export type OpenDesk = Desk & { case_event: { at: string }[]; reply: { id: string }[] };
export type Targets = Partial<Record<string, number>>;
export type Sla = { tone: "ok" | "warn" | "late"; left: number };

// Same rule as web/app/operator/queue.tsx, with targets from ichido.sla_target:
// unclaimed → time since the fault; claimed without a reply → time since the claim.
export function slaOf(c: OpenDesk, targets: Targets, now: number): Sla | null {
  if (c.handler === "ai") return null;
  const start = c.queued_at ?? (c.operator_id ? c.case_event[0]?.at : c.created_at);
  const target = targets[c.operator_id ? "no_reply" : "unclaimed"];
  if (c.reply.length || !start || !target) return null;
  const left = Math.round(target - (now - Date.parse(start)) / 1000);
  return { tone: left < 0 ? "late" : left < target * (1 - SLA.warn) ? "warn" : "ok", left };
}
export const slaText = (s: Sla) => (s.tone === "late" ? SLA.late(Math.ceil(-s.left / 60)) : SLA.left(s.left));
