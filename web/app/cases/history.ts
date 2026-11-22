import type { SupabaseClient } from "@supabase/supabase-js";
import type { Desk } from "../operator/types";
import { CASES } from "../../content/staff.ts";

export const PAGE_SIZE = 50;
export type Filters = {
  status: "all" | keyof typeof CASES.statuses;
  lang: "all" | keyof typeof CASES.languages;
  period: "all" | keyof typeof CASES.days;
  search: string;
};
export const allCases: Filters = { status: "all", lang: "all", period: "all", search: "" };
export type HistoryRow = Pick<Desk, "id" | "station" | "fault" | "status" | "lang" | "created_at" | "finished_at" | "abandoned"> & {
  atm: { label: { ja: string } };
  reply: { sent_at: string }[];
  case_event: { actor_name: string | null }[];
};

export function periodStart(period: Filters["period"], now: Date) {
  if (period === "all") return null;
  const day = 86_400_000;
  const jst = 9 * 3_600_000;
  const today = Math.floor((now.getTime() + jst) / day) * day - jst;
  return new Date(today - { today: 0, week: 6, month: 29 }[period] * day).toISOString();
}

// Quote a literal PostgreSQL regex inside a quoted PostgREST filter value.
function stationPattern(search: string) {
  const literal = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return JSON.stringify(literal);
}

export async function readHistory(db: SupabaseClient, filters: Filters, limit: number, signal?: AbortSignal) {
  const since = periodStart(filters.period, new Date());
  const rows: HistoryRow[] = [];
  // Seek by both sort keys so a new arrival cannot shift an export's page boundaries.
  while (rows.length < limit) {
    const size = Math.min(500, limit - rows.length);
    const q = db.from("desk").select(`
      id, station, fault, status, lang, created_at, finished_at, abandoned,
      atm:station!desk_station_fkey!inner(label), reply(sent_at), case_event(actor_name)
    `).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(size)
      .order("sent_at", { referencedTable: "reply" }).limit(1, { referencedTable: "reply" })
      .eq("case_event.kind", "claimed").order("id", { referencedTable: "case_event" }).limit(1, { referencedTable: "case_event" });
    if (filters.status === "open") q.is("finished_at", null);
    if (filters.status === "done") q.not("finished_at", "is", null).eq("abandoned", false);
    if (filters.status === "abandoned") q.eq("abandoned", true);
    if (filters.lang !== "all") q.eq("lang", filters.lang);
    if (since) q.gte("created_at", since);
    if (filters.search.trim()) {
      const value = stationPattern(filters.search.trim());
      q.or(`id.imatch.${value},label->>ja.imatch.${value}`, { referencedTable: "atm" });
    }
    const last = rows.at(-1);
    if (last) q.or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`);
    if (signal) q.abortSignal(signal);
    const { data, error } = await q.overrideTypes<HistoryRow[], { merge: false }>();
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) break;
  }
  return rows;
}

export function firstReplySeconds(row: HistoryRow) {
  const first = row.reply[0];
  return first ? Math.max(0, Math.round((Date.parse(first.sent_at) - Date.parse(row.created_at)) / 1000)) : null;
}

export function replySegments(seconds: number | null) {
  return seconds === null ? 0 : Math.max(1, 6 - Math.floor(seconds / 60));
}

function csvCell(value: string | number | boolean | null) {
  const text = String(value ?? "");
  const safe = /^\s*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function historyCsv(rows: HistoryRow[]) {
  const lines = rows.map((r) => [
    r.id, r.station, r.atm.label.ja, r.fault, r.status, r.lang, r.created_at, firstReplySeconds(r), r.finished_at, r.abandoned,
  ].map(csvCell).join(","));
  return "\uFEFF" + [CASES.csvColumns.join(","), ...lines].join("\r\n") + "\r\n";
}
