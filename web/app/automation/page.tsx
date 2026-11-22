"use client";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BellRing, Check, Clock, FileCheck2, Play, Route, Shuffle, Sparkles, X, type LucideIcon } from "lucide-react";
import { sb, cmd } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Notice } from "@/components/kit";
import { PaneButton, PaneLabel, TitleBar } from "@/components/pane";
import { Pill, SegBar } from "@/components/charts";
import { cn } from "@/lib/utils";
import { BOT, CASES, DESK, REVIEW, SEQUENCE, SLA, STAFF_JA, isFault, staffError, type L10n } from "@/content/catalogue";
import { hhmm, when, type BotStep } from "../operator/types";

type Run = { id: string; station: string; fault: string; source: string; created_at: string; bot_step: BotStep[] };
type Done = {
  incident: string; claim_s: number | null; first_reply_s: number | null; guard_arrival_s: number | null; total_s: number; at: string;
  desk: { station: string; fault: string; source: string; abandoned: boolean };
};
type Stats = { runs: number; routed: number; prepared: number; reminded: number; recorded: number; first_reply_s: number | null; reply_target_s: number | null };
type Data = { runs: Run[]; done: Done[]; stats: Stats | null; labels: Record<string, string>; targets: Record<string, number> };
type Tab = "overview" | "running" | "history" | "test";
const TABS: Tab[] = ["overview", "running", "history", "test"];
const STEP_ICON: Record<string, LucideIcon> = { route: Route, prepare: Sparkles, remind: BellRing, record: FileCheck2 };
const DAYS = 30;

// The step a case's workflow is waiting on now. A guard reminder without a due time waits for a dispatch that may never come.
function current(steps: BotStep[]) {
  const by = new Map(steps.map((s) => [s.step, s]));
  return BOT.order.map((k) => by.get(k)).find((s) => s?.status === "waiting" && (s.step !== "remind_guard" || s.due_at));
}
const faultName = (f: string) => (isFault(f) ? STAFF_JA.fault[f] : DESK.unknownFault);

export default function AutomationPage() {
  return <StaffGate allow={["operator"]} title={BOT.automation.title}>{(me) => <Sequence me={me} />}</StaffGate>;
}

