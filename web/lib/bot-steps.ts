import type { Fact } from "@/content/catalogue";
import type { Suggestion } from "@/lib/decide";
import type { Fields } from "@/lib/log";

// The Ichido Bot's steps (web/workflows/case-bot.ts). Each is a durable, retried unit with full Node access.
// The bot routes, prepares, reminds and records. It never claims, replies, dispatches or closes, and never writes
// free text: its only writes are bot_step, bot_suggestion, case_record, field_job.reminded_gen and 'bot' events.
//
// The workflow imports this module into its sandbox (no network, no WebSocket), where step bodies are stripped.
// So server modules are loaded inside the steps: a static import would create the Supabase client in the sandbox.
const lib = async () => {
  const [server, log, decide, catalogue] = await Promise.all([import("@/lib/server"), import("@/lib/log"), import("@/lib/decide"), import("@/content/catalogue")]);
  return { ...server, ...log, suggest: decide.suggest, summaryDraft: catalogue.summaryDraft };
};

export type Signal = { cmd: string };
export type Job = { generation: number; state: string; due: number | null };
export type Snapshot = {
  now: number; gone: boolean; closed: boolean; claimed: boolean; confirmedRev: number | null;
  replied: boolean; replyDue: number | null; job: Job | null;
};

export const botToken = (incident: string) => `ichido-bot:${incident}`;

// Reminders fire once this share of each target in ichido.sla_target has passed: 0.75 by default, when the
// console's countdown turns amber (SLA.warn). Tests run the server with a small share.
const share = () => {
  const x = Number(process.env.BOT_REMIND_AT ?? 0.75);
  return x > 0 && x < 1 ? x : 0.75;
};
const dueAfter = (start: string, targetS: number) => Date.parse(start) + Math.round(targetS * share() * 1000);
const PRESENCE_WAIT_MS = 2000;

async function log(step: string, incident: string, started: number, code: string, extra: Fields = {}, level: "info" | "warn" = "info") {
  const { ship, entry } = await lib();
  await ship([entry(level, "bot_step", { route: "workflow", step, incident, code, duration_ms: Math.round(performance.now() - started), ...extra })]);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { admin } = await lib();
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

const setStep = (incident: string, step: string, status: string, code: string | null = null, data: object = {}, due: number | null = null) =>
  rpc("bot_mark", { p_incident: incident, p_step: step, p_status: status, p_code: code, p_data: data, p_due: due == null ? null : new Date(due).toISOString() });

export async function mark(incident: string, step: string, status: "waiting" | "done" | "skipped", code: string | null, due: number | null = null) {
  "use step";
  const t0 = performance.now();
  await setStep(incident, step, status, code, {}, due);
  await log(step, incident, t0, `${status}${code ? `_${code}` : ""}`.slice(0, 32));
}

export async function begin(incident: string) {
  "use step";
  const { admin } = await lib();
  const rows = ["route", "claim", "prepare", "remind_reply", "remind_guard", "record"].map((step) => ({ incident, step }));
  const { error } = await admin.from("bot_step").upsert(rows, { onConflict: "incident,step", ignoreDuplicates: true });
  if (error) throw error;
}

// Operators shown online in the console (Supabase Realtime presence, keyed by uid); null when presence is unavailable.
async function onlineOperators(): Promise<Set<string> | null> {
  const { admin } = await lib();
  const ch = admin.channel("ichido:operator-presence", { config: { private: true } });
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), PRESENCE_WAIT_MS);
      ch.on("presence", { event: "sync" }, () => { clearTimeout(timer); resolve(new Set(Object.keys(ch.presenceState()))); });
      ch.subscribe((status) => { if (status !== "SUBSCRIBED") { clearTimeout(timer); resolve(null); } });
    });
  } finally {
    await admin.removeChannel(ch);
  }
}

// Suggest the operator with the fewest open claimed cases, preferring those online. Never claims on their behalf.
export async function route(incident: string) {
  "use step";
  const t0 = performance.now();
  const { admin, priv, event } = await lib();
  const { data: d, error } = await admin.from("desk").select("operator_id, finished_at").eq("id", incident).maybeSingle();
  if (error) throw error;
  if (!d || d.operator_id || d.finished_at) {
    await setStep(incident, "route", "skipped", d?.operator_id ? "claimed" : "closed");
    return log("route", incident, t0, "skipped");
  }
  const [ops, open, online] = await Promise.all([
    priv().from("staff").select("uid, display_name").eq("role", "operator").order("display_name"),
    admin.from("desk").select("operator_id").is("finished_at", null).not("operator_id", "is", null),
    onlineOperators(),
  ]);
  if (ops.error) throw ops.error;
  if (open.error) throw open.error;
  const load = (uid: string) => (open.data ?? []).filter((x) => x.operator_id === uid).length;
  const here = (ops.data ?? []).filter((o) => online?.has(o.uid));
  const pool = here.length ? here : ops.data ?? [];
  const pick = pool.map((o) => ({ ...o, open: load(o.uid) })).sort((a, b) => a.open - b.open)[0];
  if (!pick) {
    await setStep(incident, "route", "skipped", "no_operator");
    return log("route", incident, t0, "no_operator");
  }
  const data = { operator: pick.display_name, open: pick.open, online: here.length > 0 };
  await event(incident, "bot", "bot_routed", data);
  await setStep(incident, "route", "done", null, { ...data, uid: pick.uid });
  await log("route", incident, t0, here.length ? "routed_online" : "routed", { presence: online == null ? "unavailable" : String(here.length) });
}

