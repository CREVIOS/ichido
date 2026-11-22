import { createHash, randomBytes, randomInt } from "node:crypto";
import { MANUAL_VERSION, REPLIES, FACT_KEYS, LANGS, ETA_OPTIONS, looksLikeNumber, type Fact } from "@/content/catalogue";
import { extract } from "@/lib/extract";
import { actorFrom, admin, priv, event, setLight, fail, reply, HttpError, type Actor } from "@/lib/server";

type Body = Record<string, unknown>;
type Staff = Extract<Actor, { kind: "staff" }>;
type Caller = Extract<Actor, { kind: "caller" }>;

const str = (b: Body, k: string) => (typeof b[k] === "string" ? (b[k] as string) : fail(400, `missing ${k}`));
const FACT_VALUES: Fact[] = ["unknown", "yes", "no"];
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 5 * 60_000;
const MAX_TEXT = 500;
const digest = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
const now = () => new Date().toISOString();

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// A row that must exist; a missing one becomes a 404 rather than a null dereference.
async function one<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  return (await must(p)) ?? fail(404, "not found");
}

async function openCase(id: string) {
  return (await must(admin.from("desk").select("*").eq("id", id).is("finished_at", null).maybeSingle())) ?? fail(404, "no open case");
}

function staff(a: Actor, role: Staff["role"]): Staff {
  if (a.kind !== "staff" || a.role !== role) fail(403, "forbidden");
  return a as Staff;
}

function owner(a: Actor, d: { operator_id: string | null }): Staff {
  const s = staff(a, "operator");
  if (d.operator_id !== s.uid) fail(409, "claim the case first");
  return s;
}

function caller(a: Actor): Caller & { incident: string } {
  if (a.kind !== "caller" || !a.incident) fail(403, "forbidden");
  return a as Caller & { incident: string };
}

