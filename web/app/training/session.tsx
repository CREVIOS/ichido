"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { sb, cmd } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Big, Chip, Dot, Fact, Notice, Panel } from "@/components/kit";
import { Pill, SegBar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { DESK, DEVICE_FAULT, FACTS, FAULTS, LANG_NAME, REPLIES, SLA, staffError, type Fact as FactValue, type Lang } from "@/content/catalogue";
import { TRAINING, TRAINING_SLOTS, feedback, type Scenario, type ScoreItem } from "@/content/training";
import { DispatchCard, ReplyCard } from "@/app/operator/actions";
import { hhmm, type Reply, type Run } from "@/app/operator/types";

export type SessionRow = {
  id: string; scenario: string; lang: Lang; card_back: FactValue; cash_received: FactValue; confirmed_at: string | null;
  needs_human: boolean; dispatched: boolean; first_reply_at: string | null; started_at: string; finished_at: string | null;
  score: ScoreItem[] | null; points: number | null; max_points: number | null;
};
type TurnRow = { id: number; who: "caller" | "operator" | "system"; kind: string; text: string | null; ja: string | null; data: Record<string, string>; at: string };

export const percent = (s: SessionRow) => (s.max_points ? Math.round(((s.points ?? 0) / s.max_points) * 100) : 0);
const seconds = (a: string, b: number) => Math.round((b - Date.parse(a)) / 1000);
// The real console's commands, mapped onto the training session.
const TRAINING_CMD: Record<string, string> = { send: "training_reply", assign: "training_dispatch" };

function useTurns(id: string) {
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const load = useCallback(async () => {
    const { data, error } = await sb().from("training_turn").select("*").eq("session", id).order("id");
    if (error) toast.error(staffError("server")); else setTurns(data as TurnRow[]);
  }, [id]);
  useEffect(() => { queueMicrotask(load); }, [load]);
  return { turns, load };
}

// A per-second clock while the first-reply target is running.
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function SessionView({ s, sc, onChange, onAgain, onBack }: { s: SessionRow; sc: Scenario; onChange: () => Promise<void>; onAgain: () => void; onBack: () => void }) {
  const { turns, load } = useTurns(s.id);
  const [busy, setBusy] = useState(false);
  const act = useCallback(async (name: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      return await cmd<object>(name, { ...body, session: s.id });
    } catch (e) {
      toast.error(staffError((e as Error).message));
      return undefined;
    } finally {
      await Promise.all([onChange(), load()]);
      setBusy(false);
    }
  }, [s.id, onChange, load]);
  const run: Run = useCallback((name, body = {}) => act(TRAINING_CMD[name] ?? name, name === "send" ? { intent: body.intent } : {}), [act]);

  if (s.finished_at) return <Debrief s={s} sc={sc} turns={turns} onAgain={onAgain} onBack={onBack} />;
  const replies: Reply[] = turns.filter((t) => t.kind === "reply").map((t) => ({ id: String(t.id), intent: t.data.intent, slots: TRAINING_SLOTS, sent_at: t.at }));

  return (
    <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8 p-5 lg:p-8">
        <Header s={s} sc={sc} />
        <Notice tone="info">{TRAINING.isolated}</Notice>
        <Panel title={TRAINING.persona}><p className="max-w-2xl text-[14px] leading-6 text-foreground">{sc.persona}</p></Panel>
        <Panel title={TRAINING.convo} action={s.needs_human ? <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground"><Dot s="alert" />{TRAINING.wantsHuman}</span> : undefined}>
          <Transcript turns={turns} lang={s.lang} />
          <Composer busy={busy} onSay={async (text) => Boolean(await act("training_say", { text }))} />
        </Panel>
        {s.confirmed_at && (
          <Panel title={DESK.confirmed}>
            <div className="surface flex flex-col gap-2 p-4">
              <span className="text-[15px] text-foreground">{FACTS.card_back[s.card_back].ja}</span>
              <span className="text-[15px] text-foreground">{FACTS.cash_received[s.cash_received].ja}</span>
            </div>
          </Panel>
        )}
      </div>
      <aside className="flex flex-col gap-8 border-t p-5 lg:p-8 xl:border-t-0 xl:border-l">
        <Panel title={TRAINING.readback.title} action={s.confirmed_at ? <Pill tone="guided">{TRAINING.readback.done}</Pill> : undefined}>
          <p className="text-[14px] leading-6">{TRAINING.readback.body}</p>
          {!s.confirmed_at && <Button disabled={busy} onClick={() => act("training_readback")}>{TRAINING.readback.ask}</Button>}
        </Panel>
        <ReplyCard practice d={{ id: s.id, confirmed_rev: s.confirmed_at ? 1 : null, card_back: s.card_back, remote_release: null }}
          lang={s.lang} replies={replies} run={run} bundleTo={s.dispatched ? undefined : TRAINING.guard} />
        <Separator />
        <DispatchCard d={{ id: s.id }} job={s.dispatched ? { assignee: TRAINING.guard.uid, state: "requested", eta: null } : null}
          guards={[TRAINING.guard]} card={s.dispatched ? { field_state: "requested" } : null} lang={s.lang} run={run} />
        <Separator />
        <Panel title={TRAINING.debrief}>
          <p className="text-[14px] leading-6">{TRAINING.endNote}</p>
          <Button size="lg" disabled={busy} onClick={() => act("training_end").then(() => window.scrollTo({ top: 0 }))}>{TRAINING.end}</Button>
        </Panel>
      </aside>
    </div>
  );
}

function Header({ s, sc }: { s: SessionRow; sc: Scenario }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2"><Pill tone="review">{TRAINING.practice}</Pill><Chip>{TRAINING.lang[s.lang]}</Chip></span>
        <span className="text-[24px] leading-tight tracking-[-0.03em] text-foreground">{sc.title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Fact label={DESK.facts.fault} value={FAULTS[DEVICE_FAULT].ja} />
        <Fact label={TRAINING.language} value={LANG_NAME[s.lang]} />
        <Fact label={TRAINING.started} value={<span className="num">{hhmm(s.started_at)}</span>} />
        <Fact label={TRAINING.timer} value={<Timer s={s} />} />
      </div>
    </div>
  );
}

// Time to first reply against the same target the real queue uses.
function Timer({ s }: { s: SessionRow }) {
  const now = useNow(!s.first_reply_at);
  if (s.first_reply_at) return <span className="num">{TRAINING.replied(seconds(s.started_at, Date.parse(s.first_reply_at)))}</span>;
  const left = SLA.firstReplyS - seconds(s.started_at, now);
  const tone = left < 0 ? "text-alert" : left < SLA.firstReplyS * (1 - SLA.warn) ? "text-warn" : "";
  return <span className={cn("num", tone)}>{left < 0 ? SLA.late(Math.ceil(-left / 60)) : SLA.left(left)}</span>;
}

function Transcript({ turns, lang }: { turns: TurnRow[]; lang: Lang }) {
  return <ol className="flex flex-col gap-3">{turns.map((t) => <li key={t.id} className="flex flex-col"><Turn t={t} lang={lang} /></li>)}</ol>;
}

function Turn({ t, lang }: { t: TurnRow; lang: Lang }) {
  const at = <span className="num">{hhmm(t.at)}</span>;
  if (t.kind === "withheld") return <Notice tone="warn">{t.who === "caller" ? TRAINING.withheldCaller : TRAINING.withheldOperator}</Notice>;
  if (t.kind === "dispatch") return <span className="flex items-center gap-2 text-[13px] text-muted-foreground"><Dot s="field" />{TRAINING.dispatchTurn}　{at}</span>;
  if (t.who === "operator") {
    const r = t.kind === "reply" ? REPLIES[t.data.intent] : undefined;
    return (
      <div className="ml-auto flex max-w-[85%] flex-col gap-1.5 rounded-xl bg-secondary p-3.5">
        <span className="label">{TRAINING.you}{r && ` · ${TRAINING.replyTurn(r.code, r.title)}`} · {at}</span>
        <span lang={r ? lang : "ja"} className="text-[15px] leading-6 text-foreground">{t.text}</span>
        {t.ja && <span className="text-[13px] leading-5">{t.ja}</span>}
      </div>
    );
  }
  return (
    <div className={cn("surface flex max-w-[85%] flex-col gap-1.5 p-3.5", t.who === "system" && "border-[oklch(0.8_0.07_255)]")}>
      <span className="label inline-flex items-center gap-1.5">
        {t.who === "system" ? TRAINING.assistant : TRAINING.caller}
        {t.kind === "human" && <><Dot s="alert" />{TRAINING.wantsHuman}</>}
        <span>· {at}</span>
      </span>
      <span lang={lang} className="text-[17px] leading-7 text-foreground">{t.text}</span>
      {t.ja && <span className="flex items-start gap-2 text-[14px]"><Chip className="shrink-0">{TRAINING.gloss[t.data.source] ?? TRAINING.gloss.script}</Chip>{t.ja}</span>}
    </div>
  );
}

function Composer({ busy, onSay }: { busy: boolean; onSay: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim() && (await onSay(text))) setText("");
  }
  return (
    <form className="flex flex-col gap-2 border-t pt-4" onSubmit={submit}>
      <Label htmlFor="say">{TRAINING.sayLabel}</Label>
      <Textarea id="say" value={text} onChange={(e) => setText(e.target.value)} placeholder={TRAINING.sayPlaceholder} maxLength={300} className="bg-card" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted-foreground">{TRAINING.sayNote}</span>
        <Button type="submit" disabled={busy || !text.trim()}>{TRAINING.say}</Button>
      </div>
    </form>
  );
}

