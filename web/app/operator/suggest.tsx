"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { cmd } from "@/lib/supabase";
import { Chip, Notice, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DESK, replyOf, staffError } from "@/content/catalogue";
import type { BotStep, Desk, Prepared, Run, Suggestion } from "./types";

type Step = Suggestion["steps"][number];
type State = { status: "idle" | "loading" | "preparing" | "off" | "failed" } | { status: "ready"; s: Suggestion };

// What the Ichido Bot prepared for the confirmed revision, so the card shows at once without calling Gemini.
function botState(d: Desk, prepared: Prepared | null, step: BotStep | undefined): State {
  if (prepared && prepared.rev === d.confirmed_rev) return { status: "ready", s: prepared.suggestion };
  if (!step || d.confirmed_rev == null) return { status: "idle" };
  if (step.data.rev !== d.confirmed_rev) return { status: "preparing" };
  return { status: step.code === "no_key" ? "off" : step.code === "failed" ? "failed" : "idle" };
}

// Gemini's recommendation for this case: precomputed by the Ichido Bot when the caller confirms, refreshed on request.
// The operator adopts it or ignores it.
export function SuggestCard({ d, run, prepared, step }: { d: Desk; run: Run; prepared: Prepared | null; step?: BotStep }) {
  // A manual refresh belongs to the revision it was asked for; a newer confirmation goes back to the bot's state.
  const [manual, setManual] = useState<{ rev: number | null; state: State } | null>(null);
  const state = manual && manual.rev === d.confirmed_rev ? manual.state : botState(d, prepared, step);
  const ask = () => {
    const rev = d.confirmed_rev;
    setManual({ rev, state: { status: "loading" } });
    cmd<{ suggestion: Suggestion | null }>("suggest", { incident: d.id })
      .then((r) => setManual({ rev, state: r.suggestion ? { status: "ready", s: r.suggestion } : { status: "off" } }))
      .catch((e: Error) => { setManual({ rev, state: { status: "failed" } }); if (e.message !== "server") toast.error(staffError(e.message)); });
  };

  const adopt = async (s: Suggestion) => {
    if (!s.intent || !(await run("send", { incident: d.id, intent: s.intent }))) return;
    if (s.dispatch && s.guard) await run("assign", { incident: d.id, assignee: s.guard.uid });
    toast.success(s.dispatch && s.guard ? DESK.reply.bundleToast(s.guard.name) : DESK.reply.toast);
  };

  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 stroke-[1.5]" />{DESK.ai.title}</span>}
      action={state.status === "ready" ? <Chip>{DESK.ai.by(state.s.model)}</Chip> : undefined}>
      {state.status === "off" && <Notice>{DESK.ai.off}</Notice>}
      {state.status === "failed" && <Notice tone="warn">{DESK.ai.failed}</Notice>}
      {(state.status === "loading" || state.status === "preparing") && <div className="flex flex-col gap-2"><span className="text-[13px] text-muted-foreground">{DESK.ai.thinking}</span><Skeleton className="h-16 w-full" /></div>}
      {state.status === "ready" && <Body s={state.s} onAdopt={() => adopt(state.s)} />}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] leading-5 text-muted-foreground">{DESK.ai.note}</span>
        {state.status !== "loading" && <Button variant="ghost" size="sm" onClick={ask}>{state.status === "idle" ? DESK.ai.get : DESK.ai.again}</Button>}
      </div>
    </Panel>
  );
}

function Body({ s, onAdopt }: { s: Suggestion; onAdopt: () => void }) {
  const r = s.intent ? replyOf(s.intent) : undefined;
  return (
    <div className="surface flex flex-col gap-3 border-[oklch(0.8_0.07_255)] p-4">
      {r ? (
        <span className="flex items-start gap-3 text-[14px] text-foreground"><span className="mono mt-0.5 text-muted-foreground">{r.code}</span>{r.title}</span>
      ) : <span className="text-[14px]">{DESK.ai.noIntent}</span>}
      {s.dispatch && s.guard && <span className="text-[13px] text-foreground">{DESK.ai.dispatch(s.guard.name)}</span>}
      <List title={DESK.ai.reasons} items={s.reasons} />
      <List title={DESK.ai.risks} items={s.risks} />
      <Trace steps={s.steps} ms={s.ms} />
      {r && <Button onClick={onAdopt}>{s.dispatch && s.guard ? DESK.ai.adoptDispatch(s.guard.name) : DESK.ai.adopt}</Button>}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{title}</span>
      <ul className="flex flex-col gap-1 text-[13px] leading-5">{items.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />{x}</li>)}</ul>
    </div>
  );
}

// What the model looked at, in order, with each step's time — a small waterfall.
function Trace({ steps, ms }: { steps: Step[]; ms: number }) {
  if (!steps.length) return null;
  const max = Math.max(1, ...steps.map((x) => x.ms));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex justify-between"><span className="label">{DESK.ai.trace}</span><span className="label num">{DESK.ai.total(ms)}</span></span>
      {steps.map((x, i) => (
        <span key={`${x.tool}-${i}`} className="grid grid-cols-[110px_minmax(0,1fr)_44px] items-center gap-2 text-[12px]">
          <span className="truncate text-muted-foreground">{DESK.ai.tools[x.tool] ?? x.tool}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-secondary"><span className={`block h-full rounded-full ${x.tool === "model" ? "bg-[oklch(0.66_0.14_255)]" : "bg-[oklch(0.72_0.16_145)]"}`} style={{ width: `${Math.max(4, (x.ms / max) * 100)}%` }} /></span>
          <span className="num text-right text-muted-foreground">{x.ms}ms</span>
        </span>
      ))}
    </div>
  );
}
