import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ACTOR, DESK, FAULT_DESK, STAFF_JA, REMOTE_RELEASE, bankStatusStaff, isFault, CALLER_FLAGS, FACT_STAFF, HANDOFF, LANG_NAME, identifyingSummary, OPS, PACKS, PACK_RECIPIENTS, PARTNER, eventText, packOfFault, type Fact, type Lang } from "@/content/catalogue";
import { admin, fail, priv } from "@/lib/server";
import { rpc } from "@/lib/access";

// Hand-off links: a read-only record of one case for the recipients of its pack (an ATM's bank, police or security
// company; a hospital department or medical interpreter; a city section; the railway; a disaster HQ…).
export type Recipient = keyof typeof PACK_RECIPIENTS;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createHandoff(incident: string, recipient: string, by: { uid: string }, due = new Date(Date.now() + 86400000).toISOString()) {
  const { data: d } = await admin.from("desk").select("fault").eq("id", incident).maybeSingle();
  if (!d) fail(404, "not_found");
  if (!Object.hasOwn(PACKS[packOfFault(d!.fault)].recipients, recipient)) fail(400, "bad_request");
  const token = randomBytes(24).toString("base64url");
  const [link] = await rpc<{ id: string; expires_at: string }[]>("prepare_handoff", {
    p_uid: by.uid, p_incident: incident, p_hash: hash(token), p_recipient: recipient, p_due: due,
  });
  return { id: link.id, expires_at: link.expires_at, path: `/h/${token}` };
}

export async function listHandoffs(incident: string) {
  const { data, error } = await priv().from("handoff").select("id, recipient, created_at, expires_at, revoked_at, views")
    .eq("incident", incident).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeHandoff(id: string, by: { uid: string }) {
  await rpc("revoke_handoff", { p_uid: by.uid, p_id: id });
}

// Resolve a token for the public page; counts the view and writes it to the timeline. Null when unknown, expired or revoked.
export async function openHandoff(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const [link] = await rpc<{ incident: string; recipient: Recipient; expires_at: string }[]>("view_handoff", { p_hash: hash(token) });
  return link ?? null;
}

const partnerTime = (s: string) => new Date(s).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", timeZoneName: "short" });

function shareFlag(recipient: string, flag: string, flags: string[]) {
  switch (recipient) {
    case "medical_interpreter": case "consult_desk": return flag === "need_interpreter" || flag === "need_explain";
    case "department": return !/^(ins_|pay_)/.test(flag);
    case "railway": return flag === "leave_soon" || (flags.includes("share_item") && flag.startsWith("item_"));
    case "health_team": return /^(need_medicine|diet_allergy|red_|who_)/.test(flag);
    case "disaster_hq": return !/allergy|medicine|red_|pain_|ins_/.test(flag);
    case "bank": case "city_section": return true;
    default: return false;
  }
}

// The preview and bearer document use the same allowlist, including links issued before partner tracking.
export async function partnerReport(incident: string, recipient: string, proposedDue: string | null = null): Promise<[string,string][]> {
  const [{ data: d }, { data: c }, { data: w }] = await Promise.all([
    admin.from("desk").select("station,fault,lang,remote_release,stated_amount,confirmed_rev,card_back,cash_received,fraud_at,ai_summary,summary_checked").eq("id",incident).single().throwOnError(),
    admin.from("caller_card").select("flags,confirmed_flags,text_only,bank_status,bank_due,choice").eq("id",incident).maybeSingle().throwOnError(),
    admin.from("partner_work").select("due_at,requested_at,accepted_at,railway_ref").eq("incident",incident).eq("recipient",recipient).maybeSingle().throwOnError(),
  ]);
  if (!d || !Object.hasOwn(PACKS[packOfFault(d.fault)].recipients, recipient)) return fail(400,"bad_request");
  const { data: station } = await admin.from("station").select("label,security_company").eq("id",d.station).single().throwOnError();
  const D = HANDOFF.doc;
  const due = w?.due_at ?? proposedDue;
  const rows: [string,string][] = [
    [D.to(HANDOFF.recipient[recipient]), incident.slice(0,8)], [PARTNER.desk, `${PACKS[packOfFault(d.fault)].name.staff} · ${station?.label.ja ?? d.station}`],
    [PARTNER.action, PARTNER.actions[recipient]], [PARTNER.due, due ? partnerTime(due) : D.none],
    [D.status, w?.accepted_at ? PARTNER.accepted : w?.requested_at ? PARTNER.sent : PARTNER.pending],
    [PARTNER.asOf, partnerTime(new Date().toISOString())],
  ];
  if (d.lang) rows.push([D.lang, LANG_NAME[d.lang as Lang]]);
  if (recipient === "bank" && d.confirmed_rev != null) rows.push([D.confirmed,[FACT_STAFF.card_back[d.card_back as Fact],FACT_STAFF.cash_received[d.cash_received as Fact]].join("・")]);
  if (recipient === "bank") {
    if (isFault(d.fault)) rows.push([D.fault,STAFF_JA.fault[d.fault]]);
    if (d.stated_amount != null) rows.push([FAULT_DESK.amount,FAULT_DESK.yen(d.stated_amount)]);
    if (d.remote_release) rows.push([D.release,REMOTE_RELEASE[d.remote_release]]);
    if (c?.bank_status) rows.push([FAULT_DESK.bank,bankStatusStaff(c.bank_status,c.bank_due)]);
    if (c?.choice) rows.push([D.choice,DESK.choiceText[c.choice]]);
  }
  const current: string[] = c?.flags ?? [];
  if (c?.text_only) rows.push([PARTNER.contact,PARTNER.textOnly]);
  const allowed = current.filter((f) => shareFlag(recipient,f,current));
  for (const confirmed of [true,false]) {
    const names = allowed.filter((f) => Boolean(c?.confirmed_flags?.includes(f)) === confirmed).map((f) => CALLER_FLAGS[f]?.staff).filter(Boolean);
    if (names.length) rows.push([confirmed ? D.confirmed : PARTNER.tentative,names.join("・")]);
  }
  if (w?.railway_ref) rows.push([PARTNER.ref,w.railway_ref]);
  if ((recipient === "bank" || recipient === "department") && d.ai_summary && d.summary_checked && !identifyingSummary(d.ai_summary)) rows.push([D.aiSummary,d.ai_summary]);
  if (recipient === "police" || recipient === "security") {
    const { data: events } = await admin.from("case_event").select("kind,at").eq("incident",incident)
      .in("kind",["fraud","fraud_safe","dispatch","redispatch"]).order("id").throwOnError();
    if (d.fraud_at) rows.push([OPS.fraud.handoff,partnerTime(d.fraud_at)]);
    if (events?.length) rows.push([D.timeline,events.map((e) => `${partnerTime(e.at)} ${eventText(e.kind,{ company:station?.security_company,assignee:ACTOR.field })}`).join("\n")]);
  }
  return rows;
}