// Scorecard: total, each rubric item with its result and plain-Japanese feedback, the model answer and a veteran's tip.
function Debrief({ s, sc, turns, onAgain, onBack }: { s: SessionRow; sc: Scenario; turns: TurnRow[]; onAgain: () => void; onBack: () => void }) {
  const pct = percent(s);
  return (
    <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8 p-5 lg:p-8">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2"><Pill tone={pct >= TRAINING.passPct ? "guided" : "received"}>{TRAINING.debrief}</Pill><Chip>{TRAINING.lang[s.lang]}</Chip></span>
          <span className="text-[24px] leading-tight tracking-[-0.03em] text-foreground">{sc.title}</span>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Big>{TRAINING.percent(pct)}</Big>
          <span className="pb-1.5"><SegBar value={Math.round(pct / 10)} of={10} label={TRAINING.points(s.points ?? 0, s.max_points ?? 0)} /></span>
        </div>
        <Panel title={TRAINING.rubricItems}>
          <ul className="flex flex-col divide-y border-y">
            {(s.score ?? []).map((it) => (
              <li key={it.key} className="grid gap-2 py-3.5 sm:grid-cols-[180px_120px_minmax(0,1fr)] sm:items-start">
                <span className="text-[14px] text-foreground">{TRAINING.rubric[it.key]}</span>
                <span className="flex flex-col gap-2">
                  <Pill tone={TRAINING.tone[it.result]} className="self-start">{TRAINING.result[it.result]}</Pill>
                  <SegBar value={it.points} of={it.max} label={`${it.points}/${it.max}`} />
                </span>
                <span className="text-[14px] leading-6">{feedback(it, sc)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={TRAINING.transcript}><Transcript turns={turns} lang={s.lang} /></Panel>
      </div>
      <aside className="flex flex-col gap-8 border-t p-5 lg:p-8 xl:border-t-0 xl:border-l">
        <Panel title={TRAINING.truth}>
          <div className="surface flex flex-col gap-2 p-4 text-[14px] text-foreground">
            <span>{FACTS.card_back[sc.facts.card_back].ja}</span>
            <span>{FACTS.cash_received[sc.facts.cash_received].ja}</span>
            <span>{sc.dispatch ? TRAINING.dispatchYes : TRAINING.dispatchNo}</span>
          </div>
        </Panel>
        <Panel title={TRAINING.model}>
          <div className="flex flex-col gap-1">
            {sc.intents.map((k) => <span key={k} className="flex items-start gap-3 text-[14px] text-foreground"><span className="mono mt-0.5 w-7 shrink-0 text-muted-foreground">{REPLIES[k].code}</span>{REPLIES[k].title}</span>)}
          </div>
          <p className="text-[14px] leading-6">{sc.model}</p>
        </Panel>
        <Panel title={TRAINING.tip}><p className="inset p-3.5 text-[14px] leading-6 text-foreground">{sc.tip}</p></Panel>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onAgain}>{TRAINING.again}</Button>
          <Button variant="secondary" onClick={onBack}>{TRAINING.back}</Button>
        </div>
      </aside>
    </div>
  );
}
