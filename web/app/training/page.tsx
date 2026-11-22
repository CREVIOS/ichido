"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Chip, Notice, Panel } from "@/components/kit";
import { Pill, SegBar } from "@/components/charts";
import { ScoreLine } from "@/components/insight-charts";
import { Button } from "@/components/ui/button";
import { CASES, staffError } from "@/content/catalogue";
import { SCENARIOS, TRAINING, scenarioOf } from "@/content/training";
import { when } from "@/app/operator/types";
import { SessionView, percent, type SessionRow } from "./session";

const HISTORY = 50;   // sessions in the trend chart
const TABLE = 15;     // rows in the history table
const hashId = () => window.location.hash.slice(1);
const noHash = () => "";
const select = (id: string) => { window.location.hash = id; };
function watchHash(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

export default function TrainingPage() {
  return <StaffGate need="training:use" title={TRAINING.title}>{(me) => <Trainer me={me} />}</StaffGate>;
}

// The operator's own sessions only (row-level security).
function useSessions() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb().from("training_session").select("*").order("started_at", { ascending: false }).limit(HISTORY);
    setFailed(Boolean(error));
    if (!error) setRows(data as SessionRow[]);
  }, []);
  useEffect(() => { queueMicrotask(load); }, [load]);
  return { rows, failed, load };
}

function Trainer({ me }: { me: Me }) {
  const sel = useSyncExternalStore(watchHash, hashId, noHash);
  const { rows, failed, load } = useSessions();
  const [starting, setStarting] = useState<string | null>(null);
  const begin = async (scenario: string) => {
    setStarting(scenario);
    try {
      const r = await cmd<{ session: string }>("training_start", { scenario });
      await load();
      select(r.session);
    } catch (e) {
      toast.error(staffError((e as Error).message));
    } finally {
      setStarting(null);
    }
  };
  const current = sel ? rows?.find((r) => r.id === sel) : undefined;
  const sc = current && scenarioOf(current.scenario);

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} crumb={TRAINING.title} title={sc ? sc.title : TRAINING.scenarios}
      actions={sc && <Button variant="ghost" size="sm" onClick={() => select("")}>{TRAINING.back}</Button>}>
      {failed && <Notice tone="warn">{CASES.loadError}</Notice>}
      {current && sc
        ? <SessionView key={current.id} s={current} sc={sc} onChange={load} onAgain={() => begin(sc.id)} onBack={() => select("")} />
        : <Overview rows={rows ?? []} starting={starting} onStart={begin} />}
    </AppShell>
  );
}

function Overview({ rows, starting, onStart }: { rows: SessionRow[]; starting: string | null; onStart: (id: string) => void }) {
  const done = rows.filter((r) => r.finished_at);
  const best = (id: string) => Math.max(-1, ...done.filter((r) => r.scenario === id).map(percent));
  const trend = [...done].reverse().map((r) => ({ at: when(r.started_at), score: percent(r) }));
  return (
    <div className="flex flex-col gap-8 p-5 lg:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-[26px] leading-tight tracking-[-0.03em]">{TRAINING.title}</h2>
        <p className="max-w-2xl text-[14px] leading-6">{TRAINING.lead}</p>
      </div>
      <Notice tone="info">{TRAINING.isolated}</Notice>
      <Panel title={TRAINING.scenarios}>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="surface flex flex-col gap-3 p-4">
              <span className="flex items-center gap-2">
                <Chip>{TRAINING.lang[s.lang]}</Chip>
                {best(s.id) >= 0 && <Pill tone={best(s.id) >= TRAINING.passPct ? "guided" : "received"}>{TRAINING.percent(best(s.id))}</Pill>}
              </span>
              <span className="text-[16px] leading-6 text-foreground">{s.title}</span>
              <p className="text-[13px] leading-5">{s.persona}</p>
              <span className="flex flex-wrap gap-1">{Object.keys(s.rubric).map((k) => <Chip key={k}>{TRAINING.rubric[k as keyof typeof TRAINING.rubric]}</Chip>)}</span>
              <Button className="mt-auto self-start" disabled={starting != null} onClick={() => onStart(s.id)}>{starting === s.id ? TRAINING.starting : TRAINING.start}</Button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={TRAINING.trend} action={<span className="label">{TRAINING.trendNote}</span>}>
        {trend.length ? <ScoreLine data={trend} label={TRAINING.score} target={TRAINING.passPct} targetLabel={TRAINING.passLine} /> : <Notice>{TRAINING.noHistory}</Notice>}
      </Panel>
      {rows.length > 0 && (
        <Panel title={TRAINING.history}>
          <div className="flex flex-col divide-y border-y">
            <div className="grid grid-cols-[minmax(0,1fr)_130px] sm:grid-cols-[minmax(0,1fr)_110px_150px] gap-3 py-2 text-[12px] text-muted-foreground">
              <span>{TRAINING.head.scenario}</span><span className="hidden sm:inline">{TRAINING.head.date}</span><span>{TRAINING.head.score}</span>
            </div>
            {rows.slice(0, TABLE).map((r) => (
              <button key={r.id} type="button" onClick={() => select(r.id)}
                className="grid grid-cols-[minmax(0,1fr)_130px] sm:grid-cols-[minmax(0,1fr)_110px_150px] items-center gap-3 py-2.5 text-left transition-colors hover:bg-accent">
                <span className="truncate text-[14px] text-foreground">{scenarioOf(r.scenario)?.title ?? r.scenario}</span>
                <span className="num hidden text-[13px] text-muted-foreground sm:inline">{when(r.started_at)}</span>
                {r.finished_at
                  ? <SegBar value={Math.round(percent(r) / 100 * 6)} label={TRAINING.percent(percent(r))} />
                  : <Pill tone="review" className="justify-self-start">{TRAINING.inProgress}</Pill>}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
