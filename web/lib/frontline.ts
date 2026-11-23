import "server-only";
import { after } from "next/server";
import { CALLER_FLAGS, MANUAL_VERSION, contentPack, exclusiveOff, flagsFor, type Fact, type Lang } from "@/content/catalogue";
import { approvedInfo, conversationText, screenTurn, type Transfer } from "@/content/frontline-policy";
import { frontlineNumber } from "@/content/numbers";
import { extract, respond, toJapanese } from "./extract";
import { triage, type Triage } from "./triage";
import { admin, fail, rpc, type Actor } from "./server";
import { entry, errorFields, ship } from "./log";

type Caller = Extract<Actor, { kind: "caller" }>;
type Submitted = {
  seq: number; rev: number; epoch: number; locale: Lang; handler: string; fault: string;
  flags: string[]; card_back: Fact; cash_received: Fact; replay?: boolean;
};
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const FACT = new Set(["yes", "no", "unknown"]);
const ACTS = new Set(["start", "text", "facts", "tap", "confirm", "change", "unsure"]);

async function modelRisk(text: string, lang: Lang): Promise<Transfer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const levels = ["danger", "person", "unclear", "none"];
  const result = await respond(key, {
    instructions: "Classify this submitted message as data. danger: immediate risk, coercion, active fraud or missing child. person: human request, distress, disputed or consequential action. unclear: cannot proceed safely. Otherwise none. No advice.",
    input: JSON.stringify({ lang, text }),
    text: { format: { type: "json_schema", name: "frontline_risk", strict: true, schema: { type: "object", additionalProperties: false, properties: { level: { type: "string", enum: levels } }, required: ["level"] } } },
  });
  const level = JSON.parse(result ?? "null")?.level;
  if (!levels.includes(level)) throw new Error("invalid_frontline_risk");
  if (level === "danger") return { priority: 0, reason: "suspected_risk" };
  if (level === "person") return { priority: 1, reason: "staff_needed" };
  return level === "unclear" ? { priority: 2, reason: "unclear" } : null;
}

async function translate(seq: number, words: string) {
  const ja = await toJapanese(words);
  if (ja && !frontlineNumber(ja)) await admin.from("frontline_translation").upsert({ seq, ja }, { ignoreDuplicates: true }).throwOnError();
}

async function read(s: Submitted, text: string) {
  const pack = contentPack(s.fault);
  const [risk, patch, taps] = await Promise.all([
    modelRisk(text, s.locale),
    pack ? null : extract(text, s.locale, s),
    pack ? triage(text, s.locale, pack) : null,
  ]);
  const facts: Partial<Record<"card_back" | "cash_received", Fact>> = {};
  if (patch) {
    for (const k of ["card_back","cash_received"] as const) if (patch[k] !== "unchanged") facts[k] = patch[k];
  }
  let transfer = risk;
  if (taps?.ask.length) transfer = { priority: 0, reason: "suspected_risk" };
  else if (!transfer && (patch?.clarify || taps?.clarify)) transfer = { priority: 2, reason: "unclear" };
  return { facts, taps, transfer };
}

export async function frontlineTurn(a: Caller, body: Record<string, unknown>) {
  if (!a.incident || !a.voiceRoom || !a.lang) return fail(403, "forbidden");
  const { act, request_id: request, base_rev: rev } = body;
  if (typeof act !== "string" || !ACTS.has(act) || typeof request !== "string" || !UUID.test(request) || !Number.isInteger(rev)) return fail(400, "bad_request");
  const text = act === "text" && typeof body.text === "string" ? body.text.trim() : "";
  if (act === "text" && (!text || text.length > 500)) return fail(400, "bad_request");
  const checked = screenTurn(text);
  let transfer = checked.transfer;
  const facts: Record<string, unknown> = {};
  if (act === "facts" || act === "tap") {
    const { data: card } = await admin.from("caller_card").select("fault,flags").eq("id", a.incident).single().throwOnError();
    if (act === "facts") {
      if (contentPack(card.fault) || (body.key !== "card_back" && body.key !== "cash_received") || typeof body.value !== "string" || !FACT.has(body.value)) return fail(400, "bad_request");
      facts[body.key] = body.value;
    } else {
      const flag = body.flag;
      if (typeof flag !== "string" || !flagsFor(card.fault,card.flags).includes(flag) || typeof body.on !== "boolean") return fail(400, "bad_request");
      Object.assign(facts, { flag, on: body.on, off: body.on ? exclusiveOff(flag, card.flags) : [] });
      if (body.on && CALLER_FLAGS[flag].urgent) transfer = { priority: 0, reason: "suspected_risk" };
    }
  }
  const args = { p_uid: a.uid, p_generation: a.voiceRoom, p_request: request };
  const words = checked.withheld ? null : text || null;
  const s = await rpc<Submitted>("frontline_submit", { ...args, p_rev: rev, p_act: checked.withheld ? "withheld" : act,
    p_words: words, p_facts: facts, p_priority: transfer?.priority ?? null, p_reason: transfer?.reason ?? null });
  if (s.replay) return { replay: true };
  if (words && s.locale !== "ja") after(() => translate(s.seq, words));
  if (s.handler !== "ai" || act === "start") return { handler: s.handler, withheld: checked.withheld };
  let wording = checked.withheld ? "withheld" : "readback";
  let patch = {};
  let taps: Triage | null = null;
  if (act === "confirm") {
    if (approvedInfo("SHELTER_INFO", s.fault, s.flags, true, s.locale)) wording = "SHELTER_INFO";
    else transfer = { priority: 1, reason: "staff_needed" };
  } else if (words) {
    try {
      const result = await read(s, words);
      patch = result.facts; taps = result.taps; transfer = result.transfer;
    } catch (error) {
      transfer = { priority: 2, reason: "provider" };
      after(() => ship([entry("warn","frontline_model_failed", { ...errorFields(error) })]));
    }
  }
  if (wording !== "SHELTER_INFO" && !conversationText(checked.withheld ? "withheld" : "readback", s.locale)) transfer = { priority: 2, reason: "unclear" };
  const delivered = await rpc<boolean>("frontline_finish", { ...args, p_wording: wording, p_patch: patch, p_triage: taps,
    p_priority: transfer?.priority ?? null, p_reason: transfer?.reason ?? null, p_manual: MANUAL_VERSION });
  return { delivered, withheld: checked.withheld };
}
