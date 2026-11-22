import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { admin } from "@/lib/server";
import { openHandoff } from "@/lib/handoff";
import { Mark } from "@/components/mark";
import { ACTOR, CALLER_FLAGS, DESK, FACT_STAFF, FAULT_DESK, HANDOFF, LANG_NAME, OPS, RATING, REMOTE_RELEASE, STATUS, bankStatusStaff, eventText, isFault, PACKS, packOfFault, packStaffField, replyOf, summaryDraft, type Fact, type FieldState, type Lang, type L10n, type Status, STAFF_JA } from "@/content/catalogue";
import { PrintButton } from "./print";

export const metadata: Metadata = { title: HANDOFF.doc.title, robots: { index: false, follow: false } };

const D = HANDOFF.doc;
const at = (t: string | null | undefined) => (t ? new Date(t).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : D.none);

export default function HandoffPage({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={null}><Report params={params} /></Suspense>;
}

// The record a bank, police or security company receives: facts and decisions, never the caller's own free text.
async function Report({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await openHandoff(token);
  if (!h) return <main className="grid min-h-dvh place-items-center p-6"><p className="max-w-sm text-center text-[14px]">{D.gone}</p></main>;
  const id = h.incident;
  const [{ data: d }, { data: events }, { data: replies }, { data: job }, { data: card }] = await Promise.all([
    admin.from("desk").select("station, source, fault, status, lang, card_back, cash_received, confirmed_rev, remote_release, abandoned, created_at, finished_at, stated_amount, fraud_at").eq("id", id).single(),
    admin.from("case_event").select(`
      id, at, actor, kind, fault:data->>fault, source:data->>source, lang:data->>lang,
      level:data->>level, reason:data->>reason, result:data->>result,
      card_back:data->>card_back, cash_received:data->>cash_received, intent:data->>intent,
      state:data->>state, eta:data->>eta, choice:data->>choice, recipient:data->>recipient,
      from:data->>from, to:data->>to, rating:data->>rating, notice:data->>notice,
      flag:data->>flag, on:data->>on, amount:data->>amount, status:data->>status, due:data->>due,
      target_s:data->>target_s, claim_s:data->>claim_s, first_reply_s:data->>first_reply_s,
      guard_arrival_s:data->>guard_arrival_s, total_s:data->>total_s,
      company:data->>company, promise_kind:data->>kind, minutes:data->>minutes`).eq("incident", id).order("id"),
    admin.from("reply").select("intent, sent_at").eq("incident", id).order("sent_at"),
    admin.from("field_job").select("state, eta").eq("incident", id).maybeSingle(),
    admin.from("caller_card").select("choice, teachback_result, rating, flags, bank_status, bank_due").eq("id", id).maybeSingle(),
  ]);
  if (!d) return null;
  const { data: st } = await admin.from("station").select("label, branch, security_company").eq("id", d.station).maybeSingle();
  const atm = packOfFault(d.fault) === "atm";
  const status = d.abandoned ? DESK.abandonedChip : d.finished_at ? STAFF_JA.status[d.status as Status] : `${D.open}・${STAFF_JA.status[d.status as Status]}`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10 print:py-0">
      <header className="flex items-start justify-between gap-4 border-b pb-6">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[15px] text-foreground"><Mark />Ichido</span>
          <h1 className="text-[28px] leading-tight">{D.title}</h1>
          <span className="text-[13px]">{atm ? D.subtitle : `${PACKS[packOfFault(d.fault)].name.staff}・${D.subtitle.replace(/^ATM障害対応/, "対応")}`}</span>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="text-[15px] text-foreground">{D.to(HANDOFF.recipient[h.recipient])}</span>
          <span className="mono text-muted-foreground">{D.caseId} {id.slice(0, 8)}</span>
          <PrintButton label={D.print} />
        </div>
      </header>

      <Grid rows={[
        [atm ? D.station : PACKS[packOfFault(d.fault)].place, `${(st?.label as L10n | undefined)?.ja ?? d.station}（${d.station}）`],
        [D.branch, (st?.branch as L10n | undefined)?.ja ?? D.none],
        [D.fault, isFault(d.fault) ? STAFF_JA.fault[d.fault] : DESK.unknownFault],
        [D.source, DESK.source[d.source] ?? d.source],
        [D.opened, at(d.created_at)],
        [D.closed, at(d.finished_at)],
        [D.status, status],
        ...(d.fraud_at ? [[OPS.fraud.handoff, at(d.fraud_at)] as [string, string]] : []),
        [D.lang, d.lang ? LANG_NAME[d.lang as Lang] : D.none],
      ]} />

      <Section title={D.confirmed}>
        {d.confirmed_rev == null ? <p className="text-[14px]">{D.none}</p> : atm && (
          <ul className="flex flex-col gap-1 text-[15px] text-foreground">
            <li>{FACT_STAFF.card_back[d.card_back as Fact]}</li>
            <li>{FACT_STAFF.cash_received[d.cash_received as Fact]}</li>
          </ul>
        )}
        {/* Typed by the operator from what the caller said on the handset, never from the caller's phone. */}
        {d.stated_amount != null && <p className="text-[15px] text-foreground">{FAULT_DESK.amount}：{FAULT_DESK.yen(d.stated_amount)}</p>}
        {card?.flags?.length ? (
          <ul className="flex flex-col gap-1 text-[14px] text-foreground">
            {card.flags.map((f: string) => <li key={f}>{CALLER_FLAGS[f]?.staff ?? f}</li>)}
          </ul>
        ) : null}
      </Section>

      <Section title={D.decisions}>
        <Grid rows={[
          [D.replies, replies?.length ? replies.map((r) => `${replyOf(r.intent)?.code ?? ""} ${replyOf(r.intent)?.title ?? r.intent}（${at(r.sent_at)}）`).join("\n") : D.none],
          ...(atm ? [[D.release, d.remote_release ? REMOTE_RELEASE[d.remote_release] : DESK.releaseNone] as [string, string]] : []),
          [D.guard, job ? `${atm ? OPS.dispatch.chain(st?.security_company ?? "").join(" → ") : st?.security_company ?? ""}・${(packStaffField(packOfFault(d.fault)) ?? STAFF_JA.field)[job.state as FieldState]}${job.eta ? `・${DESK.dispatch.eta(job.eta)}` : ""}` : D.none],
          [D.choice, card?.choice ? DESK.choiceText[card.choice] : D.none],
          [D.outcome, card?.teachback_result === "understood" ? STATUS.guided.ja : card?.teachback_result ? DESK.teach.clarify : D.none],
          [D.rating, card?.rating ? RATING[card.rating].ja : D.none],
          ...(atm ? [[FAULT_DESK.bank, card?.bank_status ? bankStatusStaff(card.bank_status, card.bank_due) : FAULT_DESK.bankNone] as [string, string]] : []),
        ]} />
      </Section>

      {d.finished_at && d.status === "guided" && (
        <Section title={D.summary}>
          <p className="text-[15px] leading-7 text-foreground">{summaryDraft({ card_back: d.card_back as Fact, cash_received: d.cash_received as Fact, remote_release: d.remote_release, dispatched: Boolean(job), choice: card?.choice ?? null, fault: d.fault, flags: card?.flags ?? [] })}</p>
        </Section>
      )}

      <Section title={D.timeline}>
        <ol className="flex flex-col">
          {/* Staff names never reach the recipient: assignee, operator and the previous holder of a takeover are shown as roles. */}
          {(events ?? []).map(({ id: eventId, at: time, actor, kind, promise_kind, ...details }) => (
            <li key={eventId} className="grid grid-cols-[132px_72px_minmax(0,1fr)] gap-x-3 border-t py-1.5 text-[13px]">
              <span className="mono text-muted-foreground">{at(time)}</span>
              <span className="text-muted-foreground">{ACTOR[actor]}</span>
              <span className="text-foreground">{eventText(kind, { ...details, kind: promise_kind, assignee: ACTOR.field, operator: ACTOR.operator, ...(kind === "takeover" && { from: ACTOR.operator }) }, d.fault)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <footer className="border-t pt-4 text-[12px] leading-5 text-muted-foreground">{D.footer(at(h.expires_at))}</footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="flex flex-col gap-3"><h2 className="text-[13px] tracking-normal text-muted-foreground">{title}</h2>{children}</section>;
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="whitespace-pre-line text-foreground">{v}</dd></div>)}
    </dl>
  );
}
