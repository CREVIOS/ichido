import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actorFrom, reply } from "@/lib/server";
import { can } from "@/lib/rbac";
import { eligibleReplies } from "@/lib/case-tools";
import { CALLER_FLAGS, PACK_IDS, STAFF_JA, packOfFault, situationsOf, type PackId } from "@/content/catalogue";
import { suggest } from "@/lib/decide";
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
    title: "Open cases", description: "Open cases in the monitoring queue (every pack): station, fault, status, caller language, who claimed it, minutes open.", inputSchema: none, annotations: READ,
  }, async (_args, ctx) => {
    const { data, error } = await asUser(who(ctx.http?.authInfo?.extra).token).from("desk")
      .select("id, station, fault, status, lang, operator_id, confirmed_rev, created_at").is("finished_at", null).order("created_at");
    if (error) throw new Error(error.code ?? "query_failed");
    return json((data ?? []).map((d) => ({ ...d, minutes_open: Math.round((Date.now() - Date.parse(d.created_at)) / 60000) })));
  });

  server.registerTool("get_case", {
    title: "Case detail", description: "One case: facts and taps the caller confirmed, the intake AI's labelled suggestion (codes), the timeline, approved replies sent, guard job. Never the caller's draft or words.", inputSchema: incident, annotations: READ,
  }, async ({ incident: id }, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const [d, e, r, j, c] = await Promise.all([
      db.from("desk").select("id, station, fault, status, lang, card_back, cash_received, confirmed_rev, remote_release, abandoned, created_at, finished_at, triage").eq("id", id).maybeSingle(),
      db.from("case_event").select("at, actor, actor_name, kind, data").eq("incident", id).order("id"),
      db.from("reply").select("intent, sent_at").eq("incident", id).order("sent_at"),
      db.from("field_job").select("state, eta").eq("incident", id).maybeSingle(),
      db.from("caller_card").select("flags").eq("id", id).maybeSingle(),
    ]);
    if (!d.data) throw new Error("not_found");
    const { triage, ...desk } = d.data;
    const flags: string[] = c.data?.flags ?? [];
    return json({ case: { ...desk, situation_ja: STAFF_JA.fault[desk.fault] ?? desk.fault }, caller_taps: flags.map((f) => ({ code: f, ja: CALLER_FLAGS[f]?.staff ?? f })),
      ai_triage_suggestion: triage ?? null, timeline: e.data ?? [], replies: r.data ?? [], guard_job: j.data, eligible_replies: eligibleReplies(desk, flags) });
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

  server.registerTool("insights", {
    title: "Insights", description: "Counts only: case funnel, per-day and per-hour volume, languages, median time to first reply, wait/leave choices, ratings.",
    inputSchema: z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14) }), annotations: READ,
  }, async ({ days }, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const [main, ratings] = await Promise.all([db.rpc("insights", { p_days: days }), db.rpc("insights_ratings", { p_days: days })]);
    if (main.error) throw new Error(main.error.code ?? "query_failed");
    return json({ ...main.data, ratings: ratings.data ?? {} });
  });

  server.registerTool("search_cases", {
    title: "Search cases", description: "Cases by station, pack, situation (fault code), status and date range (Asia/Tokyo dates), newest first, with who claimed each and counts per station and situation. Codes and staff wording only; never the caller's words.",
    inputSchema: z.object({
      station: z.string().max(40).optional(), pack: z.enum(PACK_IDS as [PackId, ...PackId[]]).optional(), fault: z.string().max(40).optional(),
      status: z.enum(["open", "closed", "received", "review", "field", "guided"]).optional(),
      from: z.string().date().optional().describe("First day, YYYY-MM-DD"), to: z.string().date().optional().describe("Last day, YYYY-MM-DD"),
      limit: z.number().int().min(1).max(200).default(50),
    }), annotations: READ,
  }, async (f, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    let q = db.from("desk").select("id, station, fault, status, lang, operator_id, abandoned, created_at, finished_at").order("created_at", { ascending: false }).limit(f.limit);
    if (f.station) q = q.eq("station", f.station);
    if (f.pack) q = q.in("fault", situationsOf(f.pack));
    if (f.fault) q = q.eq("fault", f.fault);
    if (f.status === "open") q = q.is("finished_at", null);
    else if (f.status === "closed") q = q.not("finished_at", "is", null);
    else if (f.status) q = q.eq("status", f.status);
    if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+09:00`);
    if (f.to) q = q.lt("created_at", new Date(Date.parse(`${f.to}T00:00:00+09:00`) + 86_400_000).toISOString());
    const { data, error } = await q;
    if (error) throw new Error(error.code ?? "query_failed");
    const rows = data ?? [];
    const { data: claims } = rows.length ? await db.from("case_event").select("incident, actor_name, kind").in("incident", rows.map((d) => d.id)).in("kind", ["claimed", "takeover"]).order("id") : { data: [] };
    const holder = new Map((claims ?? []).map((c) => [c.incident, c.actor_name]));
    const count = (k: (d: (typeof rows)[number]) => string) => rows.reduce<Record<string, number>>((m, d) => ({ ...m, [k(d)]: (m[k(d)] ?? 0) + 1 }), {});
    return json({
      cases: rows.map((d) => ({ ...d, pack: packOfFault(d.fault), situation_ja: STAFF_JA.fault[d.fault] ?? d.fault, claimed_by: holder.get(d.id) ?? null })),
      by_station: count((d) => d.station), by_situation: count((d) => d.fault), truncated: rows.length === f.limit,
    });
  });

  server.registerTool("station_detail", {
    title: "Station detail", description: "One station: label, branch, its Help Point device health, open cases, and case counts per situation over the last 7 and 30 days.",
    inputSchema: z.object({ station: z.string().max(40).describe("Station id, e.g. TABLE-A") }), annotations: READ,
  }, async ({ station }, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [s, h, d] = await Promise.all([
      db.from("station").select("id, label, branch, security_company").eq("id", station).maybeSingle(),
      db.from("device_health").select("last_seen, rssi, firmware, uptime_s").eq("station", station).maybeSingle(),
      db.from("desk").select("id, fault, status, created_at, finished_at").eq("station", station).gte("created_at", since),
    ]);
    if (!s.data) throw new Error("not_found");
    const week = Date.now() - 7 * 86_400_000;
    const tally = (xs: { fault: string }[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x.fault]: (m[x.fault] ?? 0) + 1 }), {});
    const cases = d.data ?? [];
    return json({
      station: s.data, device: h.data ? { ...h.data, seconds_since_heartbeat: Math.round((Date.now() - Date.parse(h.data.last_seen)) / 1000) } : null,
      open_cases: cases.filter((x) => !x.finished_at).map((x) => ({ id: x.id, fault: x.fault, status: x.status })),
      last_7_days: tally(cases.filter((x) => Date.parse(x.created_at) >= week)), last_30_days: tally(cases),
    });
  });

  server.registerTool("field_jobs_open", {
    title: "Open field jobs", description: "Responder jobs not yet done: case, station, who is assigned, state, their own arrival estimate, minutes since the last update.",
    inputSchema: none, annotations: READ,
  }, async (_args, ctx) => {
    const db = asUser(who(ctx.http?.authInfo?.extra).token);
    const [j, g] = await Promise.all([
      db.from("field_job").select("incident, station, fault, assignee, state, eta, updated_at").neq("state", "done").eq("case_closed", false),
      db.rpc("mcp_field_staff"),
    ]);
    if (j.error) throw new Error(j.error.code ?? "query_failed");
    const names = new Map(((g.data ?? []) as { uid: string; display_name: string }[]).map((x) => [x.uid, x.display_name]));
    return json((j.data ?? []).map(({ assignee, updated_at, ...x }) => ({ ...x, assignee: names.get(assignee) ?? null, minutes_since_update: Math.round((Date.now() - Date.parse(updated_at)) / 60000) })));
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
