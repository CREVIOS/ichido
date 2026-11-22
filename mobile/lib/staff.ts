import { useEffect, useState } from "react";
import { FAULTS, MOBILE, SLA, isFault, type Fact, type Lang, type Status } from "@content/catalogue";

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
export const minutesAgo = (t: string, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(t)) / 60000));
export const faultJa = (f: string) => (isFault(f) ? FAULTS[f].ja : MOBILE.operator.unknownFault);
export const errorJa = (code: string) => MOBILE.staff.errors[code] ?? MOBILE.staff.errors.server;

// A clock for countdowns and "n minutes ago", ticking every 15 seconds.
export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

export type Sla = { kind: string; tone: "ok" | "warn" | "late"; left: number };

// Same rule as web/app/operator/queue.tsx: unclaimed → claim target; claimed without a reply → first-reply target.
export function slaOf(c: Desk, replied: boolean, now: number): Sla | null {
  if (c.finished_at || replied || c.status === "guided") return null;
  const kind = c.operator_id ? "reply" : "claim";
  const target = kind === "claim" ? SLA.claimS : SLA.firstReplyS;
  const left = Math.round(target - (now - Date.parse(c.created_at)) / 1000);
  return { kind, tone: left < 0 ? "late" : left < target * (1 - SLA.warn) ? "warn" : "ok", left };
}
export const slaText = (s: Sla) => (s.tone === "late" ? SLA.late(Math.ceil(-s.left / 60)) : SLA.left(s.left));
