import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { errorFields } from "./error-fields";
export { errorFields };

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
  uid?: string;             // staff user id on auth events (never an email or name)
  duration_ms?: number;
  count?: number;           // alerts delivered (lib/alerts.ts), feed items (lib/disaster-feeds.ts)
  station?: string;
  incident?: string;
  session?: string;         // training session id (lib/training.ts)
  // Ichido Bot (lib/bot-steps.ts)
  step?: string;
  run_id?: string;
  presence?: string;        // online operators seen, or "unavailable"
  model_ms?: number;
  locale?: string;
  turn?: number;
  commit_ms?: number;
  total_s?: number;
  fault?: string;
  repeat?: boolean;
  ttl_s?: number;
  db?: string;
  // device telemetry
  uptime_s?: number;
  free_heap?: number;
  rssi?: number;
  fw?: string;
  fw_target?: string;       // firmware version the server offers (/api/device/firmware)
  ack_ms?: number;
  poll_ms?: number;
  // disaster feeds (lib/disaster-feeds.ts): feed source, alert and proposal ids, counts
  source?: string;
  alert?: number;
  proposal?: number;
  // unhandled errors (see errorFields)
  error?: string;
  error_code?: string;
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
    const url = new URL(host.includes("://") ? host : `https://${host}`);
    if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("invalid log destination");
    const res = await fetch(url, {
      method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(entries),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error(JSON.stringify({ level: "warn", message: "log_ship_failed", status: res.status }));
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", message: "log_ship_failed", ...errorFields(e) }));
  }
}

// One logger per request: entries are batched and shipped once, after the response is sent.
export function requestLog(route: string) {
  const started = performance.now();
  const base = { route, request_id: randomUUID() };
  let batch: Entry[] = [];
  const write = (level: Level) => (event: string, fields: Fields = {}) => {
    // A new batch is scheduled whenever the previous one has gone, so entries written inside after() still ship.
    if (batch.length === 0) after(() => { const out = batch; batch = []; return ship(out); });
    batch.push(entry(level, event, { ...base, ...fields }));
  };
  return { info: write("info"), warn: write("warn"), error: write("error"), ms: () => Math.round(performance.now() - started) };
}
