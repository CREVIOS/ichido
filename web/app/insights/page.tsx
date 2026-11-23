"use client";
import { useCallback, useState } from "react";
import { ChevronDown, CalendarDays, Code, Sparkles } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { AppShell, Notice } from "@/components/kit";
import { openAssistant, useAssistantEnabled } from "@/components/assistant";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { shiftCaption, shiftOutcomes, ASSISTANT, INSIGHTS, shiftReadError, staffError } from "@/content/catalogue";
import { FrontlineMetrics, METRICS, type Insights, type MetricKey } from "./metrics";

const PERIODS = [0, 7, 14, 30];

export default function InsightsPage() {
  return <StaffGate need="insights:read" title={INSIGHTS.title}>{(me) => <Board me={me} />}</StaffGate>;
}

function Board({ me }: { me: Me }) {
  const [days, setDays] = useState(PERIODS[0]);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<MetricKey>("daily");
  const load = useCallback(async (signal: AbortSignal) => {
    const r = await sb().rpc("shift_insights",{ p_days:days }).abortSignal(signal);
    if (signal.aborted) return;
    setError(r.error ? shiftReadError(INSIGHTS.period(days),new Date(),staffError(r.error.message)) : "");
    if (r.data) setData({ ...r.data,targets:{ no_reply:r.data.target } });
  },[days]);
  useLive(["desk","reply","caller_card","case_event","field_job"],load);
  const m = METRICS[sel];

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />} crumb={INSIGHTS.title} title={INSIGHTS.metrics[sel].title} actions={<AskButton />}>
      <div className="grid min-h-full lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex min-w-0 gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:px-5 lg:py-6">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setSel(k)} aria-pressed={k === sel}
              className={cn("flex min-h-11 shrink-0 flex-col justify-center gap-2 rounded-lg px-4 py-2 text-left lg:min-h-20", k === sel ? "bg-accent font-medium" : "hover:bg-muted")}>
              <span className="flex items-center gap-1.5 text-[13px] text-foreground">{INSIGHTS.metrics[k].title}</span>
              <span className="hidden flex-1 flex-col justify-center lg:flex">{data?.period === days ? METRICS[k].card(data) : null}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-6 p-5 lg:sticky lg:top-0 lg:self-start lg:p-8">
          {error && <Notice tone="warn">{error}</Notice>}

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

          </div>
          {data && <p>{shiftCaption(data)}</p>}
          {data?.period === days && <><p>{shiftOutcomes(data)}</p>{m.detail(data)}{data.frontline && <FrontlineMetrics data={data.frontline} />}</>}
          <p className="mt-auto pt-6 text-[12px] text-muted-foreground">{INSIGHTS.privacy}</p>
        </div>
      </div>
    </AppShell>
  );
}

function FilterChip({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-11 items-center divide-x rounded-md border bg-card text-[13px] text-muted-foreground">
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
