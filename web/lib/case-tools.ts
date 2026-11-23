import "server-only";
import { CALLER_FLAGS, FRAUD_FAULT, REPLIES, REPLY_RULES, STAFF_JA, contentPack, packOfFault, replyBlock, type Fact } from "@/content/catalogue";
import { admin } from "@/lib/server";

// Read-only tools over one case, shared by Gemini's function calling. They read facts the operator can already see;
// never the caller's words or draft.

export type Ctx = { incident: string; db?: typeof admin };
type DeskFacts = { confirmed_rev: number | null; card_back: string; remote_release: string | null; fault: string };
const WHY_NOT: Record<string, string> = {
  awaiting: "caller has not confirmed yet", held: "card is not confirmed as still inside",
  fault: "not an approved reply for this fault type", flag: "the caller's own statements do not fit this reply",
};

// Which approved replies may be sent now — the same rules the SQL command and the reply trigger enforce.
export function eligibleReplies(d: DeskFacts, flags: string[]) {
  const ctx = { fault: d.fault, flags, confirmed: d.confirmed_rev != null, card_back: d.card_back as Fact, remote_release: d.remote_release };
  // Only the case's own pack: another pack's replies are never an option.
  const pack = packOfFault(d.fault);
  return Object.entries(REPLIES).filter(([intent]) => (REPLY_RULES[intent]?.pack ?? "atm") === pack).map(([intent, r]) => {
    const block = replyBlock(intent, r.needsHeld, ctx);
    return { intent, code: r.code, title_ja: r.title, offers_wait_or_leave: Boolean(r.offersChoice), eligible: block == null, why_not: block && WHY_NOT[block] };
  });
}

export const TOOL_DECLARATIONS = [
  { name: "get_case", description: "The case: fault, status, what the caller confirmed (card_back, cash_received), remote release result, caller language, choice, guard job state, minutes open, whether a suspected phone-fraud alert was raised and whether fraud mode is already active." },
  { name: "list_replies", description: "The bank's approved replies with their code, Japanese title, and whether each is eligible for this case right now (and why not)." },
  { name: "list_guards", description: "Security guards who can be dispatched, with how many open jobs each has." },
  { name: "get_pack_rules", description: "For a hospital, city-office, station or shelter case: each of the pack's approved replies with the situations it fits and the caller taps it needs or is blocked by (urgent taps allow only the urgent reply)." },
  { name: "station_status", description: "The ATM's Help Point device health and how many cases this station had in the last 7 days." },
];

export async function runTool(name: string, ctx: Ctx): Promise<unknown> {
  const db = ctx.db ?? admin;
  const { data: d } = await db.from("desk").select("station, fault, status, card_back, cash_received, confirmed_rev, remote_release, lang, created_at, finished_at, fraud_at, triage").eq("id", ctx.incident).single();
  if (!d) return { error: "not_found" };
  switch (name) {
    case "get_case": {
      const [{ data: c }, { data: j }] = await Promise.all([
        db.from("caller_card").select("choice, field_state, eta, needs_human, flags").eq("id", ctx.incident).maybeSingle(),
        db.from("field_job").select("state, eta").eq("incident", ctx.incident).maybeSingle(),
      ]);
      // A pack case: the situation and the caller's own confirmed taps in staff wording, and the intake model's
      // suggestion labelled as such (codes only; never the caller's words).
      const p = contentPack(d.fault);
      const packView = p && {
        situation: { code: d.fault, ja: STAFF_JA.fault[d.fault] ?? d.fault },
        caller_taps: (c?.flags ?? []).map((f: string) => ({ code: f, ja: CALLER_FLAGS[f]?.staff ?? f, urgent: Boolean(p.taps[f]?.urgent) })),
        ai_triage: d.triage ? { note: "intake model suggestion, not confirmed by the caller", situation: d.triage.situation ?? null, taps: d.triage.taps ?? [] } : null,
      };
      return {
        ...d, triage: undefined, ...packView, pack: packOfFault(d.fault), caller_confirmed: d.confirmed_rev != null, minutes_open: Math.round((Date.now() - Date.parse(d.created_at)) / 60000), caller: c, guard_job: j,
        suspected_phone_fraud_alert: d.fault === FRAUD_FAULT, fraud_mode_active: d.fraud_at != null,
      };
    }
    case "list_replies": {
      const { data: c } = await db.from("caller_card").select("flags").eq("id", ctx.incident).maybeSingle();
      const { data: blocked } = await db.rpc("blocked_work_replies", { p_incident: ctx.incident }).throwOnError();
      return eligibleReplies(d, c?.flags ?? []).map((r) => blocked?.includes(r.intent) ? { ...r, eligible: false, why_not: "required responder or partner action is pending" } : r);
    }
    case "list_guards": {
      const { data, error } = await db.rpc("available_responders", { p_incident: ctx.incident });
      if (error) throw error;
      return (data ?? []).map((g: { uid: string; display_name: string }) => ({ uid: g.uid, name: g.display_name, open_jobs: 0 }));
    }
    case "get_pack_rules": {
      const p = contentPack(d.fault);
      if (!p) return { pack: "atm", note: "ATM cases use list_replies only" };
      return { pack: p.id, replies: Object.entries(p.replies).map(([intent, r]) => ({
        intent, code: r.code, title_ja: r.title, fits_situations: r.rule.faults ?? "any", needs_one_of_taps: r.rule.needsFlags ?? [], blocked_by_taps: r.rule.blockedBy ?? [],
      })), urgent_taps: Object.keys(p.taps).filter((t) => p.taps[t].urgent) };
    }
    case "station_status": {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [{ data: h }, { count }] = await Promise.all([
        db.from("device_health").select("last_seen, rssi, firmware").eq("station", d.station).maybeSingle(),
        db.from("desk").select("id", { count: "exact", head: true }).eq("station", d.station).gte("created_at", since),
      ]);
      return { station: d.station, device: h ? { seconds_since_heartbeat: Math.round((Date.now() - Date.parse(h.last_seen)) / 1000), rssi: h.rssi, firmware: h.firmware } : null, cases_last_7_days: count ?? 0 };
    }
    default:
      return { error: "unknown_tool" };
  }
}
