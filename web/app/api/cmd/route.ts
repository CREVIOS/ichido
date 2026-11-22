import { createHash, randomBytes, randomInt } from "node:crypto";
import { MANUAL_VERSION, LANGS, ETA_OPTIONS, CHOICE_INTENTS, FACT_KEYS, isFault, replyOf, looksLikeNumber, readBackText, type Fact, type Lang } from "@/content/catalogue";
import { extract, toJapanese } from "@/lib/extract";
import { suggest } from "@/lib/decide";
import { createHandoff, listHandoffs, revokeHandoff } from "@/lib/handoff";
import * as training from "@/lib/training";
import * as faults from "@/lib/faults";
import { signSpeech } from "@/lib/speech";
import { closeVoice } from "@/lib/livekit";
import { actorFrom, admin, priv, fail, reply, event, HttpError, type Actor } from "@/lib/server";
import { requestLog, errorFields } from "@/lib/log";
import { BOT_SIGNALS, signalBot, startBot } from "@/lib/bot";
import { saveSuggestion } from "@/lib/bot-steps";
import { accessCommands } from "@/lib/access";
import { disasterCommands } from "@/lib/disaster";

// Every state change is one SQL function (supabase/migrations/*_commands.sql) that checks its own
// preconditions in the same transaction. This route checks the role first, validates input against the
// catalogue, and maps the function's error code to HTTP.

type Body = Record<string, unknown>;
type Staff = Extract<Actor, { kind: "staff" }>;
type Caller = Extract<Actor, { kind: "caller" }>;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60_000;
const MAX_TEXT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;   // only well-formed ids reach the logs
const STATUS: Record<string, number> = { forbidden: 403, not_found: 404, conflict: 409, bad_request: 400, rate_limited: 429 };

const str = (b: Body, k: string) => (typeof b[k] === "string" && b[k] ? (b[k] as string) : fail(400, "bad_request"));
const digest = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    if (Object.hasOwn(STATUS, error.message)) fail(STATUS[error.message], error.message);
    throw error;
  }
  return data as T;
}

function staff(a: Actor, role: Staff["role"]): Staff {
  if (a.kind !== "staff" || a.role !== role) fail(403, "forbidden");
  return a as Staff;
}

function caller(a: Actor): Caller {
  if (a.kind !== "caller") fail(403, "forbidden");
  return a as Caller;
}

