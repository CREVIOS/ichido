"use client";
import { useCallback, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import type { Me } from "@/components/StaffGate";
import { Chip, Dot, Fact, MoreMenu, Notice, Panel, StatusLabel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ACCESS_STAFF, ACTOR, BOT, CALLER_FLAGS, DESK, REVIEW, FACT_STAFF, LANG_NAME, OPS, PACKS, PACK_DESK, REMOTE_RELEASE, eventText, isFault, packOfFault, summaryDraft, type Lang, STAFF_JA } from "@/content/catalogue";
import { Pill } from "@/components/charts";
import { DispatchCard, PairCard, ReplyCard } from "./actions";
import { SuggestCard } from "./suggest";
import { HandoffPanel } from "./handoff";
import { BotPanel } from "./bot";
import { BankStatusCard, CallerFlags, FaultCard, UrgentBanner } from "./faults";
import { DeviceCodeCard, TextOnlyBadge, TextOnlyBanner } from "./access";
import { FraudCard, PromiseCard, TakeoverPanel, abusive, opsTags, useAbuseKey, useCompany } from "./ops";
import { hhmm, when, type BotStep, type CallerCard, type CaseEvent, type Desk, type Guard, type Job, type Prepared, type Reply, type Run } from "./types";

type Approval = { reviewer: string; reviewed_at: string; note: string | null };
type BotState = { steps: BotStep[]; escalations: string[]; prepared: Prepared | null; summary: string | null; approval: Approval | null };
const NO_BOT: BotState = { steps: [], escalations: [], prepared: null, summary: null, approval: null };

// True while a caller is connected: paired, and not reset since.
const isPaired = (events: CaseEvent[]) => {
  const last = events.findLastIndex((x) => x.kind === "paired");
  return last >= 0 && !events.slice(last + 1).some((e) => e.kind === "caller_reset");
};

function useCase(id: string) {
  const [card, setCard] = useState<CallerCard | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [bot, setBot] = useState<BotState>(NO_BOT);
  // Staff never read the caller's draft; only what the caller confirmed reaches the desk.
  const load = useCallback(async () => {
    const db = sb();
    const [c, e, r, j, b, x, p, rec, ok] = await Promise.all([
      db.from("caller_card").select("field_state, eta, choice, reply_id, teachback, teachback_ja, teachback_reply, needs_human, notice, flags, bank_status, bank_due").eq("id", id).maybeSingle(),
      db.from("case_event").select("*").eq("incident", id).order("id"),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", id).order("sent_at"),
      db.from("field_job").select("assignee, state, eta, accepted_at, acknowledged_at, declined_at, help_at, provider_at").eq("incident", id).maybeSingle(),
      db.from("bot_step").select("step, status, code, due_at, data, at").eq("incident", id),
      db.from("escalation").select("reason").eq("incident", id),
      db.from("bot_suggestion").select("rev, suggestion").eq("incident", id).maybeSingle(),
      db.from("case_record").select("summary").eq("incident", id).maybeSingle(),
      db.from("review_state").select("reviewer, reviewed_at, note").eq("incident", id).eq("kind", "record").eq("decision", "approved").maybeSingle(),
    ]);
    setCard(c.data as CallerCard); setEvents((e.data ?? []) as CaseEvent[]); setReplies((r.data ?? []) as Reply[]); setJob(j.data as Job);
    setBot({ steps: (b.data ?? []) as BotStep[], escalations: (x.data ?? []).map((row) => row.reason as string), prepared: p.data as Prepared | null, summary: rec.data?.summary ?? null, approval: ok.data as Approval | null });
  }, [id]);
  useLive(["caller_card", "case_event", "reply", "field_job", "bot_step", "bot_suggestion", "case_record", "escalation", "review_state"], load);
  return { card, events, replies, job, bot };
}

export function CaseView({ d, me, run }: { d: Desk; me: Me; run: Run }) {
  const { card, events, replies, job, bot } = useCase(d.id);
  const [work, setWork] = useState<string[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const roster = useCallback(async () => {
    const r = await cmd<{ field: Guard[] }>("staff_list", { incident: d.id }).catch(() => null);
    setGuards(r?.field ?? []);
    const { data } = await sb().rpc("blocked_work_replies", { p_incident: d.id });
    setWork(data ?? []);
  }, [d.id]);
  useLive(["field_job", "staff", "partner_work"], roster);

  const mine = d.operator_id === me.uid;
  const closed = Boolean(d.finished_at);
  const lang: Lang = d.lang ?? "bn";
  const paired = isPaired(events);
  const company = useCompany(d.station);
  const atm = packOfFault(d.fault) === "atm";
  useAbuseKey(d, mine && !closed, run);

  return (
    <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8 p-5 lg:p-8">
        {d.text_only && !closed && <TextOnlyBanner />}
        {!closed && <UrgentBanner flags={card?.flags ?? []} />}
        <CaseHeader d={d} closed={closed} mine={mine} run={run} />
        <CallerWords d={d} card={card} lang={lang} paired={paired} canJudge={!closed && mine} run={run} />
        <BotPanel steps={bot.steps} escalations={bot.escalations} />
        <CallerFlags flags={card?.flags ?? []} />
        <Timeline events={events} fault={d.fault} />
        {d.operator_id && <HandoffPanel key={d.id} d={d} uid={me.uid} />}
        {d.operator_id && atm && <BankStatusCard incident={d.id} card={card} run={run} />}
        {closed && d.status === "guided" && (
          <Panel title={DESK.record} action={<Chip>{bot.approval ? REVIEW.record.approved(bot.approval.reviewer, when(bot.approval.reviewed_at)) : bot.summary ? BOT.recordBy : DESK.recordDraft}</Chip>}>
            <p className="text-[14px] leading-6 text-foreground">{bot.summary ?? summaryDraft({ card_back: d.card_back, cash_received: d.cash_received, remote_release: d.remote_release, dispatched: Boolean(job), choice: card?.choice ?? null, fault: d.fault, flags: card?.flags })}</p>
            {bot.approval?.note && <p className="inset px-3 py-2 text-[13px] leading-5"><span className="label mr-2">{REVIEW.record.staffNote}</span>{bot.approval.note}</p>}
          </Panel>
        )}
      </div>
      <aside className="flex flex-col gap-8 border-t p-5 lg:p-8 xl:border-t-0 xl:border-l">
        <Actions work={work} d={d} me={me.uid} mine={mine} closed={closed} paired={paired} lang={lang} replies={replies} job={job} guards={guards} card={card} bot={bot} company={company} run={run} />
      </aside>
    </div>
  );
}

function Actions({ work, d, me, mine, closed, paired, lang, replies, job, guards, card, bot, company, run }: {
  work: string[]; d: Desk; me: string; mine: boolean; closed: boolean; paired: boolean; lang: Lang; replies: Reply[]; job: Job | null; guards: Guard[]; card: CallerCard | null; bot: BotState; company: string | null; run: Run;
}) {
  const routed = bot.steps.find((s) => s.step === "route" && s.status === "done")?.data;
  if (closed) return <><Panel title={DESK.closed}><p className="text-[14px]">{d.abandoned ? DESK.closedAbandoned : DESK.closedDone}</p></Panel>{mine && !d.abandoned && job && job.state !== "done" && <DispatchCard d={d} job={job} guards={guards} card={card} lang={lang} run={run} company={company} />}</>;
  if (!d.operator_id) return (
    <Panel title={DESK.unclaimed}>
      <p className="text-[14px]">{DESK.unclaimedBody}</p>
      {routed && <Notice tone="info">{routed.uid === me ? BOT.routedMe : BOT.routed(String(routed.operator))}</Notice>}
      <Button size="lg" onClick={() => run("claim", { incident: d.id })}>{DESK.claim}</Button>
    </Panel>
  );
  if (!mine) return <TakeoverPanel d={d} run={run} title={DESK.otherOperator} body={DESK.otherOperatorBody} />;
  return (
    <>
      {packOfFault(d.fault) === "atm" && <FraudCard d={d} run={run} />}
      {card?.notice === "guidance_changed" && <Notice>{OPS.fraud.replacement}</Notice>}
      {!paired && (d.text_only ? <DeviceCodeCard incident={d.id} station={d.station} /> : <PairCard incident={d.id} />)}
      <SuggestCard d={d} run={run} prepared={bot.prepared} step={bot.steps.find((s) => s.step === "prepare")} />
      <FaultCard d={d} flags={card?.flags ?? []} run={run} />
      <ReplyCard work={work} d={d} lang={lang} replies={replies} run={run} flags={card?.flags ?? []} />
      <Separator />
      <DispatchCard d={d} job={job} guards={guards} card={card} lang={lang} run={run} company={company} />
      <Separator />
      <PromiseCard d={d} run={run} />
    </>
  );
}

function CaseHeader({ d, closed, mine, run }: { d: Desk; closed: boolean; mine: boolean; run: Run }) {
  const pack = packOfFault(d.fault);
  const atm = pack === "atm";
  const menu = !closed && mine ? [
    ...(d.remote_release !== "released" && atm ? Object.keys(DESK.recordRelease).map((result) => ({ label: DESK.recordRelease[result], onClick: () => run("remote_release", { incident: d.id, result }) })) : []),
    { label: DESK.resetCaller, onClick: () => run("reset_caller", { incident: d.id }) },
    { label: OPS.abusive.mark, onClick: () => abusive(d.id, run), disabled: Boolean(d.abusive_at) },
    { label: DESK.abandon, onClick: () => run("abandon", { incident: d.id }), danger: true },
  ] : [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[24px] leading-tight tracking-[-0.03em] text-foreground">{isFault(d.fault) ? STAFF_JA.fault[d.fault] : DESK.unknownFault}</span>
          <span className="flex flex-wrap items-center gap-2">{d.abandoned ? <span className="inline-flex items-center gap-1.5 text-[13px]"><Dot s="alert" />{DESK.abandonedChip}</span> : <StatusLabel status={d.status} />}{d.text_only && <TextOnlyBadge />}{opsTags(d) && <Pill tone="alert">{opsTags(d)}</Pill>}</span>
        </div>
        <MoreMenu label={DESK.caseMenu} items={menu} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
        <Fact label={PACKS[pack].place} value={<span className="mono">{d.station}</span>} />
        {atm ? <Fact label={DESK.facts.release} value={d.remote_release ? REMOTE_RELEASE[d.remote_release] : DESK.releaseNone} /> : <Fact label={PACK_DESK.pack} value={PACKS[pack].name.staff} />}
        <Fact label={DESK.facts.source} value={DESK.source[d.source] ?? ACCESS_STAFF.source[d.source] ?? d.source} />
        <Fact label={DESK.facts.at} value={<span className="num">{hhmm(d.created_at)}</span>} />
        {d.lang && <Fact label={DESK.pair.title} value={LANG_NAME[d.lang]} />}
      </div>
    </div>
  );
}

function CallerWords({ d, card, lang, paired, canJudge, run }: { d: Desk; card: CallerCard | null; lang: Lang; paired: boolean; canJudge: boolean; run: Run }) {
  return (
    <Panel title={DESK.callerWords} action={card?.needs_human ? <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground"><Dot s="alert" />{DESK.wantsHuman}</span> : undefined}>
      {d.confirmed_rev == null ? (
        <Notice>{paired ? DESK.awaitingConfirm : DESK.notPaired}{d.clarifying ? ` ${DESK.clarifying}` : ""}</Notice>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="surface flex flex-col gap-2 p-4">
            <span className="label">{DESK.original(LANG_NAME[lang])}</span>
            <span lang={lang} className="text-[17px] leading-7 text-foreground">{d.caller_words ?? DESK.choiceOnly}</span>
            {d.caller_words && lang !== "ja" && (d.caller_words_ja
              ? <span className="flex items-start gap-2 text-[14px] leading-6"><Chip className="shrink-0">{DESK.teach.mt}</Chip>{d.caller_words_ja}</span>
              : <span className="text-[12px] text-muted-foreground">{DESK.teach.noMt(LANG_NAME[lang])}</span>)}
          </div>
          <div className="surface flex flex-col gap-2 p-4">
            <span className="flex justify-between"><span className="label">{DESK.confirmed}</span><span className="label num">{DESK.rev(d.confirmed_rev)}</span></span>
            {packOfFault(d.fault) === "atm" ? <><span className="text-[15px] text-foreground">{FACT_STAFF.card_back[d.card_back]}</span>
            <span className="text-[15px] text-foreground">{FACT_STAFF.cash_received[d.cash_received]}</span></>
              : (card?.flags ?? []).map((f) => <span key={f} className="text-[15px] text-foreground">{CALLER_FLAGS[f]?.staff ?? f}</span>)}
          </div>
        </div>
      )}
      {d.confirmed_rev != null && d.triage && <TriageNote d={d} flags={card?.flags ?? []} />}
      {card?.choice && <span className="text-[14px]">{DESK.choice}：<span className="text-foreground">{DESK.choiceText[card.choice]}</span></span>}
      {card?.teachback && <TeachBack card={card} lang={lang} canJudge={canJudge} onJudge={(result) => run("outcome", { incident: d.id, reply: card.teachback_reply, result })} />}
    </Panel>
  );
}

// What the intake model suggested, labelled as the AI's: the caller's own taps stay the facts.
function TriageNote({ d, flags }: { d: Desk; flags: string[] }) {
  const t = d.triage!;
  const unconfirmed = t.taps.filter((f) => !flags.includes(f));
  return (
    <div className="inset flex flex-col gap-1.5 px-3 py-2.5 text-[13px] leading-5">
      <span className="flex items-center gap-2"><Chip className="shrink-0">AI</Chip><span className="label">{DESK.triage.title}</span>{t.model && <span className="mono text-faint">{t.model}</span>}</span>
      {t.situation && <span className="text-foreground">{DESK.triage.situation(STAFF_JA.fault[t.situation] ?? t.situation)}</span>}
      {unconfirmed.length > 0 && <span>{DESK.triage.taps}：{unconfirmed.map((f) => CALLER_FLAGS[f]?.staff ?? f).join("、")}</span>}
      {t.ask.length > 0 && <span>{DESK.triage.asked}：{t.ask.map((f) => CALLER_FLAGS[f]?.staff ?? f).join("、")}</span>}
      <span className="text-muted-foreground">{DESK.triage.note}</span>
    </div>
  );
}

// The operator cannot read Bengali, so the judgement rests on a labelled machine translation, or on a bilingual colleague.
function TeachBack({ card, lang, canJudge, onJudge }: { card: CallerCard; lang: Lang; canJudge: boolean; onJudge: (r: "understood" | "clarify") => void }) {
  const current = card.teachback_reply === card.reply_id;
  return (
    <div className="surface flex flex-col gap-2.5 p-4">
      <span className="label">{DESK.teach.title}</span>
      <span lang={lang} className="text-[17px] leading-7 text-foreground">{card.teachback}</span>
      {lang !== "ja" && (card.teachback_ja
        ? <span className="flex items-start gap-2 text-[14px] text-foreground"><Chip className="shrink-0">{DESK.teach.mt}</Chip>{card.teachback_ja}</span>
        : <Notice tone="warn">{DESK.teach.noMt(LANG_NAME[lang])}</Notice>)}
      {!current && <span className="text-[13px] text-muted-foreground">{DESK.teach.stale}</span>}
      {canJudge && current && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => onJudge("understood")}>{DESK.teach.understood}</Button>
          <Button variant="secondary" onClick={() => onJudge("clarify")}>{DESK.teach.clarify}</Button>
        </div>
      )}
    </div>
  );
}

function Timeline({ events, fault }: { events: CaseEvent[]; fault: string }) {
  return (
    <Panel title={DESK.timeline}>
      <ol className="relative flex flex-col">
        {events.map((e) => (
          <li key={e.id} className="grid grid-cols-[44px_14px_minmax(0,1fr)] items-baseline gap-x-2 py-1.5">
            <span className="mono text-muted-foreground">{hhmm(e.at)}</span>
            <span className="relative top-[-1px] size-1.5 rounded-full bg-foreground/25" aria-hidden />
            <span className="text-[14px] leading-6"><span className="text-muted-foreground">{e.actor_name ?? ACTOR[e.actor]}</span>　<span className="text-foreground">{eventText(e.kind, e.data, fault)}</span></span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
