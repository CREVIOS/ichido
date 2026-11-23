"use client";
import { useCallback, useState } from "react";
import { ChartLine, ChevronDown, CalendarDays, Code, GripVertical, Sparkles } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Notice } from "@/components/kit";
import { openAssistant, useAssistantEnabled } from "@/components/assistant";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ASSISTANT, INSIGHTS, staffError } from "@/content/catalogue";
import { METRICS, type Insights, type MetricKey } from "./metrics";

const PERIODS = [7, 14, 30];

export default function InsightsPage() {
  return <StaffGate need="insights:read" title={INSIGHTS.title}>{(me) => <Board me={me} />}</StaffGate>;
}

function Board({ me }: { me: Me }) {
  const [days, setDays] = useState(PERIODS[1]);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<MetricKey>("daily");
  const load = useCallback(async () => {
    const [main, ratings, bot, t, ops, packs] = await Promise.all([
      sb().rpc("insights", { p_days: days }), sb().rpc("insights_ratings", { p_days: days }), sb().rpc("insights_bot", { p_days: days }),
      sb().schema("ichido").from("sla_target").select("reason, seconds"),  // operators only; managers see no target line
      sb().rpc("insights_ops", { p_days: days }), sb().rpc("insights_packs", { p_days: days }),
    ]);
    const error = main.error ?? ratings.error ?? bot.error ?? ops.error ?? packs.error;
    const targets = Object.fromEntries(((t.data ?? []) as { reason: string; seconds: number }[]).map((r) => [r.reason, r.seconds]));
    if (error) setError(staffError(error.message)); else { setError(""); setData({ ...(main.data as Insights), ratings: ratings.data ?? {}, bot: bot.data, targets, ops: ops.data, packs: packs.data ?? {} }); }
  }, [days]);
  useLive(["desk"], load);
  const m = METRICS[sel];

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} crumb={INSIGHTS.title} title={INSIGHTS.metrics[sel].title} actions={<AskButton />}>
      <div className="grid min-h-full lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5 border-b bg-background/60 p-4 lg:border-r lg:border-b-0">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={k === sel}
              className={cn("flex min-h-36 flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-shadow", k === sel ? "border-[oklch(0.8_0.07_255)] ring-3 ring-[oklch(0.8_0.07_255/0.25)]" : "hover:border-foreground/15")}>
              <span className="flex items-center gap-1.5 text-[13px] text-foreground"><GripVertical className="size-3.5 stroke-[1.5] text-faint" />{INSIGHTS.metrics[k].title}</span>
              <span className="flex flex-1 flex-col justify-center">{data ? METRICS[k].card(data) : null}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-6 p-5 lg:sticky lg:top-0 lg:self-start lg:p-8">
          {error && <Notice tone="warn">{error}</Notice>}
          <span className="flex items-center gap-2 text-[13px] text-foreground"><ChartLine className="size-4 stroke-[1.5]" />{INSIGHTS.title} / {INSIGHTS.metrics[sel].title}</span>
          <h2 className="text-[26px] leading-tight tracking-[-0.03em]">{INSIGHTS.metrics[sel].title}</h2>
          <div className="grid gap-3 border-b pb-6 text-[14px] sm:grid-cols-[100px_minmax(0,1fr)]">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Code className="size-3.5 stroke-[1.5]" />{INSIGHTS.definition}</span>
            <span className="leading-6 text-foreground">{INSIGHTS.metrics[sel].def}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterChip icon={<CalendarDays className="size-3.5 stroke-[1.5]" />} label={INSIGHTS.range}>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1 px-2 text-foreground">{INSIGHTS.period(days)}<ChevronDown className="size-3 stroke-[1.5]" /></DropdownMenuTrigger>
                <DropdownMenuContent>{PERIODS.map((p) => <DropdownMenuItem key={p} onClick={() => setDays(p)}>{INSIGHTS.period(p)}</DropdownMenuItem>)}</DropdownMenuContent>
              </DropdownMenu>
            </FilterChip>
            <FilterChip icon={<ChartLine className="size-3.5 stroke-[1.5]" />} label={INSIGHTS.interval}><span className="px-2 text-foreground">{INSIGHTS.everyDay}</span></FilterChip>
          </div>
          {data && m.detail(data)}
          <p className="mt-auto pt-6 text-[12px] text-muted-foreground">{INSIGHTS.privacy}</p>
        </div>
      </div>
    </AppShell>
  );
}

function FilterChip({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center divide-x rounded-md border bg-card text-[13px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 px-2">{icon}{label}</span>
      {children}
    </span>
  );
}

// Ask Ichido about these figures (hidden when the server has no model).
function AskButton() {
  if (!useAssistantEnabled()) return null;
  return <Button variant="ghost" size="sm" onClick={openAssistant}><Sparkles className="stroke-[1.5]" />{ASSISTANT.title}</Button>;
}