const commands: Record<string, (a: Actor, b: Body) => Promise<object>> = {
  async me(a) {
    return a.kind === "staff" ? { role: a.role, name: a.name } : { role: a.kind };
  },

  // Operator: open a case from the on-screen simulator (the ESP32 uses /api/device).
  async simulate(a, b) {
    staff(a, "operator");
    const incident = await must(admin.rpc("record_fault", {
      p_station: str(b, "station"), p_key: randomBytes(16).toString("hex"), p_source: "simulator", p_fault: str(b, "fault"),
    }));
    return { incident };
  },

  async staff_list(a) {
    staff(a, "operator");
    return { field: await must(priv().from("staff").select("uid, display_name").eq("role", "field").order("display_name")) };
  },

  async issue_code(a, b) {
    const d = await openCase(str(b, "incident"));
    owner(a, d);
    if (await must(priv().from("binding").select("incident").eq("incident", d.id).maybeSingle())) fail(409, "a caller is already connected");
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    await must(priv().from("pair_code").upsert({ incident: d.id, digest: digest(code), expires: new Date(Date.now() + CODE_TTL_MS).toISOString() }));
    return { code, expires_in: CODE_TTL_MS / 1000 };
  },

  async claim(a, b) {
    const op = staff(a, "operator");
    const d = await openCase(str(b, "incident"));
    if (d.operator_id && d.operator_id !== op.uid) fail(409, "claimed by another operator");
    if (d.operator_id === op.uid) return {};
    await must(admin.from("desk").update({ operator_id: op.uid, status: "review" }).eq("id", d.id));
    await must(admin.from("caller_card").update({ status: "review" }).eq("id", d.id));
    await setLight(d.station, "review");
    await event(d.id, "operator", "claimed", {}, op.name);
    return {};
  },

  async remote_release(a, b) {
    const d = await openCase(str(b, "incident"));
    const op = owner(a, d);
    const result = str(b, "result");
    if (result !== "failed" && result !== "released") fail(400, "bad result");
    await must(admin.from("desk").update({ remote_release: result }).eq("id", d.id));
    await event(d.id, "operator", "remote_release", { result }, op.name);
    return {};
  },

  async send(a, b) {
    const d = await openCase(str(b, "incident"));
    const op = owner(a, d);
    if (d.confirmed_rev == null) fail(409, "the caller has not confirmed a report yet");
    const intent = str(b, "intent");
    if (!REPLIES[intent]) fail(400, "unknown reply");
    const st = await one(admin.from("station").select("branch, counter_hours").eq("id", d.station).single());
    const row = await one(admin.from("reply").insert({
      incident: d.id, intent, slots: { branch: st.branch, hours: st.counter_hours }, manual_version: MANUAL_VERSION, operator_id: op.uid,
    }).select("id").single());
    await event(d.id, "operator", "reply", { intent }, op.name);
    return { id: row.id };
  },

  async assign(a, b) {
    const d = await openCase(str(b, "incident"));
    const op = owner(a, d);
    const assignee = str(b, "assignee");
    const f = (await must(priv().from("staff").select("display_name").eq("uid", assignee).eq("role", "field").maybeSingle())) ?? fail(400, "not a field account");
    await must(admin.from("field_job").upsert({ incident: d.id, station: d.station, fault: d.fault, assignee, state: "requested", eta: null, case_closed: false, updated_at: now() }));
    await must(admin.from("desk").update({ status: "field" }).eq("id", d.id));
    await must(admin.from("caller_card").update({ status: "field", field_state: "requested", eta: null }).eq("id", d.id));
    await setLight(d.station, "field");
    await event(d.id, "operator", "dispatch", { assignee: f.display_name }, op.name);
    return {};
  },

  async outcome(a, b) {
    const d = await openCase(str(b, "incident"));
    const op = owner(a, d);
    const c = await one(admin.from("caller_card").select("teachback").eq("id", d.id).single());
    if (!c.teachback) fail(409, "no teach-back yet");
    if (str(b, "result") !== "understood") {
      await must(admin.from("caller_card").update({ teachback_result: "clarify", teachback: null }).eq("id", d.id));
      await event(d.id, "operator", "clarify", {}, op.name);
      return {};
    }
    await must(admin.from("caller_card").update({ teachback_result: "understood", status: "guided" }).eq("id", d.id));
    await must(admin.from("desk").update({ status: "guided", finished_at: now() }).eq("id", d.id));
    await must(admin.from("field_job").update({ case_closed: true }).eq("incident", d.id));
    await setLight(d.station, "guided");
    await event(d.id, "operator", "guided", {}, op.name);
    return {};
  },

  // Caller (anonymous user): pair with a case using the operator's single-use code.
  async pair(a, b) {
    if (a.kind !== "caller") fail(403, "forbidden");
    if ((a as Caller).incident) fail(409, "already connected");
    const lang = str(b, "lang");
    if (!(LANGS as readonly string[]).includes(lang)) fail(400, "bad language");
    // ponytail: no per-IP rate limit; codes are single-use, 31^6 space, 5-minute expiry. Add a counter table if abused.
    const { data, error } = await admin.rpc("redeem_pair", {
      p_uid: (a as Caller).uid, p_station: str(b, "station"), p_digest: digest(str(b, "code")), p_lang: lang,
    });
    if (error) fail(403, "unavailable"); // same answer for wrong, expired, used and wrong-station codes
    return { incident: data };
  },

  async draft(a, b) {
    const c = caller(a);
    const cur = await must(admin.from("draft").select("*").eq("incident", c.incident).single());
    if (b.base_rev !== cur.rev) fail(409, "stale");
    const next = { card_back: cur.card_back as Fact, cash_received: cur.cash_received as Fact, words: cur.words as string | null, needs_clarification: false };
    const text = typeof b.text === "string" ? b.text.trim().slice(0, MAX_TEXT) : "";
    if (text) {
      if (looksLikeNumber(text)) return { withheld: true };
      const patch = await extract(text, c.lang ?? "bn", { card_back: next.card_back, cash_received: next.cash_received });
      if (patch) {
        for (const k of FACT_KEYS) if (patch[k] !== "unchanged") next[k] = patch[k];
        next.needs_clarification = patch.clarify;
      }
      next.words = text;
    }
    for (const k of FACT_KEYS) if (FACT_VALUES.includes(b[k] as Fact)) next[k] = b[k] as Fact;
    await must(admin.from("draft").update({ ...next, rev: cur.rev + 1 }).eq("incident", c.incident).eq("rev", cur.rev));
    return { rev: cur.rev + 1 };
  },

  async confirm(a, b) {
    const c = caller(a);
    const cur = await must(admin.from("draft").select("*").eq("incident", c.incident).single());
    if (b.rev !== cur.rev) fail(409, "stale");
    if (FACT_KEYS.every((k) => cur[k] === "unknown")) fail(409, "nothing to send yet");
    await must(admin.from("desk").update({ card_back: cur.card_back, cash_received: cur.cash_received, confirmed_rev: cur.rev, caller_words: cur.words }).eq("id", c.incident));
    await must(admin.from("caller_card").update({ confirmed_rev: cur.rev }).eq("id", c.incident));
    await event(c.incident, "caller", "confirmed", { card_back: cur.card_back, cash_received: cur.cash_received });
    return {};
  },

  async choose(a, b) {
    const c = caller(a);
    const choice = str(b, "choice");
    if (choice !== "wait" && choice !== "leave") fail(400, "bad choice");
    await must(admin.from("caller_card").update({ choice }).eq("id", c.incident));
    await event(c.incident, "caller", "choice", { choice });
    return {};
  },

  async teachback(a, b) {
    const c = caller(a);
    const text = str(b, "text").trim().slice(0, MAX_TEXT);
    if (!text) fail(400, "empty");
    if (looksLikeNumber(text)) return { withheld: true };
    await must(admin.from("caller_card").update({ teachback: text, teachback_result: null }).eq("id", c.incident));
    await event(c.incident, "caller", "teachback", {});
    return {};
  },

  async human(a) {
    const c = caller(a);
    await must(admin.from("caller_card").update({ needs_human: true }).eq("id", c.incident));
    await event(c.incident, "caller", "human", {});
    return {};
  },

  // Field (security guard): only the assigned guard may update an open job.
  async field(a, b) {
    const f = staff(a, "field");
    const id = str(b, "incident");
    const job = await must(admin.from("field_job").select("assignee, case_closed").eq("incident", id).maybeSingle());
    if (!job || job.assignee !== f.uid || job.case_closed) fail(403, "not your assignment");
    const state = str(b, "state");
    if (!["on_way", "arrived", "done"].includes(state)) fail(400, "bad state");
    const eta = state === "on_way" && typeof b.eta === "string" && b.eta && ETA_OPTIONS.includes(b.eta) ? b.eta : null;
    await must(admin.from("field_job").update({ state, eta, updated_at: now() }).eq("incident", id));
    await must(admin.from("caller_card").update({ field_state: state, eta }).eq("id", id));
    await event(id, "field", "field", { state, ...(eta ? { eta } : {}) }, f.name);
    return {};
  },
};

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const name = typeof body.cmd === "string" ? body.cmd : "";
    const handler = commands[name] ?? fail(404, "unknown command");
    return reply(200, await handler(await actorFrom(req), body));
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    console.error("cmd failed", e instanceof Error ? e.message : e);
    return reply(500, { error: "server error" });
  }
}