// The Ichido Bot workflow as a sequence: what it does, in which order, and how it has done (bot_step, case_record; live).
function Sequence({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const db = sb();
    const [d, h, st, s, t] = await Promise.all([
      db.from("desk").select("id, station, fault, source, created_at, bot_step(step, status, code, due_at, data, at)").is("finished_at", null).order("created_at").abortSignal(signal),
      db.from("case_record").select("incident, claim_s, first_reply_s, guard_arrival_s, total_s, at, desk!inner(station, fault, source, abandoned)").order("at", { ascending: false }).limit(30).abortSignal(signal).overrideTypes<Done[], { merge: false }>(),
      db.rpc("bot_stats", { p_days: DAYS }).abortSignal(signal),
      db.from("station").select("id, label").order("id").abortSignal(signal),
      db.schema("ichido").from("sla_target").select("reason, seconds").abortSignal(signal),
    ]);
    if (signal.aborted) return;
    setFailed(Boolean(d.error || h.error || st.error || s.error || t.error));
    setData({
      runs: ((d.data ?? []) as Run[]).filter((r) => r.bot_step.length),
      done: h.data ?? [],
      stats: st.data as Stats | null,
      labels: Object.fromEntries(((s.data ?? []) as { id: string; label: L10n }[]).map((x) => [x.id, x.label.ja])),
      targets: Object.fromEntries((t.data ?? []).map((x) => [x.reason, x.seconds as number])),
    });
  }, []);
  useLive(["desk", "bot_step", "case_record"], load);

  return (
    <AppShell bare nav={navFor(me.role)} footer={<MeFooter me={me} />} crumb={BOT.name} title={SEQUENCE.name}>
      <div className="flex flex-col bg-pane lg:h-[calc(100dvh-1rem-2px)] lg:overflow-hidden lg:rounded-xl">
        <TitleBar icon={Shuffle} title={SEQUENCE.name} className="overflow-x-auto">
          <nav className="ml-3 flex h-full items-center gap-1.5" role="tablist" aria-label={SEQUENCE.menu}>
            {TABS.map((k) => (
              <PaneButton key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("px-1.5", tab === k ? "bg-black/4 text-foreground" : "text-muted-foreground")}>{SEQUENCE.tabs[k]}</PaneButton>
            ))}
          </nav>
        </TitleBar>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-5 pt-7 pb-10 sm:px-7">
            {failed && <div className="mb-4"><Notice tone="warn">{CASES.loadError}</Notice></div>}
            {data && tab === "overview" && <Overview data={data} />}
            {data && tab === "running" && <Running runs={data.runs} labels={data.labels} />}
            {data && tab === "history" && <History done={data.done} labels={data.labels} />}
            {data && tab === "test" && <Test data={data} />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Overview({ data }: { data: Data }) {
  const s = data.stats;
  const n = (k: keyof Stats) => (s ? Number(s[k] ?? 0) : 0);
  const share = (k: keyof Stats) => SEQUENCE.share(n(k), n("runs"));
  const T = SEQUENCE.tiles;
  const tiles: { value: ReactNode; label: string; side?: string }[] = [
    { value: n("runs"), label: T.runs },
    { value: n("routed"), label: T.routed, side: share("routed") },
    { value: n("prepared"), label: T.prepared, side: share("prepared") },
    { value: n("reminded"), label: T.reminded },
    { value: n("recorded"), label: T.recorded, side: share("recorded") },
    { value: REVIEW.secs(s?.first_reply_s), label: T.reply, side: s?.reply_target_s ? T.target(REVIEW.secs(s.reply_target_s)) : undefined },
  ];
  const done: Record<string, number> = { route: n("routed"), prepare: n("prepared"), remind: n("reminded"), record: n("recorded") };
  const at = (reason: string) => REVIEW.secs(data.targets[reason] == null ? null : data.targets[reason] * SLA.warn);
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[7px] border-[0.5px] border-black/12 bg-card text-foreground"><Shuffle className="size-6 stroke-[1.25]" /></span>
        <h2 className="text-[20px] font-medium tracking-[-0.02em]">{SEQUENCE.name}</h2>
      </div>
      <section className="mt-6">
        <PaneLabel>{SEQUENCE.performance}</PaneLabel>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="flex h-14 min-w-0 flex-col justify-center rounded-[6px] border-[0.5px] border-black/12 bg-card px-3">
              <span className="flex items-baseline justify-between gap-2">
                <span className="num text-[15px] font-medium text-foreground">{t.value}</span>
                {t.side && <span className="num truncate text-[11px] text-foreground">{t.side}</span>}
              </span>
              <span className="truncate text-[11px] text-muted-foreground" title={t.label}>{t.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6">
        <PaneLabel>{SEQUENCE.description}</PaneLabel>
        <p className="text-[14px] leading-[1.6] text-foreground">{SEQUENCE.lead}</p>
        <div className="mt-3 grid gap-3 text-[13px] leading-6 sm:grid-cols-2">
          <Rules title={SEQUENCE.may} items={SEQUENCE.mayList} icon={Check} />
          <Rules title={SEQUENCE.mayNot} items={SEQUENCE.mayNotList} icon={X} />
        </div>
      </section>
      <section className="mt-6">
        <PaneLabel>{SEQUENCE.steps}</PaneLabel>
        <ol>
          {SEQUENCE.sequence.map((step, i) => {
            const Icon = STEP_ICON[step.key];
            return (
              <li key={step.key}>
                <div className="relative flex h-10 items-center gap-2 pl-4 text-[12px] text-muted-foreground">
                  {i > 0 && <span className="absolute top-1 left-6 h-1.5 border-l-[0.5px] border-black/12" aria-hidden />}
                  <span className="absolute bottom-1 left-6 h-1.5 border-l-[0.5px] border-black/12" aria-hidden />
                  <Clock className="relative size-4 stroke-[1.5]" aria-hidden />
                  <span className="truncate">{step.when}{step.key === "remind" && `（${SEQUENCE.targets(at("no_reply"), at("guard_late"))}）`}</span>
                </div>
                <div className="flex h-11 items-center gap-2 rounded-[7px] border-[0.5px] border-black/12 px-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-black/4 text-muted-foreground"><Icon className="size-3.5 stroke-[1.5]" aria-hidden /></span>
                  <span className="shrink-0 text-[13px] font-medium text-foreground">{SEQUENCE.step(i + 1)}</span>
                  <span className="shrink-0 text-[13px] text-foreground">{step.title}</span>
                  <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:inline">{step.body}</span>
                  <span className="num ml-auto shrink-0 text-[11px] text-muted-foreground">{SEQUENCE.doneCount(done[step.key])}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function Rules({ title, items, icon: Icon }: { title: string; items: string[]; icon: LucideIcon }) {
  return (
    <div className="rounded-[7px] border-[0.5px] border-black/12 bg-card px-3 py-2.5">
      <span className="text-[12px] text-muted-foreground">{title}</span>
      <ul className="mt-1 flex flex-col gap-0.5 text-foreground">
        {items.map((x) => <li key={x} className="flex items-start gap-2"><Icon className="mt-1 size-3.5 shrink-0 stroke-[1.5] text-muted-foreground" aria-hidden />{x}</li>)}
      </ul>
    </div>
  );
}

const Rows = ({ children }: { children: ReactNode }) => <ul className="flex flex-col divide-y divide-black/6 rounded-[7px] border-[0.5px] border-black/12 bg-card">{children}</ul>;
const Empty = ({ children }: { children: ReactNode }) => <p className="py-16 text-center text-[13px] text-muted-foreground">{children}</p>;

function Running({ runs, labels }: { runs: Run[]; labels: Record<string, string> }) {
  const R = SEQUENCE.running;
  if (!runs.length) return <Empty>{R.empty}</Empty>;
  return (
    <Rows>
      {runs.map((r) => {
        const now = current(r.bot_step);
        const settled = r.bot_step.filter((s) => s.status !== "waiting").length;
        return (
          <li key={r.id}>
            <Link href={`/operator#${r.id}`} className="grid gap-2 px-3 py-2.5 hover:bg-black/2 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-foreground">{labels[r.station] ?? r.station}</span>
                <span className="truncate text-[12px] text-muted-foreground"><span className="num">{R.started} {hhmm(r.created_at)}</span>　{faultName(r.fault)}</span>
              </span>
              <span className="flex flex-col">
                <span className="text-[11px] text-muted-foreground">{R.current}</span>
                <span className="text-[12px] text-foreground">{now ? BOT.steps[now.step] : R.finished}{now?.due_at ? `・${BOT.due(hhmm(now.due_at))}` : ""}</span>
              </span>
              <span className="flex items-center gap-3">
                <SegBar value={settled} of={BOT.order.length} />
                <Pill tone={now ? "review" : "guided"}>{now ? BOT.status.waiting : BOT.status.done}</Pill>
              </span>
            </Link>
          </li>
        );
      })}
    </Rows>
  );
}

function History({ done, labels }: { done: Done[]; labels: Record<string, string> }) {
  const H = SEQUENCE.history;
  if (!done.length) return <Empty>{H.empty}</Empty>;
  const cols = "grid grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] items-center gap-2 px-3";
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px]">
        <div className={cn(cols, "h-8 text-[11px] text-muted-foreground")}>
          {[H.head.station, H.head.closed, H.head.claim, H.head.reply, H.head.guard, H.head.total].map((h) => <span key={h} className="truncate">{h}</span>)}
        </div>
        <Rows>
          {done.map((r) => (
            <li key={r.incident}>
              <Link href={`/operator#${r.incident}`} className={cn(cols, "num py-2 text-[12px] text-foreground hover:bg-black/2")}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px]">{labels[r.desk.station] ?? r.desk.station}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{r.desk.abandoned ? DESK.abandonedChip : faultName(r.desk.fault)}</span>
                </span>
                <span className="text-muted-foreground">{when(r.at)}</span>
                <span>{REVIEW.secs(r.claim_s)}</span>
                <span>{REVIEW.secs(r.first_reply_s)}</span>
                <span>{REVIEW.secs(r.guard_arrival_s)}</span>
                <span className="font-medium">{REVIEW.secs(r.total_s)}</span>
              </Link>
            </li>
          ))}
        </Rows>
      </div>
    </div>
  );
}

// Runs started from a manually registered fault: the console's own "simulate" command, so a test is a real case.
function Test({ data }: { data: Data }) {
  const X = SEQUENCE.test;
  const start = (station: string) => cmd("simulate", { station })
    .then(() => toast.success(X.started)).catch((e: Error) => toast.error(staffError(e.message)));
  const open = data.runs.filter((r) => r.source === "simulator");
  const closed = data.done.filter((r) => r.desk.source === "simulator");
  return (
    <>
      <p className="text-[14px] leading-[1.6] text-foreground">{X.lead}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(data.labels).map(([id, label]) => (
          <PaneButton key={id} className="h-7 bg-card px-2.5 text-[12px]" onClick={() => start(id)}><Play />{X.start(label)}</PaneButton>
        ))}
      </div>
      <section className="mt-6">
        {open.length + closed.length === 0 ? <Empty>{X.empty}</Empty> : (
          <Rows>
            {[...open.map((r) => ({ id: r.id, station: r.station, at: r.created_at, live: true })),
              ...closed.map((r) => ({ id: r.incident, station: r.desk.station, at: r.at, live: false }))].map((r) => (
              <li key={r.id}>
                <Link href={`/operator#${r.id}`} className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-black/2">
                  <span className="min-w-0 flex-1 truncate text-foreground">{data.labels[r.station] ?? r.station}</span>
                  <span className="num text-[12px] text-muted-foreground">{when(r.at)}</span>
                  <Pill tone={r.live ? "review" : "guided"}>{r.live ? X.open : X.closed}</Pill>
                </Link>
              </li>
            ))}
          </Rows>
        )}
      </section>
    </>
  );
}
