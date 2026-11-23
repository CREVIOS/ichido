import "server-only";
import { admin, priv, rpc } from "@/lib/server";
import { feedEntries, fromJma, fromP2P, noticeFor, type HazardAlert } from "@/lib/hazard";
import { errorFields, type Fields } from "@/lib/log";

// One poll of the official feeds (run every minute by /api/cron/disaster). Alerts for Nagasaki are stored and, when
// they reach our ATM stations, become a disaster proposal that an operator or manager confirms or dismisses.
// Nothing here changes what a caller sees.

const JMA_FEEDS = ["https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml", "https://www.data.jma.go.jp/developer/xml/feed/extra.xml"];
// P2PQuake allows 60 requests a minute per IP; one a minute is plenty (551 earthquake, 552 tsunami, 556 EEW).
const P2P = "https://api.p2pquake.net/v2/history?codes=551&codes=552&codes=556&limit=20";
const MAX_FEED_BYTES = 2 << 20;
const MAX_BULLETIN_BYTES = 4 << 20;
const BULLETINS_PER_POLL = 20;
const TIMEOUT_MS = 8000;

type Got = { status: number; text?: string; lastModified?: string };

// GET with a timeout, no redirects and a byte cap; the body is text and nothing else is trusted.
async function get(url: string, maxBytes: number, since?: string | null): Promise<Got> {
  const res = await fetch(url, {
    redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
    headers: { "user-agent": "ichido-disaster-feed/1.0", ...(since && { "if-modified-since": since }) },
  });
  if (res.status !== 200) { await res.body?.cancel(); return { status: res.status }; }
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RangeError("feed_too_large"); }
    chunks.push(value);
  }
  return { status: 200, text: Buffer.concat(chunks).toString("utf8"), lastModified: res.headers.get("last-modified") ?? undefined };
}

export type Ingested = { alert: number | null; proposal: number | null; stations?: string[] };

// Store one alert (the database dedupes by source id) and propose disaster mode for the stations it reaches.
export async function ingest(a: HazardAlert, log: (event: string, f: Fields) => void): Promise<Ingested> {
  const out = await rpc<Ingested>("ingest_hazard", {
    p_source: a.source, p_source_id: a.source_id, p_kind: a.kind, p_severity: a.severity, p_areas: a.areas,
    p_issued: a.issued_at, p_expires: a.expires_at, p_notice: noticeFor(a),
  });
  if (out.alert) log("hazard_alert", { source: a.source, alert: out.alert, code: `${a.kind}:${a.severity}` });
  if (out.proposal && out.stations?.length) log("disaster_proposed", { proposal: out.proposal, alert: out.alert ?? undefined, code: noticeFor(a), count: out.stations.length });
  return out;
}

async function jmaAlerts(log: (event: string, f: Fields) => void): Promise<HazardAlert[]> {
  const urls: string[] = [];
  const states: { source: string; last_modified: string | null; checked_at: string }[] = [];
  for (const feed of JMA_FEEDS) {
    const source = `jma_${feed.split("/").pop()!.replace(".xml", "")}`;
    const { data: state } = await priv().from("feed_state").select("last_modified").eq("source", source).maybeSingle();
    const got = await get(feed, MAX_FEED_BYTES, state?.last_modified);
    if (got.status === 304) continue;
    if (got.status !== 200) { log("feed_status", { source, status: got.status }); continue; }
    urls.push(...feedEntries(got.text!));
    states.push({ source, last_modified: got.lastModified ?? null, checked_at: new Date().toISOString() });
  }
  const ids = [...new Set(urls)].map((u) => u.split("/").pop()!);
  const { data: seen, error } = ids.length ? await priv().from("feed_seen").select("source_id").eq("source", "jma").in("source_id", ids) : { data: [], error: null };
  if (error) throw error;
  const known = new Set((seen ?? []).map((s) => s.source_id));
  const unread = ids.filter((id) => !known.has(id)).sort().reverse();
  // Newest first; with more than a poll's worth, keep no cursor so the next poll reads the feed again for the rest.
  const fresh = unread.slice(0, BULLETINS_PER_POLL);
  const more = unread.length > fresh.length;
  const alerts: HazardAlert[] = [];
  for (const id of fresh) {
    const got = await get(`https://www.data.jma.go.jp/developer/xml/data/${id}`, MAX_BULLETIN_BYTES);
    if (got.status !== 200) { log("feed_status", { source: "jma", status: got.status }); continue; }
    // Read once: a bulletin never changes, a correction is a new one.
    const { error: e } = await priv().from("feed_seen").upsert({ source: "jma", source_id: id });
    if (e) throw e;
    const a = fromJma(id, got.text!);
    if (a) alerts.push(a);
  }
  if (states.length) await priv().from("feed_state").upsert(states.map((s) => (more ? { ...s, last_modified: null } : s)));
  return alerts;
}

async function p2pAlerts(log: (event: string, f: Fields) => void): Promise<HazardAlert[]> {
  const got = await get(P2P, MAX_FEED_BYTES);
  if (got.status !== 200) { log("feed_status", { source: "p2pquake", status: got.status }); return []; }
  return fromP2P(JSON.parse(got.text!));
}

export async function pollFeeds(log: (event: string, f: Fields) => void) {
  const expired = await rpc<number>("expire_disaster_proposals", {});
  if (expired) log("disaster_proposal_expired", { count: expired });
  let alerts = 0, proposals = 0, failed = 0;
  // One source failing (timeout, outage, bad body) never stops the other.
  for (const [source, read] of [["jma", jmaAlerts], ["p2pquake", p2pAlerts]] as const) {
    try {
      for (const a of await read(log)) {
        const r = await ingest(a, log);
        if (r.alert) alerts++;
        if (r.proposal && r.stations?.length) proposals++;
      }
    } catch (e) {
      failed++;
      log("feed_failed", { source, ...errorFields(e) });
    }
  }
  const { count } = await admin.from("disaster_proposal").select("id", { count: "exact", head: true }).eq("status", "pending");
  return { alerts, proposals, pending: count ?? 0, failed };
}
