import "server-only";
import { REPLIES, replyBlock, type Fact } from "@/content/catalogue";
import { admin, priv } from "@/lib/server";

// Read-only tools over one case, shared by Gemini's function calling. They read facts the operator can already see;
// never the caller's words or draft.

export type Ctx = { incident: string };
type DeskFacts = { confirmed_rev: number | null; card_back: string; remote_release: string | null; fault: string };
const WHY_NOT: Record<string, string> = {
  awaiting: "caller has not confirmed yet", held: "card is not confirmed as still inside",
  fault: "not an approved reply for this fault type", flag: "the caller's own statements do not fit this reply",
};

// Which approved replies may be sent now — the same rules the SQL command and the reply trigger enforce.
export function eligibleReplies(d: DeskFacts, flags: string[]) {
  const ctx = { fault: d.fault, flags, confirmed: d.confirmed_rev != null, card_back: d.card_back as Fact, remote_release: d.remote_release };
  return Object.entries(REPLIES).map(([intent, r]) => {
    const block = replyBlock(intent, r.needsHeld, ctx);
    return { intent, code: r.code, title_ja: r.title, offers_wait_or_leave: Boolean(r.offersChoice), eligible: block == null, why_not: block && WHY_NOT[block] };
  });
}

export const TOOL_DECLARATIONS = [
  { name: "get_case", description: "The case: fault, status, what the caller confirmed (card_back, cash_received), remote release result, caller language, choice, guard job state, minutes open." },
  { name: "list_replies", description: "The bank's approved replies with their code, Japanese title, and whether each is eligible for this case right now (and why not)." },
  { name: "list_guards", description: "Security guards who can be dispatched, with how many open jobs each has." },
  { name: "station_status", description: "The ATM's Help Point device health and how many cases this station had in the last 7 days." },
];

export async function runTool(name: string, ctx: Ctx): Promise<unknown> {
  const { data: d } = await admin.from("desk").select("station, fault, status, card_back, cash_received, confirmed_rev, remote_release, lang, created_at, finished_at").eq("id", ctx.incident).single();
  if (!d) return { error: "not_found" };
  switch (name) {
    case "get_case": {
      const [{ data: c }, { data: j }] = await Promise.all([
        admin.from("caller_card").select("choice, field_state, eta, needs_human, flags").eq("id", ctx.incident).maybeSingle(),
        admin.from("field_job").select("state, eta").eq("incident", ctx.incident).maybeSingle(),
      ]);
      return { ...d, caller_confirmed: d.confirmed_rev != null, minutes_open: Math.round((Date.now() - Date.parse(d.created_at)) / 60000), caller: c, guard_job: j };
    }
    case "list_replies": {
      const { data: c } = await admin.from("caller_card").select("flags").eq("id", ctx.incident).maybeSingle();
      return eligibleReplies(d, c?.flags ?? []);
    }
    case "list_guards": {
      const [{ data: g }, { data: jobs }] = await Promise.all([
        priv().from("staff").select("uid, display_name").eq("role", "field"),
        admin.from("field_job").select("assignee").neq("state", "done"),
      ]);
      return (g ?? []).map((x) => ({ uid: x.uid, name: x.display_name, open_jobs: (jobs ?? []).filter((j) => j.assignee === x.uid).length }));
    }
    case "station_status": {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [{ data: h }, { count }] = await Promise.all([
        admin.from("device_health").select("last_seen, rssi, firmware").eq("station", d.station).maybeSingle(),
        admin.from("desk").select("id", { count: "exact", head: true }).eq("station", d.station).gte("created_at", since),
      ]);
      return { station: d.station, device: h ? { seconds_since_heartbeat: Math.round((Date.now() - Date.parse(h.last_seen)) / 1000), rssi: h.rssi, firmware: h.firmware } : null, cases_last_7_days: count ?? 0 };
    }
    default:
      return { error: "unknown_tool" };
  }
}