const commands: Record<string, (a: Actor, b: Body) => Promise<object>> = {
  async me(a) {
    return a.kind === "staff" ? { role: a.role, name: a.name } : { role: a.kind };
  },

  // Caller: which case this phone is bound to (none for staff sessions or unpaired phones).
  async mine(a) {
    return { incident: a.kind === "caller" ? a.incident : null, staff: a.kind === "staff" };
  },

  // Operator
  async simulate(a, b) {
    staff(a, "operator");
    if (!isFault(b.fault)) fail(400, "bad_request");
    const incident = await rpc<string>("record_fault", { p_station: str(b, "station"), p_key: randomBytes(16).toString("hex"), p_source: "simulator", p_fault: b.fault });
    await startBot(incident);
    return { incident };
  },

  // Gemini decision support for the operator who owns the case. Recorded on the timeline; never sent to the caller.
  async suggest(a, b) {
    const op = staff(a, "operator");
    const incident = str(b, "incident");
    const { data: d } = await admin.from("desk").select("confirmed_rev").eq("id", incident).eq("operator_id", op.uid).is("finished_at", null).maybeSingle();
    if (!d) fail(409, "conflict");
    const s = await suggest(incident);
    if (!s) return { suggestion: null };
    if (d!.confirmed_rev != null) await saveSuggestion(incident, d!.confirmed_rev, s);   // the console's AI card shows the latest
    await event(incident, "agent", "suggested", { intent: s.intent, dispatch: s.dispatch, guard: s.guard?.name ?? null, model: s.model });
    return { suggestion: s };
  },

  // Read-only hand-off links for the bank, the police or the security company (lib/handoff.ts).
  async handoff_create(a, b) {
    const op = staff(a, "operator");
    return createHandoff(str(b, "incident"), str(b, "recipient"), op);
  },

  async handoff_list(a, b) {
    staff(a, "operator");
    return { links: await listHandoffs(str(b, "incident")) };
  },

  async handoff_revoke(a, b) {
    const op = staff(a, "operator");
    await revokeHandoff(str(b, "id"), op);
    return {};
  },

  // 要確認: the operator's decision on a draft for one of their own cases (cmd_review checks ownership and the item version).
  async review(a, b) {
    const op = staff(a, "operator");
    const incident = str(b, "incident");
    const kind = str(b, "kind");
    const ref = str(b, "ref");
    const decision = str(b, "decision");
    if (!UUID.test(incident)) fail(400, "bad_request");
    if (kind === "suggestion" && decision === "accepted") {
      // What is sent is the stored suggestion, never the request body, through the operator's own send and assign.
      const { data: s } = await admin.from("bot_suggestion").select("rev, suggestion").eq("incident", incident).maybeSingle();
      if (!s || String(s.rev) !== ref) fail(409, "conflict");
      const intent = s!.suggestion?.intent;
      const r = replyOf(intent) ?? fail(409, "conflict");
      await rpc("cmd_accept_suggestion", {
        p_uid: op.uid, p_name: op.name, p_incident: incident, p_rev: s!.rev, p_intent: intent, p_manual: MANUAL_VERSION, p_needs_held: Boolean(r.needsHeld),
      });
      await signalBot(incident, "send");
      if (s!.suggestion?.dispatch) await signalBot(incident, "assign");
      return {};
    }
    if (b.note != null && (typeof b.note !== "string" || b.note.length > MAX_TEXT)) fail(400, "bad_request");
    await rpc("cmd_review", { p_uid: op.uid, p_name: op.name, p_kind: kind, p_incident: incident, p_ref: ref, p_decision: decision, p_note: b.note ?? null });
    if (kind !== "handoff" || decision === "dismissed") return {};
    // The token is stored only as a hash, so "copy again" means a new link for the same recipient, the old one revoked.
    const { data: h } = await priv().from("handoff").select("recipient").eq("id", ref).single();
    await revokeHandoff(ref, op);
    return decision === "reissued" ? createHandoff(incident, h!.recipient, op) : {};
  },

  async staff_list(a) {
    staff(a, "operator");
    const { data, error } = await priv().from("staff").select("uid, display_name").eq("role", "field").order("display_name");
    if (error) throw error;
    return { field: data };
  },

  async issue_code(a, b) {
    const op = staff(a, "operator");
    const incident = str(b, "incident");
    const { data: d } = await admin.from("desk").select("id").eq("id", incident).eq("operator_id", op.uid).is("finished_at", null).maybeSingle();
    if (!d) fail(403, "forbidden");
    const { data: bound } = await priv().from("binding").select("expires").eq("incident", incident).maybeSingle();
    if (bound && Date.parse(bound.expires) > Date.now()) fail(409, "conflict");
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const { error } = await priv().from("pair_code").upsert({ incident, digest: digest(code), expires: new Date(Date.now() + CODE_TTL_MS).toISOString() });
    if (error) throw error;
    return { code, expires_in: CODE_TTL_MS / 1000 };
  },

  async claim(a, b) {
    const op = staff(a, "operator");
    await rpc("cmd_claim", { p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident") });
    return {};
  },

  async remote_release(a, b) {
    const op = staff(a, "operator");
    await rpc("cmd_remote_release", { p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident"), p_result: str(b, "result") });
    return {};
  },

  async send(a, b) {
    const op = staff(a, "operator");
    const intent = str(b, "intent");
    const r = replyOf(intent) ?? fail(400, "bad_request");
    const id = await rpc<string>("cmd_send", {
      p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident"), p_intent: intent, p_manual: MANUAL_VERSION, p_needs_held: Boolean(r.needsHeld),
    });
    return { id };
  },

  async assign(a, b) {
    const op = staff(a, "operator");
    await rpc("cmd_assign", { p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident"), p_assignee: str(b, "assignee") });
    return {};
  },

  async outcome(a, b) {
    const op = staff(a, "operator");
    const incident = str(b, "incident");
    await rpc("cmd_outcome", { p_uid: op.uid, p_name: op.name, p_incident: incident, p_reply: str(b, "reply"), p_result: str(b, "result") });
    if (b.result === "understood") await closeVoice(incident);
    return {};
  },

  async reset_caller(a, b) {
    const op = staff(a, "operator");
    const incident = str(b, "incident");
    await rpc("cmd_reset_caller", { p_uid: op.uid, p_name: op.name, p_incident: incident });
    await closeVoice(incident);
    return {};
  },

  async abandon(a, b) {
    const op = staff(a, "operator");
    const incident = str(b, "incident");
    await rpc("cmd_abandon", { p_uid: op.uid, p_name: op.name, p_incident: incident });
    await closeVoice(incident);
    return {};
  },

  // Caller (anonymous user)
  async pair(a, b) {
    const c = caller(a);
    if (c.incident) fail(409, "conflict");
    const lang = str(b, "lang");
    if (!(LANGS as readonly string[]).includes(lang)) fail(400, "bad_request");
    const station = str(b, "station");
    if (!(await rpc<boolean>("note_pair_attempt", { p_uid: c.uid, p_station: station }))) fail(429, "rate_limited");
    // Same answer for a wrong, expired, used or wrong-station code.
    return { incident: await rpc("redeem_pair", { p_uid: c.uid, p_station: station, p_digest: digest(str(b, "code")), p_lang: lang }) };
  },

  async draft(a, b) {
    const c = caller(a);
    if (!c.incident || !c.lang) fail(403, "forbidden");
    const incident = c.incident as string;
    const lang = c.lang as Lang;
    const { data: cur } = await admin.from("draft").select("rev, card_back, cash_received").eq("incident", incident).single();
    if (!cur || b.base_rev !== cur.rev) fail(409, "conflict");
    const text = typeof b.text === "string" ? b.text.trim().slice(0, MAX_TEXT) : "";
    if (text && looksLikeNumber(text)) return { withheld: true };
    const patch = text ? await extract(text, lang, { card_back: cur!.card_back, cash_received: cur!.cash_received }) : null;
    const pickFact = (k: (typeof FACT_KEYS)[number]): Fact | null => {
      const v = b[k];
      if (v === "yes" || v === "no" || v === "unknown") return v;
      return patch && patch[k] !== "unchanged" ? patch[k] : null;
    };
    const card = pickFact("card_back");
    const cash = pickFact("cash_received");
    const tapped = b.card_back !== undefined || b.cash_received !== undefined;
    const rev = await rpc<number>("cmd_draft", {
      p_uid: c.uid, p_rev: cur!.rev, p_card: card, p_cash: cash, p_words: text || null, p_clarify: Boolean(patch?.clarify) && !tapped,
    });
    const said = readBackText(lang, { card_back: card ?? cur!.card_back, cash_received: cash ?? cur!.cash_received });
    return { rev, say: said ? signSpeech(incident, said) : null };
  },

  async confirm(a, b) {
    const c = caller(a);
    if (typeof b.rev !== "number") fail(400, "bad_request");
    await rpc("cmd_confirm", { p_uid: c.uid, p_rev: b.rev });
    // The words stay in the caller's language; staff get a labelled machine translation beside them.
    const { data: d } = await admin.from("desk").select("id, lang, caller_words").eq("id", c.incident!).single();
    if (d?.caller_words && d.lang !== "ja") {
      const ja = await toJapanese(d.caller_words);
      if (ja) await admin.from("desk").update({ caller_words_ja: ja }).eq("id", d.id);
    }
    return {};
  },

  async set_lang(a, b) {
    const c = caller(a);
    const lang = str(b, "lang");
    if (!(LANGS as readonly string[]).includes(lang)) fail(400, "bad_request");
    await rpc("cmd_set_lang", { p_uid: c.uid, p_lang: lang });
    return {};
  },

  async choose(a, b) {
    const c = caller(a);
    await rpc("cmd_choose", { p_uid: c.uid, p_choice: str(b, "choice"), p_choice_intents: CHOICE_INTENTS });
    return {};
  },

  async teachback(a, b) {
    const c = caller(a);
    const text = str(b, "text").trim().slice(0, MAX_TEXT);
    if (looksLikeNumber(text)) return { withheld: true };
    const ja = c.lang === "ja" ? text : await toJapanese(text);
    await rpc("cmd_teachback", { p_uid: c.uid, p_text: text, p_ja: ja });
    return {};
  },

  async human(a) {
    const c = caller(a);
    await rpc("cmd_human", { p_uid: c.uid });
    return {};
  },

  async rate(a, b) {
    const c = caller(a);
    if (typeof b.rating !== "number" || !Number.isInteger(b.rating)) fail(400, "bad_request");
    await rpc("cmd_rate", { p_uid: c.uid, p_rating: b.rating });
    return {};
  },

  // AI response training (lib/training.ts): the operator's own isolated session; never touches the desk.
  training_start: (a, b) => training.start(staff(a, "operator"), b),
  training_say: (a, b) => training.say(staff(a, "operator"), b),
  training_readback: (a, b) => training.readback(staff(a, "operator"), b),
  training_reply: (a, b) => training.sendReply(staff(a, "operator"), b),
  training_dispatch: (a, b) => training.dispatch(staff(a, "operator"), b),
  training_end: (a, b) => training.end(staff(a, "operator"), b),

  // Real-world fault paths (lib/faults.ts): fault type, stated amount, bank status, caller taps, follow-up.
  set_fault: (a, b) => faults.setFault(staff(a, "operator"), b),
  stated_amount: (a, b) => faults.statedAmount(staff(a, "operator"), b),
  bank_status: (a, b) => faults.bankStatus(staff(a, "operator"), b),
  flag: (a, b) => faults.flag(caller(a), b),
  followup: (a) => faults.followup(caller(a)),

  // Field (security guard)
  async field(a, b) {
    const f = staff(a, "field");
    const eta = typeof b.eta === "string" && b.eta && ETA_OPTIONS.includes(b.eta) ? b.eta : null;
    if (typeof b.generation !== "number") fail(400, "bad_request");
    await rpc("cmd_field", { p_uid: f.uid, p_name: f.name, p_incident: str(b, "incident"), p_generation: b.generation, p_state: str(b, "state"), p_eta: eta });
    return {};
  },

  // Text-only path and disaster mode (lib/access.ts, lib/disaster.ts).
  ...accessCommands,
  ...disasterCommands,
};

export async function POST(req: Request): Promise<Response> {
  const log = requestLog("/api/cmd", req);
  let cmd = "unknown";
  let role = "none";
  let incident: string | undefined;
  let session: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const name = typeof body.cmd === "string" && Object.hasOwn(commands, body.cmd) ? body.cmd : fail(404, "not_found");
    cmd = name;
    const actor = await actorFrom(req);
    role = actor.kind === "staff" ? actor.role : actor.kind;
    incident = actor.kind === "caller" ? actor.incident ?? undefined : typeof body.incident === "string" && UUID.test(body.incident) ? body.incident : undefined;
    session = typeof body.session === "string" && UUID.test(body.session) ? body.session : undefined;
    const out = await commands[name](actor, body);
    if (incident && BOT_SIGNALS.has(name)) await signalBot(incident, name);
    log.info("cmd", { cmd, role, incident, session, status: 200, duration_ms: log.ms(), code: "withheld" in out ? "withheld" : undefined });
    return reply(200, out);
  } catch (e) {
    if (e instanceof HttpError) {
      log[e.status >= 500 ? "error" : "warn"]("cmd", { cmd, role, incident, session, status: e.status, code: e.message, duration_ms: log.ms() });
      return reply(e.status, { error: e.message });
    }
    log.error("cmd", { cmd, role, incident, session, status: 500, code: "server", duration_ms: log.ms(), ...errorFields(e) });
    return reply(500, { error: "server" });
  }
}
