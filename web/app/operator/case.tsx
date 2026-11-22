"use client";
import { useCallback, useEffect, useState } from "react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import type { Me } from "@/components/StaffGate";
import { Chip, Dot, Fact, MoreMenu, Notice, Panel, StatusLabel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ACTOR, DESK, FACTS, FAULTS, LANG_NAME, REMOTE_RELEASE, eventText, isFault, summaryDraft, type Lang } from "@/content/catalogue";
import { DispatchCard, PairCard, ReplyCard } from "./actions";
import { hhmm, type CallerCard, type CaseEvent, type Desk, type Guard, type Job, type Reply, type Run } from "./types";

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
  // Staff never read the caller's draft; only what the caller confirmed reaches the desk.
  const load = useCallback(async () => {
    const db = sb();
    const [c, e, r, j] = await Promise.all([
      db.from("caller_card").select("field_state, eta, choice, reply_id, teachback, teachback_ja, teachback_reply, needs_human").eq("id", id).maybeSingle(),
      db.from("case_event").select("*").eq("incident", id).order("id"),
      db.from("reply").select("id, intent, slots, sent_at").eq("incident", id).order("sent_at"),
      db.from("field_job").select("assignee, state, eta").eq("incident", id).maybeSingle(),
    ]);
    setCard(c.data as CallerCard); setEvents((e.data ?? []) as CaseEvent[]); setReplies((r.data ?? []) as Reply[]); setJob(j.data as Job);
  }, [id]);
  useLive(["caller_card", "case_event", "reply", "field_job"], load);
  return { card, events, replies, job };
}

export function CaseView({ d, me, run }: { d: Desk; me: Me; run: Run }) {
  const { card, events, replies, job } = useCase(d.id);
  const [guards, setGuards] = useState<Guard[]>([]);
  useEffect(() => { cmd<{ field: Guard[] }>("staff_list").then((r) => setGuards(r.field)).catch(() => setGuards([])); }, []);

  const mine = d.operator_id === me.uid;
  const closed = Boolean(d.finished_at);
  const lang: Lang = d.lang ?? "bn";
  const paired = isPaired(events);

  return (
    <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8 p-5 lg:p-8">
        <CaseHeader d={d} closed={closed} mine={mine} run={run} />
        <CallerWords d={d} card={card} lang={lang} paired={paired} canJudge={!closed && mine} run={run} />
        <Timeline events={events} />
        {closed && d.status === "guided" && (
          <Panel title={DESK.record} action={<Chip>{DESK.recordDraft}</Chip>}>
            <p className="text-[14px] leading-6 text-foreground">{summaryDraft({ card_back: d.card_back, cash_received: d.cash_received, remote_release: d.remote_release, dispatched: Boolean(job), choice: card?.choice ?? null })}</p>
          </Panel>
        )}
      </div>
      <aside className="flex flex-col gap-8 border-t p-5 lg:p-8 xl:border-t-0 xl:border-l">
        <Actions d={d} mine={mine} closed={closed} paired={paired} lang={lang} replies={replies} job={job} guards={guards} card={card} run={run} />
      </aside>
    </div>
  );
}

function Actions({ d, mine, closed, paired, lang, replies, job, guards, card, run }: {
  d: Desk; mine: boolean; closed: boolean; paired: boolean; lang: Lang; replies: Reply[]; job: Job | null; guards: Guard[]; card: CallerCard | null; run: Run;
}) {
  if (closed) return <Panel title={DESK.closed}><p className="text-[14px]">{d.abandoned ? DESK.closedAbandoned : DESK.closedDone}</p></Panel>;
  if (!d.operator_id) return (
    <Panel title={DESK.unclaimed}>
      <p className="text-[14px]">{DESK.unclaimedBody}</p>
      <Button size="lg" onClick={() => run("claim", { incident: d.id })}>{DESK.claim}</Button>
    </Panel>
  );
  if (!mine) return <Panel title={DESK.otherOperator}><p className="text-[14px]">{DESK.otherOperatorBody}</p></Panel>;
  return (
    <>
      {!paired && <PairCard incident={d.id} />}
      <ReplyCard d={d} lang={lang} replies={replies} run={run} bundleTo={job ? undefined : guards[0]} />
      <Separator />
      <DispatchCard d={d} job={job} guards={guards} card={card} lang={lang} run={run} />
    </>
  );
}

function CaseHeader({ d, closed, mine, run }: { d: Desk; closed: boolean; mine: boolean; run: Run }) {
  const menu = !closed && mine ? [
    ...(!d.remote_release ? Object.keys(DESK.recordRelease).map((result) => ({ label: DESK.recordRelease[result], onClick: () => run("remote_release", { incident: d.id, result }) })) : []),
    { label: DESK.resetCaller, onClick: () => run("reset_caller", { incident: d.id }) },
    { label: DESK.abandon, onClick: () => run("abandon", { incident: d.id }), danger: true },
  ] : [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[24px] leading-tight tracking-[-0.03em] text-foreground">{isFault(d.fault) ? FAULTS[d.fault].ja : DESK.unknownFault}</span>
          {d.abandoned ? <span className="inline-flex items-center gap-1.5 text-[13px]"><Dot s="alert" />{DESK.abandonedChip}</span> : <StatusLabel status={d.status} />}
        </div>
        <MoreMenu label={DESK.caseMenu} items={menu} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
        <Fact label={DESK.facts.atm} value={<span className="mono">{d.station}</span>} />
        <Fact label={DESK.facts.release} value={d.remote_release ? REMOTE_RELEASE[d.remote_release] : DESK.releaseNone} />
        <Fact label={DESK.facts.source} value={DESK.source[d.source] ?? d.source} />
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
          </div>
          <div className="surface flex flex-col gap-2 p-4">
            <span className="flex justify-between"><span className="label">{DESK.confirmed}</span><span className="label num">{DESK.rev(d.confirmed_rev)}</span></span>
            <span className="text-[15px] text-foreground">{FACTS.card_back[d.card_back].ja}</span>
            <span className="text-[15px] text-foreground">{FACTS.cash_received[d.cash_received].ja}</span>
          </div>
        </div>
      )}
      {card?.choice && <span className="text-[14px]">{DESK.choice}：<span className="text-foreground">{DESK.choiceText[card.choice]}</span></span>}
      {card?.teachback && <TeachBack card={card} lang={lang} canJudge={canJudge} onJudge={(result) => run("outcome", { incident: d.id, reply: card.teachback_reply, result })} />}
    </Panel>
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

function Timeline({ events }: { events: CaseEvent[] }) {
  return (
    <Panel title={DESK.timeline}>
      <ol className="relative flex flex-col">
        {events.map((e) => (
          <li key={e.id} className="grid grid-cols-[44px_14px_minmax(0,1fr)] items-baseline gap-x-2 py-1.5">
            <span className="mono text-muted-foreground">{hhmm(e.at)}</span>
            <span className="relative top-[-1px] size-1.5 rounded-full bg-foreground/25" aria-hidden />
            <span className="text-[14px] leading-6"><span className="text-muted-foreground">{e.actor_name ?? ACTOR[e.actor]}</span>　<span className="text-foreground">{eventText(e.kind, e.data)}</span></span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
