import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";

// Structured logs: one JSON line per event on stdout (Vercel logs), and the same entries shipped to
// Better Stack after the response when BETTERSTACK_SOURCE_TOKEN and BETTERSTACK_INGEST_HOST are set.
// Fields are a fixed set of codes, ids, statuses and numbers. Never log caller words, drafts, pairing
// codes, tokens or secrets: there is deliberately no free-text field.

export const VERSION = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

type Level = "info" | "warn" | "error";
export type Fields = {
  cmd?: string;
  role?: string;
  status?: number;
  code?: string;            // stable error/outcome code, e.g. forbidden, conflict, unauthorised
  duration_ms?: number;
  station?: string;
  incident?: string;
  fault?: string;
  repeat?: boolean;
  ttl_s?: number;
  db?: string;
  // device telemetry
  uptime_s?: number;
  free_heap?: number;
  rssi?: number;
  fw?: string;
  ack_ms?: number;
  poll_ms?: number;
  // unhandled errors (see errorFields)
  error?: string;
  error_code?: string;
  error_msg?: string;
  digest?: string;
  path?: string;
  method?: string;
  route_path?: string;
  route_type?: string;
};
type Entry = Fields & { dt: string; level: Level; message: string; service: "web"; version: string; route?: string; request_id?: string };

export function entry(level: Level, event: string, fields: Fields & { route?: string; request_id?: string } = {}): Entry {
  const e: Entry = { dt: new Date().toISOString(), level, message: event, service: "web", version: VERSION, ...fields };
  (level === "error" ? console.error : console.log)(JSON.stringify(e));
  return e;
}

export async function ship(entries: Entry[]): Promise<void> {
  const { BETTERSTACK_SOURCE_TOKEN: token, BETTERSTACK_INGEST_HOST: host } = process.env;
  if (!token || !host || entries.length === 0) return;
  try {
    const res = await fetch(/^https?:\/\//.test(host) ? host : `https://${host}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(entries),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error(JSON.stringify({ level: "warn", message: "log_ship_failed", status: res.status }));
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", message: "log_ship_failed", error: e instanceof Error ? e.name : "unknown" }));
  }
}

// Database errors can echo row values (e.g. "Failing row contains …"), so only their code is kept.
export function errorFields(e: unknown): Fields {
  if (!(e instanceof Error) && (typeof e !== "object" || e === null)) return { error: typeof e };
  const o = e as { name?: unknown; code?: unknown; message?: unknown; digest?: unknown };
  const code = typeof o.code === "string" ? o.code : undefined;
  return {
    error: typeof o.name === "string" ? o.name : "Error",
    error_code: code,
    error_msg: code === undefined && typeof o.message === "string" ? o.message.slice(0, 200) : undefined,
    digest: typeof o.digest === "string" ? o.digest : undefined,
  };
}

// One logger per request: entries are batched and shipped once, after the response is sent.
export function requestLog(route: string, req: Request) {
  const started = performance.now();
  const base = { route, request_id: req.headers.get("x-vercel-id") ?? randomUUID() };
  let batch: Entry[] = [];
  const write = (level: Level) => (event: string, fields: Fields = {}) => {
    // A new batch is scheduled whenever the previous one has gone, so entries written inside after() still ship.
    if (batch.length === 0) after(() => { const out = batch; batch = []; return ship(out); });
    batch.push(entry(level, event, { ...base, ...fields }));
  };
  return { info: write("info"), warn: write("warn"), error: write("error"), ms: () => Math.round(performance.now() - started) };
}
