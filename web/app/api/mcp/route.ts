import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actorFrom, reply } from "@/lib/server";
import { can } from "@/lib/rbac";
import { eligibleReplies } from "@/lib/case-tools";
import { suggest } from "@/lib/decide";
import { nearestShelters } from "@/lib/nearest";
import { boundedText, limitSource } from "@/lib/request-security";
import { requestLog } from "@/lib/log";

// Ichido as an MCP server (Streamable HTTP) for operators' and managers' own AI clients.
// Sign in as staff and pass a token from /api/auth/supabase-token (scripts/mcp-token.mjs) as the bearer token. Every query runs as that person,
// so row-level security decides what each tool can see. Read-only by design: no tool sends a reply or dispatches a guard —
// a person does that in the console. Callers' drafts are never reachable.

type Who = { uid: string; role: string; name: string; token: string };
const who = (extra: unknown) => extra as Who;
const asUser = (token: string) => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
});
const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const READ = { readOnlyHint: true, openWorldHint: false } as const;
const none = z.object({});
const incident = z.object({ incident: z.string().uuid().describe("Case id (uuid)") });

const handler = createMcpHandler((server) => {
  server.registerTool("list_open_cases", {
    title: "Open cases", description: "Open ATM cases in the monitoring queue: station, fault, status, caller language, who claimed it, minutes open.", inputSchema: none, annotations: READ,
  }, async (_args, ctx) => {
    const { data, error } = await asUser(who(ctx.http?.authInfo?.extra).token).from("desk")
      .select("id, station, fault, status, lang, operator_id, confirmed_rev, created_at").is("finished_at", null).order("created_at");
    if (error) throw new Error(error.code ?? "query_failed");
    return json((data ?? []).map((d) => ({ ...d, minutes_open: Math.round((Date.now() - Date.parse(d.created_at)) / 60000) })));
  });

  server.registerTool("get_case", {
    title: "Case detail", description: "One case: facts the caller confirmed, the timeline, approved replies sent, guard job. Never the caller's draft.", inputSchema: incident, annotations: READ,
  }, async ({ incident: id }, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const [d, e, r, j, c] = await Promise.all([
      db.from("desk").select("id, station, fault, status, lang, card_back, cash_received, confirmed_rev, remote_release, abandoned, created_at, finished_at").eq("id", id).maybeSingle(),
      db.from("case_event").select("at, actor, actor_name, kind, data").eq("incident", id).order("id"),
      db.from("reply").select("intent, sent_at").eq("incident", id).order("sent_at"),
      db.from("field_job").select("state, eta").eq("incident", id).maybeSingle(),
      db.from("caller_card").select("flags").eq("id", id).maybeSingle(),
    ]);
    if (!d.data) throw new Error("not_found");
    return json({ case: d.data, timeline: e.data ?? [], replies: r.data ?? [], guard_job: j.data, eligible_replies: eligibleReplies(d.data, c.data?.flags ?? []) });
  });

  server.registerTool("station_health", {
    title: "Station health", description: "Each ATM station and its Help Point device: last heartbeat, Wi-Fi signal, firmware, open cases.", inputSchema: none, annotations: READ,
  }, async (_args, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const [s, h, d] = await Promise.all([
      db.from("station").select("id, label"), db.from("device_health").select("station, last_seen, rssi, firmware, uptime_s"), db.from("desk").select("station").is("finished_at", null),
    ]);
    return json((s.data ?? []).map((x) => {
      const dev = (h.data ?? []).find((y) => y.station === x.id);
      return { station: x.id, label: x.label, device: dev ? { ...dev, seconds_since_heartbeat: Math.round((Date.now() - Date.parse(dev.last_seen)) / 1000) } : null, open_cases: (d.data ?? []).filter((y) => y.station === x.id).length };
    }));
  });

  server.registerTool("nearest_shelters", {
    title: "Nearest designated evacuation sites",
    description: "GSI designated evacuation sites (指定緊急避難場所) supporting a hazard, nearest a point or a station first. Designated, not necessarily open: opening is announced by the city and shelter staff.",
    inputSchema: z.object({
      hazard: z.enum(["flood", "landslide", "storm_surge", "earthquake", "tsunami", "fire", "inland_flood", "volcano"]),
      station: z.string().max(64).optional().describe("Station id; its location is used"),
      lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }), annotations: READ,
  }, async ({ hazard, station, lat, lng, limit }, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const here = station ? (await db.from("station").select("lat, lng").eq("id", station).maybeSingle()).data : lat != null && lng != null ? { lat, lng } : null;
    if (here?.lat == null || here.lng == null) throw new Error("bad_request: give a located station or lat and lng");
    const { data, error } = await db.from("shelter_site").select("id, name, address, municipality, lat, lng, hazards, designated_shelter, source, source_date")
      .contains("hazards", [hazard]).gte("lat", here.lat - 0.1).lte("lat", here.lat + 0.1).gte("lng", here.lng - 0.12).lte("lng", here.lng + 0.12).limit(1000);
    if (error) throw new Error(error.code ?? "query_failed");
    return json(nearestShelters(here.lat, here.lng, hazard, data ?? [], limit));
  });

  server.registerTool("insights", {
    title: "Insights", description: "Counts only: case funnel, per-day and per-hour volume, languages, median time to first reply, wait/leave choices, ratings.",
    inputSchema: z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14) }), annotations: READ,
  }, async ({ days }, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const [main, ratings] = await Promise.all([db.rpc("insights", { p_days: days }), db.rpc("insights_ratings", { p_days: days })]);
    if (main.error) throw new Error(main.error.code ?? "query_failed");
    return json({ ...main.data, ratings: ratings.data ?? {} });
  });

  server.registerTool("suggest_next_step", {
    title: "Suggest next step", description: "Gemini decision support for a case you have claimed: one approved reply, whether to send a guard, reasons and risks. A suggestion only; nothing is sent.",
    inputSchema: incident, annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ incident: id }, ctx) => {
    const me = who(ctx.http?.authInfo?.extra);
    const db = asUser(me.token);
    const { data } = await db.from("desk").select("id").eq("id", id).eq("operator_id", me.uid).is("finished_at", null).maybeSingle();
    if (!data) throw new Error("conflict: claim this open case in the console first");
    return json((await suggest(id, db)) ?? { suggestion: null, reason: "GEMINI_API_KEY is not set" });
  });
}, { serverInfo: { name: "ichido", version: "1.0.0" } });

