import "server-only";
import { generateRequestDetails } from "web-push";
import { PUSH, PUSH_UNKNOWN_PLACE } from "@/content/catalogue";
import { admin, fail, rpc, type Actor } from "@/lib/server";
import { entry, errorFields, ship } from "@/lib/log";

// Staff alerts (Web Push in the browser, Expo push in the mobile app), delivered from the outbox that database
// triggers fill (supabase/migrations/20261124030000_alerts.sql). flushAlerts() runs after commands, device calls and
// the Ichido Bot's steps; never from a browser. Every payload is a code, a station label and a link: no caller text.

type Outbox = { lease: string; generation: number | null; delivered: string[]; id: number; kind: string; incident: string | null; station: string | null; target: string | null };
type Sub = { id: string; uid: string; platform: "web" | "expo"; endpoint: string; p256dh: string | null; auth: string | null };
export type Message = { title: string; body: string; url: string; path: string; tag: string };

const EXPO_PUSH_URL = () => process.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send";
const TIMEOUT_MS = 5000;

// Push services a browser may hand us (Chrome/Edge, Firefox, Safari, Windows). Anything else is refused, so a
// subscription cannot make the server call an arbitrary host. PUSH_ENDPOINT_ORIGINS adds origins (local test stub).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];
export function allowedEndpoint(endpoint: string): boolean {
  if (!URL.canParse(endpoint) || endpoint.length > 1024) return false;
  const u = new URL(endpoint);
  if (u.username || u.password) return false;
  const extra = (process.env.PUSH_ENDPOINT_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(u.origin) || (u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname)));
}
export const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

export const vapidPublicKey = () => (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.VAPID_PUBLIC_KEY : null);

// Who gets each kind: one person (owner or assignee) or, when the case has no owner yet, everyone in the roles.
function recipients(o: Outbox): { uids: string[]; roles: string[] } {
  switch (o.kind) {
    case "new_case": return { uids: [], roles: ["operator"] };
    case "sla": return { uids: o.target ? [o.target] : [], roles: o.target ? ["manager"] : ["operator", "manager"] };
    case "remind": case "promise_due": return o.target ? { uids: [o.target], roles: [] } : { uids: [], roles: ["operator"] };
    case "field_job": return { uids: o.target ? [o.target] : [], roles: [] };
    default: return { uids: [], roles: [] };
  }
}

export function message(o: Outbox, place: string, role: string): Message | null {
  const p = PUSH[o.kind];
  if (!p || !o.incident) return null;
  const field = o.kind === "field_job";
  const url = field ? `/field?job=${o.incident}` : role === "manager" ? "/insights" : `/operator#${o.incident}`;
  const path = field ? `/field?job=${o.incident}` : role === "manager" ? "/insights" : `/operator/${o.incident}`;
  return { title: p.title, body: p.body(place), url, path, tag: `${o.kind}:${o.incident}` };
}

async function sendWeb(s: Sub, m: Message): Promise<"ok" | "gone" | "failed"> {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject || !allowedEndpoint(s.endpoint)) return "failed";
  const d = generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh!, auth: s.auth! } }, JSON.stringify(m), {
    TTL: 600, urgency: "high", topic: m.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32), vapidDetails: { subject, publicKey, privateKey },
  });
  const res = await fetch(d.endpoint, { method: d.method, headers: d.headers as Record<string, string>, body: d.body as BodyInit, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return res.ok ? "ok" : res.status === 404 || res.status === 410 ? "gone" : "failed";
}

async function sendExpo(s: Sub, m: Message): Promise<"ok" | "gone" | "failed"> {
  const token = process.env.EXPO_ACCESS_TOKEN;
  const res = await fetch(EXPO_PUSH_URL(), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify([{ to: s.endpoint, title: m.title, body: m.body, data: { path: m.path }, sound: "default", priority: "high", ttl: 600 }]),
  });
  if (!res.ok) return "failed";
  const ticket = (await res.json()).data?.[0];
  if (ticket?.status === "ok") return "ok";
  return ticket?.details?.error === "DeviceNotRegistered" ? "gone" : "failed";
}

