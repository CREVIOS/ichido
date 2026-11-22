import "server-only";
import { AMOUNT_FAULTS, AMOUNT_MAX, BANK_STATUS, DEVICE_FAULT, PACK_TAPS, contentPack, defaultSituation, isBankStatus, isCallerFlag, isFault, packTaps } from "@/content/catalogue";
import { admin, fail, priv } from "@/lib/server";

// Commands for the real-world fault paths (content/faults.ts). Each one is a SQL function in
// supabase/migrations/20261123110000_faults.sql that checks its own preconditions; the reply rules are a trigger.

type Body = Record<string, unknown>;
type Op = { uid: string; name: string };
type Caller = { uid: string; incident?: string | null };

const STATUS: Record<string, number> = { forbidden: 403, not_found: 404, conflict: 409, bad_request: 400 };
const str = (b: Body, k: string) => (typeof b[k] === "string" && b[k] ? (b[k] as string) : fail(400, "bad_request"));

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await admin.rpc(fn, args);
  if (!error) return {};
  if (Object.hasOwn(STATUS, error.message)) fail(STATUS[error.message], error.message);
  throw error;
}

// Operator: correct the fault type when the caller's story shows the machine alert was wrong.
export function setFault(op: Op, b: Body) {
  if (!isFault(b.fault)) fail(400, "bad_request");
  return rpc("cmd_set_fault", { p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident"), p_fault: b.fault });
}

// Operator: the amount the caller stated on the handset (本人申告). Never accepted from a caller's phone.
export function statedAmount(op: Op, b: Body) {
  const amount = b.amount;   // null clears it
  if (amount !== null && !(typeof amount === "number" && Number.isInteger(amount) && amount >= 1 && amount <= AMOUNT_MAX)) fail(400, "bad_request");
  return rpc("cmd_stated_amount", { p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident"), p_amount: amount, p_amount_faults: AMOUNT_FAULTS });
}

// Operator, on the bank's behalf: the bank's follow-up status from the catalogue list (contact_by carries a date).
export function bankStatus(op: Op, b: Body) {
  const status = str(b, "status");
  if (!isBankStatus(status)) fail(400, "bad_request");
  const due = BANK_STATUS[status].due ? str(b, "due") : null;
  if (due !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(due) && !Number.isNaN(Date.parse(due)))) fail(400, "bad_request");
  return rpc("cmd_bank_status", { p_uid: op.uid, p_name: op.name, p_incident: str(b, "incident"), p_status: status, p_due: due });
}

// Caller: one of their own taps, on or off. A tap is turned on only if the case's pack offers it (any can be turned off).
export async function flag(c: Caller, b: Body) {
  if (!isCallerFlag(b.flag) || typeof b.on !== "boolean") fail(400, "bad_request");
  if (b.on && c.incident) {
    const { data: d } = await admin.from("desk").select("fault").eq("id", c.incident).maybeSingle();
    const p = contentPack(d?.fault);
    if (p ? !packTaps(p).includes(b.flag as string) : Object.hasOwn(PACK_TAPS, b.flag as string)) fail(400, "bad_request");
  }
  return rpc("cmd_flag", { p_uid: c.uid, p_flag: b.flag, p_on: b.on });
}

// The situation a press on this station's Help Point opens: its pack's default, or the ATM's card fault.
export async function defaultFault(station: string): Promise<string> {
  const { data } = await admin.from("station").select("kind").eq("id", station).maybeSingle();
  return defaultSituation(data?.kind) ?? DEVICE_FAULT;
}

// Caller: the case this phone may still follow after it closed (30 days), with the bank's status.
// Only what the caller already saw, plus the bank's status: never staff notes, amounts or the timeline.
export async function followup(c: Caller) {
  const { data: f } = await priv().from("follow_up").select("incident").eq("uid", c.uid).gt("expires", new Date().toISOString())
    .order("expires", { ascending: false }).limit(1).maybeSingle();
  if (!f) return { case: null };
  const { data: card, error } = await admin.from("caller_card")
    .select("id, station, fault, lang, reply_id, bank_status, bank_due, bank_updated_at").eq("id", f.incident).single();
  if (error) throw error;
  const [{ data: reply }, { data: station }] = await Promise.all([
    card.reply_id ? admin.from("reply").select("intent, slots").eq("id", card.reply_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("station").select("label").eq("id", card.station).maybeSingle(),
  ]);
  return { case: { ...card, reply, station } };
}