// Staff with mcp:use (lib/rbac.ts) and a second factor in the session. Guards and callers get 403.
async function verify(req: Request, token?: string) {
  if (!token) return undefined;
  const a = await actorFrom(req);
  if (a.kind !== "staff" || a.aal !== "aal2" || !can(a.role, "mcp:use")) return undefined;
  return { token, clientId: a.uid, scopes: [a.role], extra: { uid: a.uid, role: a.role, name: a.name, token } satisfies Who };
}

const authed = withMcpAuth(handler, verify, { required: true });
async function route(req: Request) {
  const log = requestLog("/api/mcp");
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return reply(403, { error: "forbidden" });
  const body = req.method === "POST" ? await boundedText(req, 16384) : undefined;
  if (body instanceof Response) return body;
  const blocked = await limitSource(req.headers, "mcp_auth_failure", 12, 60, true);
  if (blocked) return blocked;
  const limited = await limitSource(req.headers, "mcp_requests", 180, 60);
  if (limited) return limited;
  const headers = new Headers(req.headers);
  for (const h of ["forwarded", "x-forwarded-host", "x-forwarded-proto"]) headers.delete(h);
  const res = await authed(new Request(req.url, { method: req.method, headers, body, signal: req.signal }));
  if (res.status === 401 || res.status === 403) {
    const denied = await limitSource(req.headers, "mcp_auth_failure", 12, 60);
    if (denied) return denied;
  }
  log.info("mcp", { status: res.status, duration_ms: log.ms() });
  return res;
}
export { route as GET, route as POST, route as DELETE };