// The case as the bot needs it, read fresh each time: signals only wake the workflow; the database is the truth.
export async function observe(incident: string): Promise<Snapshot> {
  "use step";
  const { admin, priv } = await lib();
  const [d, claim, replies, job, targets] = await Promise.all([
    admin.from("desk").select("finished_at, confirmed_rev").eq("id", incident).maybeSingle(),
    admin.from("case_event").select("at").eq("incident", incident).eq("kind", "claimed").order("id").limit(1).maybeSingle(),
    admin.from("reply").select("id", { count: "exact", head: true }).eq("incident", incident),
    admin.from("field_job").select("generation, state, updated_at, case_closed").eq("incident", incident).maybeSingle(),
    priv().from("sla_target").select("reason, seconds"),
  ]);
  for (const r of [d, claim, replies, job, targets]) if (r.error) throw r.error;
  const target = Object.fromEntries((targets.data ?? []).map((t) => [t.reason, t.seconds as number]));
  const j = job.data;
  return {
    now: Date.now(),
    gone: !d.data,
    closed: Boolean(d.data?.finished_at),
    claimed: Boolean(claim.data),
    confirmedRev: d.data?.confirmed_rev ?? null,
    replied: (replies.count ?? 0) > 0,
    replyDue: claim.data && target.no_reply ? dueAfter(claim.data.at, target.no_reply) : null,
    job: j && !j.case_closed ? { generation: j.generation, state: j.state, due: target.guard_late ? dueAfter(j.updated_at, target.guard_late) : null } : null,
  };
}

// Store a suggestion for the console's AI card (the bot's precomputed one, or the operator's refresh).
export async function saveSuggestion(incident: string, rev: number, s: Suggestion) {
  const { admin } = await lib();
  const { error } = await admin.from("bot_suggestion").upsert({ incident, rev, suggestion: s, at: new Date().toISOString() });
  if (error) throw error;
}

// Precompute Gemini's suggestion once the caller has confirmed revision `rev`. A model failure is recorded, not retried.
export async function prepare(incident: string, rev: number) {
  "use step";
  const t0 = performance.now();
  const { suggest, event, errorFields } = await lib();
  let s: Suggestion | null;
  try {
    s = await suggest(incident);   // null when GEMINI_API_KEY is not set
  } catch (e) {
    await setStep(incident, "prepare", "skipped", "failed", { rev });
    return log("prepare", incident, t0, "failed", errorFields(e), "warn");
  }
  if (!s) {
    await setStep(incident, "prepare", "skipped", "no_key", { rev });
    return log("prepare", incident, t0, "no_key");
  }
  await saveSuggestion(incident, rev, s);
  await event(incident, "bot", "bot_prepared", { intent: s.intent ?? "", model: s.model });
  await setStep(incident, "prepare", "done", null, { rev, intent: s.intent, ms: s.ms });
  await log("prepare", incident, t0, "prepared", { model_ms: s.ms });
}

export async function remind(incident: string, reason: "no_reply" | "guard_late", generation: number | null) {
  "use step";
  const t0 = performance.now();
  const code = await rpc<string>("bot_remind", { p_incident: incident, p_reason: reason, p_gen: generation });
  await log(reason === "no_reply" ? "remind_reply" : "remind_guard", incident, t0, code);
}

// The after-call record (the catalogue's summary sentence for guided cases) and durations from the audit trail.
export async function record(incident: string) {
  "use step";
  const t0 = performance.now();
  const { admin, summaryDraft } = await lib();
  const [d, job, card] = await Promise.all([
    admin.from("desk").select("fault, card_back, cash_received, remote_release").eq("id", incident).single(),
    admin.from("field_job").select("incident").eq("incident", incident).maybeSingle(),
    admin.from("caller_card").select("choice, flags").eq("id", incident).maybeSingle(),
  ]);
  if (d.error) throw d.error;
  const summary = summaryDraft({
    card_back: d.data.card_back as Fact, cash_received: d.data.cash_received as Fact, remote_release: d.data.remote_release,
    dispatched: Boolean(job.data), choice: card.data?.choice ?? null, fault: d.data.fault, flags: card.data?.flags ?? [],
  });
  const r = await rpc<{ total_s: number }>("bot_close", { p_incident: incident, p_summary: summary });
  await log("record", incident, t0, "recorded", { total_s: r.total_s });
}