async function deliver(o: Outbox) {
  const accepted: string[] = [];
  const settle = (retry: boolean) => rpc("alert_settle", { p_id: o.id, p_lease: o.lease, p_accepted: accepted, p_retry: retry });
  if (o.kind === "field_job") {
    const { data } = await admin.from("field_job").select("generation").eq("incident", o.incident)
      .eq("assignee", o.target).eq("case_closed", false).is("acknowledged_at", null).maybeSingle().throwOnError();
    if (!data || (o.generation != null && o.generation !== data.generation)) return settle(false);
  }
  const { uids, roles } = recipients(o);
  const subs = await rpc<Sub[]>("alert_subscriptions", { p_uids: uids, p_roles: roles });
  const pending = subs.filter((s) => !o.delivered.includes(s.id));
  if (!pending.length) return settle(o.kind === "field_job" && !o.delivered.length);
  const [{ data: station }, { data: staff }] = await Promise.all([
    admin.from("station").select("label").eq("id", o.station).maybeSingle().throwOnError(),
    admin.schema("ichido").from("staff").select("uid,role").in("uid", pending.map((s) => s.uid)).throwOnError(),
  ]);
  const results = await Promise.allSettled(pending.map(async (s) => {
    const m = message(o, station?.label?.ja ?? PUSH_UNKNOWN_PLACE, staff?.find((u) => u.uid === s.uid)?.role ?? "");
    if (!m) return;
    const result = await (s.platform === "web" ? sendWeb(s, m) : sendExpo(s, m));
    if (result === "gone") await admin.from("push_subscription").delete().eq("id", s.id).eq("endpoint", s.endpoint).throwOnError();
    if (result === "ok") accepted.push(s.id);
    if (result === "failed") throw new Error("provider_refused");
  }));
  await settle(results.some((r) => r.status === "rejected") || (o.kind === "field_job" && !o.delivered.length && !accepted.length));
}

// Drain the outbox. Never throws: an alert is a convenience on top of the console, which is the source of truth.
export async function flushAlerts(): Promise<void> {
  try {
    for (let round = 0; round < 5; round++) {
      const rows = await rpc<Outbox[]>("alert_take", { p_limit: 10 });
      if (!rows.length) return;
      await Promise.all(rows.map(deliver));
      if (rows.length < 10) return;
    }
  } catch (e) {
    await ship([entry("warn", "alert_failed", { code: "flush", ...errorFields(e) })]);
  }
}

// /api/cmd: a signed-in staff member (aal2) who can receive alerts turns them on or off for this session and platform.
type Body = Record<string, unknown>;
const RECEIVES = new Set(["operator", "field", "manager"]);
function receiver(a: Actor) {
  if (a.kind !== "staff") return fail(403, "forbidden");
  if (a.aal !== "aal2") return fail(403, "mfa_required");
  if (!RECEIVES.has(a.role)) return fail(403, "forbidden");
  return a;
}
const short = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : fail(400, "bad_request"));

export const ALERT_COMMANDS: Record<string, (a: Actor, b: Body) => Promise<object>> = {
  async push_key(a) {
    const s = receiver(a);
    const { data } = await admin.from("push_subscription").select("endpoint").eq("uid",s.uid)
      .eq("session_id",s.session).eq("platform","web").maybeSingle().throwOnError();
    return { key: vapidPublicKey(), endpoint: data?.endpoint ?? null };
  },
  async push_subscribe(a, b) {
    const s = receiver(a);
    const platform = b.platform === "expo" ? "expo" : b.platform === "web" ? "web" : fail(400, "bad_request");
    const endpoint = short(b.endpoint, 1024);
    if (platform === "web") {
      if (!vapidPublicKey()) fail(409, "conflict");
      if (!allowedEndpoint(endpoint)) fail(400, "bad_request");
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(short(b.p256dh, 256)) || !/^[A-Za-z0-9_-]{16,32}$/.test(short(b.auth, 64))) fail(400, "bad_request");
    } else if (!EXPO_TOKEN.test(endpoint)) fail(400, "bad_request");
    await rpc("push_subscribe", {
      p_uid: s.uid, p_session: s.session, p_platform: platform, p_endpoint: endpoint,
      p_p256dh: platform === "web" ? b.p256dh : null, p_auth: platform === "web" ? b.auth : null,
    });
    return {};
  },
  async push_unsubscribe(a, b) {
    const s = receiver(a);
    const q = admin.from("push_subscription").delete().eq("session_id", s.session).eq("uid", s.uid);
    const { error } = typeof b.platform === "string" ? await q.eq("platform", b.platform) : await q;
    if (error) throw error;
    return {};
  },
};
